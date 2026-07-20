import { ReactNode, useEffect, useRef } from 'react';
import { View, ViewProps } from 'react-native';
import { useOnboardingOptional } from './OnboardingProvider';

type Props = ViewProps & {
  anchorId: string;
  children: ReactNode;
};

/** Registers a measurable target for coach-mark tours. */
export function TourAnchor({ anchorId, children, style, ...rest }: Props) {
  const ref = useRef<View>(null);
  const onboarding = useOnboardingOptional();

  useEffect(() => {
    if (!onboarding) return undefined;
    onboarding.registerAnchor(anchorId, ref);
    return () => onboarding.unregisterAnchor(anchorId);
  }, [anchorId, onboarding]);

  return (
    <View ref={ref} collapsable={false} style={style} {...rest}>
      {children}
    </View>
  );
}
