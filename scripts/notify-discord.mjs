#!/usr/bin/env node
// Post a "new dev build" message to Discord via webhook.
// Includes the install/download link + release notes (commit subjects
// since the previous preview build tag) so testers know what to test.
//
// Usage:
//   node scripts/notify-discord.mjs --platform android --profile preview
//
// Env:
//   DISCORD_WEBHOOK_URL  (required) — channel webhook
//   EXPO_TOKEN           (required) — to query the latest build
//   GITHUB_RUN_NUMBER    (optional) — used to label/tag the build

import { execFileSync } from "node:child_process";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const platform = arg("platform", "android");
const profile = arg("profile", "preview");
const webhook = process.env.DISCORD_WEBHOOK_URL;
const runNumber = process.env.GITHUB_RUN_NUMBER || "";

if (!webhook) {
  console.error("DISCORD_WEBHOOK_URL not set — skipping Discord notify.");
  process.exit(0); // non-fatal: don't fail the build over a notification
}

const eas = process.platform === "win32" ? "eas.cmd" : "eas";

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim();
}

// --- newest finished build for this platform/profile ---
let build;
try {
  const raw = sh(eas, [
    "build:list",
    "--platform", platform,
    "--build-profile", profile,
    "--status", "finished",
    "--limit", "1",
    "--json",
    "--non-interactive",
  ]);
  const arr = JSON.parse(raw);
  build = Array.isArray(arr) ? arr[0] : null;
} catch {
  console.error("Could not list builds — skipping notify.");
  process.exit(0);
}

if (!build) {
  console.error("No finished build found — skipping notify.");
  process.exit(0);
}

const downloadUrl =
  build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || build.buildUrl || null;
const pageUrl =
  build.id && build.project?.slug && build.project?.ownerAccount?.name
    ? `https://expo.dev/accounts/${build.project.ownerAccount.name}/projects/${build.project.slug}/builds/${build.id}`
    : null;
const version = build.appVersion || "?";
const versionCode = build.appBuildVersion ? ` (${build.appBuildVersion})` : "";

// --- release notes: commits since previous preview tag ---
const TAG_PREFIX = `preview-${platform}-`;
let range = "";
try {
  const lastTag = sh("git", ["describe", "--tags", "--abbrev=0", "--match", `${TAG_PREFIX}*`]);
  if (lastTag) range = `${lastTag}..HEAD`;
} catch {
  // no prior tag — fall back to recent history below
}

let notes;
try {
  const args = ["log", "--no-merges", "--pretty=- %s"];
  if (range) args.push(range);
  else args.push("-15");
  notes = sh("git", args);
} catch {
  notes = "";
}
if (!notes) notes = "_No commit notes available._";
// Discord embed description cap is 4096; keep it well under.
if (notes.length > 1800) notes = notes.slice(0, 1800) + "\n…";

// --- build the message ---
const linkLine = downloadUrl
  ? `**[⬇️ Download / install APK](${downloadUrl})**`
  : pageUrl
    ? `**[Open build page](${pageUrl})**`
    : "_Build link unavailable._";

const embed = {
  title: `📱 New Billji ${profile} build — v${version}${versionCode}`,
  description: `${linkLine}\n\n**What to test:**\n${notes}`,
  color: 0xfc7a0e,
  footer: { text: runNumber ? `CI run #${runNumber} · ${platform}/${profile}` : `${platform}/${profile}` },
};

const res = await fetch(webhook, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ embeds: [embed] }),
});

if (!res.ok) {
  console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  process.exit(0); // non-fatal
}

console.log("Posted build notice to Discord.");

// --- tag this build so the next run diffs from here ---
if (runNumber) {
  const tag = `${TAG_PREFIX}${runNumber}`;
  try {
    sh("git", ["tag", tag]);
    sh("git", ["push", "origin", tag]);
    console.log(`Tagged ${tag}.`);
  } catch {
    console.error(`Could not push tag ${tag} (non-fatal).`);
  }
}
