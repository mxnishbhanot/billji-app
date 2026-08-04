import { create, isAxiosError } from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { getTrustedDeviceToken } from '@/store/trustedDevice';
import { deviceLabel } from '@/utils/deviceInfo';
import { ApiParams, AuthSession, RequiredPlan } from '@/types';

const SIGNED_OUT_MESSAGE = 'You were signed out. This may be because you signed out this device from another phone, or your session expired. Please sign in again.';

const devHost = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || devHost;
export const api = create({ baseURL: apiBaseUrl, timeout: 20000 });
const refreshApi = create({ baseURL: apiBaseUrl, timeout: 20000 });
let refreshPromise: Promise<AuthSession> | null = null;

const removeEmptyParams = (params: ApiParams = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined));

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (deviceLabel) config.headers['X-Device-Name'] = deviceLabel;
  // Lets the backend skip 2FA on login for a device the user chose to remember.
  const trustedDevice = getTrustedDeviceToken();
  if (trustedDevice) config.headers['X-Trusted-Device'] = trustedDevice;
  if (config.params) config.params = removeEmptyParams(config.params as ApiParams);
  return config;
});

// /auth/refresh uses its own axios instance (no interceptors), so attach the device
// label here too — keeps the stored session's device name fresh on token refresh.
refreshApi.interceptors.request.use((config) => {
  if (deviceLabel) config.headers['X-Device-Name'] = deviceLabel;
  return config;
});

/**
 * A refusal for billing reasons, not permission ones.
 *
 * The backend answers 402 (never 403) when a plan does not include a feature or a limit is spent,
 * so the two cases can never be confused: 403 means "you can't", 402 means "the business hasn't
 * bought it". Callers that want the upgrade sheet check `isPaywallError`; everything else keeps
 * treating it as a normal axios error and shows `apiErrorMessage`.
 */
export class PaywallError extends Error {
  readonly code: PaywallCode;
  readonly feature: string | null;
  readonly metric: string | null;
  readonly limit: number | null;
  readonly used: number | null;
  readonly currentPlan: string | null;
  readonly requiredPlans: RequiredPlan[];

  constructor(message: string, details: PaywallDetails) {
    super(message);
    this.name = 'PaywallError';
    this.code = details.code;
    this.feature = details.feature ?? null;
    this.metric = details.metric ?? null;
    this.limit = details.limit ?? null;
    this.used = details.used ?? null;
    this.currentPlan = details.currentPlan ?? null;
    this.requiredPlans = details.requiredPlans ?? [];
  }
}

type PaywallCode = 'FEATURE_NOT_IN_PLAN' | 'LIMIT_REACHED' | 'SUBSCRIPTION_EXPIRED';

type PaywallDetails = {
  code: PaywallCode;
  feature?: string | null;
  metric?: string | null;
  limit?: number | null;
  used?: number | null;
  currentPlan?: string | null;
  requiredPlans?: RequiredPlan[];
};

export const isPaywallError = (error: unknown): error is PaywallError => error instanceof PaywallError;

api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

  // 402 is the billing envelope. Converted once, here, so no screen has to know the status code or
  // dig through `response.data.details` to show an upgrade prompt.
  if (error.response?.status === 402) {
    const data = error.response.data as { message?: string; details?: PaywallDetails } | undefined;
    if (data?.details?.code) {
      return Promise.reject(new PaywallError(data.message || 'Your plan does not include this', data.details));
    }
  }

  if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      originalRequest._retry = true;
      try {
        refreshPromise ??= refreshApi.post<AuthSession>('/auth/refresh', { refreshToken }).then((res) => res.data).finally(() => { refreshPromise = null; });
        const session = await refreshPromise;
        await useAuthStore.getState().setSession(session);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${session.accessToken || session.token}`;
        return api(originalRequest);
      } catch {
        await useAuthStore.getState().logout(SIGNED_OUT_MESSAGE);
      }
    } else {
      await useAuthStore.getState().logout(SIGNED_OUT_MESSAGE);
    }
  }

  return Promise.reject(error);
});

export const apiErrorMessage = (error: unknown, fallback = 'Something went wrong') => {
  if (isPaywallError(error)) return error.message;
  if (isAxiosError(error)) {
    const data = error.response?.data as { details?: { msg?: string }[]; message?: string } | undefined;
    return data?.details?.[0]?.msg || data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
