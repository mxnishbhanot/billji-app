import { ReactNode, useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';
import { useOnboardingAnchors } from './OnboardingProvider';

type Props = ViewProps & {
  anchorId: string;
  children: ReactNode;
};

/** Registers a measurable target for coach-mark tours. */
export function TourAnchor({ anchorId, children, style, ...rest }: Props) {
  const ref = useRef<View>(null);
  // Anchor registry is its own stable context, so this component doesn't re-render
  // when onboarding progress mutates (which happens on every tour step).
  const anchors = useOnboardingAnchors();
  const register = anchors?.registerAnchor;
  const unregister = anchors?.unregisterAnchor;

  useEffect(() => {
    if (!register || !unregister) return undefined;
    register(anchorId, ref);
    return () => unregister(anchorId);
  }, [anchorId, register, unregister]);

  return (
    <View ref={ref} collapsable={false} style={style} {...rest}>
      {children}
    </View>
  );
}
