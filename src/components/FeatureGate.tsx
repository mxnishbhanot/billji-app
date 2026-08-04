import type { ComponentType } from 'react';
import { Screen } from '@/components/Screen';
import { LockedFeatureBadge } from '@/components/LockedFeatureBadge';
import { useEntitlements } from '@/shared/hooks/useEntitlements';

/**
 * Wraps a screen so a plan that does not include it never renders it — and never fires the queries
 * the server would answer with 402.
 *
 * Applied at the navigator, not inside each screen, for two reasons: a screen keeps its own file
 * free of billing code, and the gate is one unconditional hook, so an upgrade swaps the whole child
 * in and out instead of changing a screen's hook order mid-life.
 *
 * The gated list mirrors exactly what the backend guards. A screen locked here that the server
 * allows would be a paywall we invented; a screen open here that the server refuses would be a
 * dead end the user walks into.
 */
export function withFeatureGate<P extends object>(feature: string, title: string, Component: ComponentType<P>) {
  return function GatedScreen(props: P) {
    const { isLocked } = useEntitlements();

    if (isLocked(feature)) {
      return (
        <Screen title={title}>
          <LockedFeatureBadge feature={feature} />
        </Screen>
      );
    }

    return <Component {...props} />;
  };
}
