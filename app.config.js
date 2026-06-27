// Dynamic Expo config.
//
// Everything static still lives in app.json — Expo loads it and passes it here
// as `config`. We only override the Firebase `google-services.json` location so
// EAS Build can supply it as a *file environment variable* (the file is
// gitignored, so it is never part of the git upload EAS builds from).
//
// On EAS Build: the `GOOGLE_SERVICES_JSON` file env var is materialised to a
// temp path and exposed via process.env.GOOGLE_SERVICES_JSON — we point the
// config at it. Locally (prebuild / dev), that var is unset, so we fall back to
// the file in the project root.
//
// Manage the EAS value with:
//   eas env:create --name GOOGLE_SERVICES_JSON --type file \
//     --value ./google-services.json --environment preview --visibility secret
module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || "./google-services.json";

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
    },
  };
};
