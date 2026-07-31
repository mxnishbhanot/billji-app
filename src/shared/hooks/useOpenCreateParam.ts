import { useEffect, useRef } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';

/**
 * Opens a list screen's create form when it is navigated to with `{ openCreate: true }`
 * — the quick-actions sheet uses this to create from any screen. The param is cleared
 * immediately so returning to an already-mounted tab does not reopen the form.
 */
export function useOpenCreateParam(open: () => void) {
  const navigation = useNavigation();
  const route = useRoute();
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  const requested = Boolean((route.params as { openCreate?: boolean } | undefined)?.openCreate);

  useEffect(() => {
    if (!requested) return;
    navigation.setParams({ openCreate: undefined } as never);
    openRef.current();
  }, [requested, navigation]);
}
