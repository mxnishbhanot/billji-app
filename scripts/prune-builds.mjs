#!/usr/bin/env node
// Prune EAS builds: keep the newest N finished builds for a platform/profile,
// delete the rest. Runs `eas build:list` + `eas build:delete`.
//
// Usage:
//   node scripts/prune-builds.mjs --platform android --profile preview --keep 2
//
// Requires EXPO_TOKEN in env (or an interactive `eas login`).

import { execFileSync } from "node:child_process";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const platform = arg("platform", "android");
const profile = arg("profile", "preview");
const keep = Number.parseInt(arg("keep", "2"), 10);

if (!Number.isInteger(keep) || keep < 0) {
  console.error(`Invalid --keep value: ${arg("keep")}`);
  process.exit(1);
}

const eas = process.platform === "win32" ? "eas.cmd" : "eas";

function run(args) {
  return execFileSync(eas, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

console.log(`Listing finished ${platform}/${profile} builds...`);

// Pull a generous window; newest first is the EAS default ordering.
const raw = run([
  "build:list",
  "--platform", platform,
  "--build-profile", profile,
  "--status", "finished",
  "--limit", "50",
  "--json",
  "--non-interactive",
]);

let builds;
try {
  builds = JSON.parse(raw);
} catch {
  console.error("Could not parse `eas build:list --json` output.");
  process.exit(1);
}

if (!Array.isArray(builds)) {
  console.error("Unexpected build:list payload (expected array).");
  process.exit(1);
}

// Sort newest -> oldest defensively (createdAt is ISO 8601).
builds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const stale = builds.slice(keep);

if (stale.length === 0) {
  console.log(`Nothing to prune. ${builds.length} build(s) <= keep=${keep}.`);
  process.exit(0);
}

console.log(`Keeping ${Math.min(keep, builds.length)}, deleting ${stale.length}.`);

for (const b of stale) {
  console.log(`Deleting ${b.id} (${b.createdAt}, v${b.appVersion ?? "?"})`);
  run(["build:delete", b.id, "--non-interactive"]);
}

console.log("Prune complete.");
