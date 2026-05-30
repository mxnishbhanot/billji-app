import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation; calling it on web throws
// "ExpoSecureStore.default.*WithKeyAsync is not a function". Use localStorage on
// web and SecureStore on native so session persistence works everywhere.
const isWeb = Platform.OS === 'web';

const webStorage = {
  getItem: (key: string) => (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  }
};

export const sessionStorage = {
  getItemAsync: async (key: string) => (isWeb ? webStorage.getItem(key) : SecureStore.getItemAsync(key)),
  setItemAsync: async (key: string, value: string) => {
    if (isWeb) return webStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (isWeb) return webStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  }
};
