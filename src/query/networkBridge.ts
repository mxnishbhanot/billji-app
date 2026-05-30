import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

let unsubscribe: (() => void) | null = null;

export const setupNetworkBridge = () => {
  if (unsubscribe) return unsubscribe;
  unsubscribe = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(Boolean(state.isConnected && (state.isInternetReachable ?? true)));
  });
  return unsubscribe;
};
