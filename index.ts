import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Web: @shopify/react-native-skia (Victory chart) needs CanvasKit WASM loaded
// before any Skia render. Native links Skia at build time, so boot directly.
// ponytail: WASM from jsdelivr CDN — self-host by copying canvaskit-wasm/bin/full if offline web matters.
if (Platform.OS === 'web') {
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  LoadSkiaWeb({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/${file}`
  }).then(() => {
    registerRootComponent(require('./App').default);
  });
} else {
  registerRootComponent(require('./App').default);
}
