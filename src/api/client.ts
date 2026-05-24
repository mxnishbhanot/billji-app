import { create, isAxiosError } from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '@/store/authStore';

const devHost = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || devHost;
export const api = create({ baseURL: apiBaseUrl, timeout: 20000 });

const removeEmptyParams = (params: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined));

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.params) config.params = removeEmptyParams(config.params as Record<string, unknown>);
  return config;
});

api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) void useAuthStore.getState().logout();
  return Promise.reject(error);
});

export const apiErrorMessage = (error: unknown, fallback = 'Something went wrong') => {
  if (isAxiosError(error)) {
    const data = error.response?.data as { details?: { msg?: string }[]; message?: string } | undefined;
    return data?.details?.[0]?.msg || data?.message || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};
