/**
 * Web: CanvasKit has to be in memory before any Skia render, so the chart on the dashboard waits
 * for this. Only ever bundled for web — Metro resolves the `.web` extension, and the native build
 * gets the no-op in skiaWeb.ts instead.
 *
 * ponytail: WASM from the jsdelivr CDN — self-host by copying canvaskit-wasm/bin/full if offline web
 * matters.
 */
export const loadSkiaWeb = async (): Promise<void> => {
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  await LoadSkiaWeb({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/${file}`
  });
};
