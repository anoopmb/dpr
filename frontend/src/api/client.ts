import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth-store';
import { getCookie } from '@/utils/cookies';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (config.method && MUTATING_METHODS.has(config.method.toLowerCase())) {
    const csrfToken = getCookie('csrf_token');
    if (csrfToken) {
      config.headers.set('X-CSRF-Token', csrfToken);
    }
  }
  return config;
});

let refreshInFlight: Promise<unknown> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    const isRefreshEndpoint = originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retried || isRefreshEndpoint) {
      if (error.response?.status === 401) {
        useAuthStore.getState().clearUser();
      }
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    try {
      refreshInFlight ??= apiClient.post('/auth/refresh');
      await refreshInFlight;
      return apiClient(originalRequest);
    } catch {
      useAuthStore.getState().clearUser();
      return Promise.reject(error);
    } finally {
      refreshInFlight = null;
    }
  },
);
