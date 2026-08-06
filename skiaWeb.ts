/**
 * Native: Skia is linked at build time, so there is nothing to load.
 *
 * This file exists as the native half of a platform-resolved pair. The web bootstrap used to sit
 * behind `if (Platform.OS === 'web')` in index.ts, which does not work: Metro's dependency graph is
 * static, so a literal `require('@shopify/react-native-skia/lib/module/web')` was collected into the
 * *Android* bundle too — pulling in canvaskit-wasm, which imports the Node `fs` module and fails the
 * bundle outright. A runtime branch cannot exclude a module from a static graph; a platform
 * extension can.
 */
export const loadSkiaWeb = async (): Promise<void> => undefined;
