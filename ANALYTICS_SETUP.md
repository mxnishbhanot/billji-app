# Analytics + Crash Reporting — Setup (manual steps)

Code is wired. These steps need accounts/consoles/native builds I can't do from here.
Until they're done the app runs fine — the analytics facade no-ops when native modules
or DSN are absent (Expo Go / web / missing config).

## 1. Install native deps (pins SDK-56-correct versions)
```
cd mobile
npx expo install @react-native-firebase/app @react-native-firebase/analytics @sentry/react-native expo-build-properties
```
(The versions in package.json are placeholders; `expo install` overwrites them.)

## 2. Firebase project
1. Firebase console → create/select project → add Android app `com.billji.mobile`,
   download `google-services.json` → place at `mobile/google-services.json`.
2. Add iOS app `com.billji.mobile`, download `GoogleService-Info.plist`
   → place at `mobile/GoogleService-Info.plist`.
   (app.json already references both via `android.googleServicesFile` / `ios.googleServicesFile`.)

## 3. Sentry project
1. Create a React Native project in Sentry. Copy its **DSN**.
2. In `mobile/eas.json` replace `REPLACE_WITH_SENTRY_DSN` (all profiles) with the DSN
   (DSN is public-safe to embed).
3. In `mobile/app.json` plugins, replace `REPLACE_WITH_SENTRY_ORG` / `REPLACE_WITH_SENTRY_PROJECT`.
4. Create a Sentry auth token (project:releases scope) and add as an EAS secret for
   source-map upload:
   ```
   eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <token>
   ```

## 4. Build (NO OTA — native modules changed)
```
eas build --profile development --platform android
```
Smoke-test it BOOTS with New Architecture (RN 0.85 + newArch + RN Firebase + Sentry).
This is the highest-risk step — verify before relying on anything else.
Test an iOS build early too: `useFrameworks: static` can clash with existing native pods
(react-native-image-crop-picker, react-native-webview).

## 5. Verify
- Firebase console → DebugView: create + share an invoice → see `invoice_created` /
  `invoice_shared` with params (`item_count`, `channel`, ...). Confirm NO PII.
- Sentry: trigger a test error → confirm symbolicated stack trace.
- Settings → "Usage analytics" toggle OFF → DebugView goes quiet.
- After ~24-48h with testers: DAU/retention populate in Firebase automatically.

## 6. Before public listing
- Update privacy policy + Play Store / App Store data-safety forms to declare
  analytics + crash collection.

## Master switch — OFF until launch
`EXPO_PUBLIC_ANALYTICS_ENABLED` (eas.json) gates everything:
- `development` = `"false"`, `preview` = `"false"` → analytics + Sentry fully dormant.
  Build/test all you want during dev; nothing reaches Firebase/Sentry.
- `production` = `"true"` → live. This is the only profile that sends data.

So: install deps + add Firebase/Sentry config now, keep building on dev/preview with
zero analytics noise. When you go live, the production build flips it on automatically —
no code change. (To test the pipeline end-to-end before launch, temporarily set the
preview profile's flag to `"true"`, build, verify in DebugView, then set back.)

## Notes
- Events captured: `invoice_created`, `invoice_shared` (channel: pdf|whatsapp|email).
- DAU/retention come free from Firebase session tracking + `setUserId`.
- All event params are counts/enums/booleans only — never names/amounts/GST/PAN/notes.
- The admin-panel "owned data" track (backend aggregation endpoints over existing
  OutboxEvent/AuditLog) is intentionally deferred until real users — see the plan file.
- Swap point: every call site imports from `src/services/analytics.ts` only.
