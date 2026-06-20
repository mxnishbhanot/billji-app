import { create, isAxiosError } from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { deviceLabel } from '@/utils/deviceInfo';
import { ApiParams, AuthSession } from '@/types';

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
  if (config.params) config.params = removeEmptyParams(config.params as ApiParams);
  return config;
});

// /auth/refresh uses its own axios instance (no interceptors), so attach the device
// label here too — keeps the stored session's device name fresh on token refresh.
refreshApi.interceptors.request.use((config) => {
  if (deviceLabel) config.headers['X-Device-Name'] = deviceLabel;
  return config;
});

api.interceptors.response.use((response) => response, async (error) => {
  const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

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
  if (isAxiosError(error)) {
    const data = error.response?.data as { details?: { msg?: string }[]; message?: string } | undefined;
    return data?.details?.[0]?.msg || data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
