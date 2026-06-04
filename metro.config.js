// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web ships a WebAssembly build (wa-sqlite). Metro must treat
// `.wasm` as a bundled asset, otherwise the web bundle fails to resolve
// `./wa-sqlite/wa-sqlite.wasm` and the screen using drafts (expo-sqlite) crashes.
config.resolver.assetExts.push('wasm');

// wa-sqlite uses SharedArrayBuffer, which the browser only exposes in a
// cross-origin-isolated context. Send the required COOP/COEP headers from the
// dev server so the wasm worker can initialize on web.
config.server = config.server || {};
const originalEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const withHeaders = (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return middleware(req, res, next);
  };
  return originalEnhanceMiddleware ? originalEnhanceMiddleware(withHeaders, server) : withHeaders;
};

module.exports = config;
