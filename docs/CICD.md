# BillJi — CI/CD (EAS Android Preview)

Production CI/CD for the BillJi Expo app. One **EAS Android preview build per week**,
triggered only when code reaches `main`, with a Discord notification on success/failure.

> Git root is the `mobile/` directory, so all paths below are relative to `mobile/`.

---

## 1. Branch strategy

```
feature/*  ──merge──▶  staging  ──manual merge (weekend)──▶  main  ──push──▶  EAS build ──▶ Discord
```

| Branch      | Purpose                              | Triggers a build? |
| ----------- | ------------------------------------ | ----------------- |
| `feature/*` | Individual features                  | ❌ No             |
| `staging`   | Integration branch for completed work| ❌ No             |
| `main`      | Production-ready code only           | ✅ Yes (on push)  |
| Pull requests |                                    | ❌ No             |

Developers merge into `staging` all week — **no builds**. On the weekend you verify
`staging`, then manually merge `staging → main`. That single push to `main` is the
only thing that spends an EAS build. ~1 build/week.

> `staging` does not exist yet. Create it once: `git checkout main && git checkout -b staging && git push -u origin staging`.

---

## 2. Workflows

| File                                         | Trigger                  | What it does                          |
| -------------------------------------------- | ------------------------ | ------------------------------------- |
| `.github/workflows/android-preview.yml`      | `push` to `main` only    | Weekly preview build + Discord notify |
| `.github/workflows/manual-build.yml`         | `workflow_dispatch`      | On-demand build (pick profile) + notify |
| `.github/workflows/_reusable-eas-build.yml`  | `workflow_call` (internal) | The shared build+notify logic       |

Both trigger workflows are thin and call the reusable workflow — change the build
logic in one place. The reusable workflow:

1. **Validates secrets** (`scripts/check-secrets.sh`) — fails fast with a clear message.
2. Sets up **Node 20** with **npm cache**.
3. `npm ci`.
4. Installs + authenticates **EAS CLI** via `expo/expo-github-action` (uses `EXPO_TOKEN`).
5. Runs **one** `eas build --profile preview --platform android --non-interactive --wait --json`.
6. Notifies **Discord** on success or failure (`scripts/notify-discord.mjs`).

`concurrency` is set so two builds never run at once and an in-flight build is
**not** cancelled (EAS minutes are paid).

> The previous `android-preview.yml` did a local Gradle APK build + GitHub Release.
> It has been replaced by the EAS cloud flow you requested. If you ever want the
> free local-Gradle path back to save EAS minutes, it's in git history.

---

## 3. GitHub Secrets

Set under **repo → Settings → Secrets and variables → Actions**.

| Secret                | Required | Used for                                                        |
| --------------------- | -------- | --------------------------------------------------------------- |
| `EXPO_TOKEN`          | ✅       | Non-interactive EAS auth. Create at <https://expo.dev/settings/access-tokens> on the **new** Expo account. |
| `DISCORD_WEBHOOK_URL` | ✅       | Discord channel webhook for notifications.                      |

`GITHUB_TOKEN` is provided automatically — no setup needed.

> **Firebase / `google-services.json`:** it's gitignored and EAS cloud builds only
> upload tracked files, so it must live on the Expo account, not in a GitHub secret.
> Upload it as an EAS **file** environment variable on the new account:
> ```bash
> eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility secret
> ```
> Confirm `app.json` `android.googleServicesFile` resolves to it (Expo wires file
> env vars during build). Repeat for `production` if you build that profile.

---

## 4. Discord webhook setup

1. Discord → target server → **Server Settings → Integrations → Webhooks → New Webhook**.
2. Pick the channel (e.g. `#qa-builds`), name it (e.g. `BillJi CI`), **Copy Webhook URL**.
3. Paste it into the `DISCORD_WEBHOOK_URL` GitHub secret.

Message format — success:

```
✅ BillJi Weekly Android Preview Build

Branch: main
Built: 2026-06-27 10:00 UTC

Commit:
abc1234

Message:
Fixed invoice calculations

Build:
https://expo.dev/...

GitHub:
https://github.com/.../actions/runs/...

Ready for QA 🚀
```

Failure:

```
❌ BillJi Weekly Build Failed

Branch: main
When: 2026-06-27 10:00 UTC

Commit:
abc1234

Reason:
EAS build or a prior step failed. See the GitHub Actions logs.

GitHub Logs:
https://github.com/.../actions/runs/...
```

Notifications are best-effort: a webhook failure logs but never fails the build.

---

## 5. Infrastructure migration — replace checklist

Everything tying the repo to the **old personal Expo/Railway accounts** has been
replaced with `REPLACE_WITH_*` placeholders. Fill these once you have the new accounts:

### Expo

| File         | Key                                  | Placeholder                          |
| ------------ | ------------------------------------ | ------------------------------------ |
| `app.json`   | `expo.owner`                         | `REPLACE_WITH_EXPO_ACCOUNT_OWNER`    |
| `app.json`   | `expo.slug`                          | `REPLACE_WITH_EXPO_SLUG`             |
| `app.json`   | `expo.extra.eas.projectId`           | `REPLACE_WITH_EAS_PROJECT_ID`        |
| `app.json`   | `expo.plugins[@sentry].organization` | `REPLACE_WITH_SENTRY_ORG`            |
| `app.json`   | `expo.plugins[@sentry].project`      | `REPLACE_WITH_SENTRY_PROJECT`        |
| `eas.json`   | all profiles `EXPO_PUBLIC_SENTRY_DSN`| `REPLACE_WITH_SENTRY_DSN`            |
| `eas.json`   | all profiles `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `REPLACE_WITH_GOOGLE_WEB_CLIENT_ID` |

Recommended: run `eas init` on the new account — it sets `owner`, `slug`, and
`projectId` for you. Generate a fresh `EXPO_TOKEN` on the new account for CI.

### Railway

There is no `railway.json`/`railway.toml` in the repo — Railway is configured from
its dashboard. Only the **backend URL** is referenced in the mobile app:

| File          | Key                          | Placeholder                            |
| ------------- | ---------------------------- | -------------------------------------- |
| `eas.json`    | all profiles `EXPO_PUBLIC_API_BASE_URL` | `REPLACE_WITH_NEW_RAILWAY_API_BASE_URL` |
| `.env.example`| `EXPO_PUBLIC_API_BASE_URL`   | `REPLACE_WITH_NEW_RAILWAY_API_BASE_URL` |

Backend deploy steps (new Railway account): see `backend/README.md` → **Deploy**.
After deploying, set `EXPO_PUBLIC_API_BASE_URL` to `https://<new-service>.up.railway.app/api`.

### Google Sign-In

The old `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` was tied to the old project. Create new
OAuth credentials (and a new `google-services.json`) under the new Firebase/Google
Cloud project, then update the placeholders above and re-upload the EAS file env var.

### Orphaned file (outside this git repo)

`../.github/workflows/quality.yml` lives at the parent folder, **outside** the
`mobile/` git root, so GitHub never runs it. Left untouched. If you want quality
gates in CI, move it to `mobile/.github/workflows/`.

---

## 6. Quick start (after credentials are ready)

```bash
# 1. Fill all REPLACE_WITH_* placeholders (or run `eas init`).
# 2. Add GitHub secrets: EXPO_TOKEN, DISCORD_WEBHOOK_URL.
# 3. Upload google-services.json as an EAS file env var (see §3).
# 4. Create the staging branch (see §1).
# 5. Test the manual path first:
#      GitHub → Actions → "Manual Android Build" → Run workflow.
# 6. From then on: merge staging → main on the weekend → automatic weekly build.
```

---

## 7. Recommendations / future hardening

- **Pin action SHAs.** Replace `@v4`/`@v8` tags with commit SHAs for supply-chain safety.
- **Use EAS environment variables** for all non-secret public config too, so `eas.json`
  holds no values — cleaner per-environment overrides and no secrets in git.
- **Required status check:** make the existing quality gates (typecheck/lint/test) a
  required check on `staging` so only green code reaches `main`.
- **Auto-submit:** add `eas submit` on the `production` profile when you're ready to
  ship to the Play Store from the manual workflow.
- **Build budget alarm:** the weekly cadence already caps spend; add an EAS usage
  check or a monthly Discord summary if you want visibility.
- **`prune-builds.mjs`** (`npm run prune:builds`) trims old EAS builds — wire it into a
  scheduled workflow if build storage grows.
