import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { getApiBaseUrl } from '@/lib/constants/api-url';

/** Default API timeout — large imports use per-request overrides. */
export const DEFAULT_API_TIMEOUT_MS = 30_000;

const apiClient = axios.create({
  timeout: DEFAULT_API_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.baseURL = getApiBaseUrl();
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null =
  null;

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken ?? localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().refreshToken ?? localStorage.getItem('refreshToken');
}

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      const tokens = await refreshAccessToken();
      if (tokens) {
        original.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return apiClient(original);
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
