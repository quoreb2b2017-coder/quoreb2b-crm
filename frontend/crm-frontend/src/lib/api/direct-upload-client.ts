import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from '@/lib/constants/api-url';
import { useAuthStore } from '@/store/auth.store';
import { DEFAULT_API_TIMEOUT_MS } from '@/lib/api/client';

/** Axios client for direct EC2 uploads/polling — same 401 refresh as apiClient. */
export const directUploadClient = axios.create({
  withCredentials: true,
});

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken ?? localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().refreshToken ?? localStorage.getItem('refreshToken');
}

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null =
  null;

async function refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const { data } = await axios.post(`${getApiBaseUrl()}/auth/refresh`, { refreshToken }, {
        timeout: DEFAULT_API_TIMEOUT_MS,
      });
      const tokens = (data.data ?? data) as { accessToken: string; refreshToken: string };
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);
      useAuthStore.setState({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
      });
      return tokens;
    } catch {
      useAuthStore.getState().clearAuth();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

directUploadClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

directUploadClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const tokens = await refreshAccessToken();
      if (tokens) {
        original.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return directUploadClient(original);
      }
    }
    return Promise.reject(error);
  },
);
