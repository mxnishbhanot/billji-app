#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Post a BillJi build notification to Discord via webhook.
//
// Driven entirely by environment variables so it works identically for the
// success and failure steps, and is reusable from any workflow.
//
// Env:
//   DISCORD_WEBHOOK_URL  (required) — channel webhook. If unset, exits 0 (no-op).
//   BUILD_STATUS         (required) — "success" | "failure".
//   APP_NAME             (optional) — defaults to "BillJi".
//   GIT_BRANCH           (optional) — branch name (github.ref_name).
//   GIT_SHA              (optional) — full commit SHA; trimmed to 7 chars.
//   COMMIT_MSG           (optional) — commit subject/body.
//   RUN_URL              (optional) — GitHub Actions run URL.
//   EAS_BUILD_JSON       (success)  — path to `eas build --json` output.
//   FAIL_REASON          (failure)  — short failure reason text.
//
// Notifications are best-effort: a webhook error logs but never fails the job
// (the build result itself already reflects success/failure).
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) {
  console.error("DISCORD_WEBHOOK_URL not set — skipping Discord notify.");
  process.exit(0);
}

const status = (process.env.BUILD_STATUS || "").toLowerCase();
const appName = process.env.APP_NAME || "BillJi";
const branch = process.env.GIT_BRANCH || "unknown";
const sha = (process.env.GIT_SHA || "").slice(0, 7) || "unknown";
const commitMsg = (process.env.COMMIT_MSG || "").trim() || "(no commit message)";
const runUrl = process.env.RUN_URL || "(run URL unavailable)";
const builtAt = new Date().toISOString().replace("T", " ").replace(/\..+/, " UTC");

// --- pull the build URL from the EAS --json result (success only) ----------
function readBuildUrl() {
  const path = process.env.EAS_BUILD_JSON;
  if (!path) return null;
  let builds;
  try {
    builds = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`Could not read/parse ${path} — build URL omitted.`);
    return null;
  }
  const build = Array.isArray(builds) ? builds[0] : builds;
  if (!build) return null;

  // Direct artifact (APK) download if EAS exposes it...
  const apk =
    build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl || null;

  // ...otherwise the Expo build detail page, constructed from the build's own
  // project metadata (NEVER a hardcoded account — works for any Expo account).
  const owner = build.project?.ownerAccount?.name;
  const slug = build.project?.slug;
  const page =
    owner && slug && build.id
      ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}`
      : null;

  return apk || page || null;
}

// --- compose the message ----------------------------------------------------
let content;
if (status === "success") {
  const buildUrl = readBuildUrl() || "(build URL unavailable)";
  content = [
    `✅ **${appName} Weekly Android Preview Build**`,
    ``,
    `Branch: ${branch}`,
    `Built: ${builtAt}`,
    ``,
    `Commit:`,
    sha,
    ``,
    `Message:`,
    commitMsg,
    ``,
    `Build:`,
    buildUrl,
    ``,
    `GitHub:`,
    runUrl,
    ``,
    `Ready for QA 🚀`,
  ].join("\n");
} else {
  const reason = (process.env.FAIL_REASON || "Unknown error.").trim();
  content = [
    `❌ **${appName} Weekly Build Failed**`,
    ``,
    `Branch: ${branch}`,
    `When: ${builtAt}`,
    ``,
    `Commit:`,
    sha,
    ``,
    `Reason:`,
    reason,
    ``,
    `GitHub Logs:`,
    runUrl,
  ].join("\n");
}

// Discord hard-caps message content at 2000 chars.
if (content.length > 1990) content = content.slice(0, 1985) + "\n…";

try {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    console.error(`Discord webhook failed: ${res.status} ${await res.text()}`);
    process.exit(0); // non-fatal
  }
  console.log(`Posted ${status} notification to Discord.`);
} catch (err) {
  // Network/DNS error etc. — never let a notification failure fail the job.
  console.error(`Discord webhook errored: ${err?.message || err}`);
  process.exit(0);
}
