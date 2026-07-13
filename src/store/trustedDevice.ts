import { sessionStorage as secureStorage } from '@/store/sessionStorage';

// Opaque per-device token proving this device already passed 2FA. It is sent as
// the X-Trusted-Device header on login so the backend can skip the second factor.
// Independent of the auth session: it survives logout (that is the whole point of
// "remember this device") and is only dropped when 2FA is disabled server-side or
// the token stops working. Cached in memory so the axios interceptor can read it
// synchronously; load it once at app start via loadTrustedDeviceToken().
const TRUSTED_DEVICE_KEY = 'billji-trusted-device';

let cached: string | null = null;

export const loadTrustedDeviceToken = async () => {
  try {
    cached = await secureStorage.getItemAsync(TRUSTED_DEVICE_KEY);
  } catch {
    cached = null;
  }
  return cached;
};

export const getTrustedDeviceToken = () => cached;

export const setTrustedDeviceToken = async (token: string) => {
  cached = token;
  await secureStorage.setItemAsync(TRUSTED_DEVICE_KEY, token);
};

export const clearTrustedDeviceToken = async () => {
  cached = null;
  await secureStorage.deleteItemAsync(TRUSTED_DEVICE_KEY);
};
