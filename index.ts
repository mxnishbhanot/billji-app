import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { loadSkiaWeb } from './skiaWeb';

// Web loads CanvasKit before the first Skia render; native links Skia at build time and resolves
// `./skiaWeb` to a no-op. The platform split has to be a module boundary rather than an
// `if (Platform.OS === 'web')` branch: Metro's graph is static, so the web-only require was being
// pulled into the Android bundle as well — see skiaWeb.ts.
void loadSkiaWeb().then(() => {
  registerRootComponent(require('./App').default);
});
