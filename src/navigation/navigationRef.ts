import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Navigate to a tour/checklist target, honoring nested tab stacks. */
export function navigateToTarget(target?: {
  tab?: string;
  screen: string;
  params?: Record<string, unknown>;
}) {
  if (!target || !navigationRef.isReady()) return;
  // Cast intentional: deep-linking across tab stacks isn't expressible in the typed API.
  if (target.tab) (navigationRef as any).navigate(target.tab, { screen: target.screen, params: target.params });
  else (navigationRef as any).navigate(target.screen, target.params);
}
