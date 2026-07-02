import apiClient from './client';

/** Login/OTP — allow extra time when the API is busy (e.g. large master-data import). */
const AUTH_TIMEOUT_MS = 120_000;

export const authService = {
  login: (credentials: { email: string; password: string }) =>
    apiClient.post('/auth/login', credentials, { timeout: AUTH_TIMEOUT_MS }),

  loginByEmployeeId: (credentials: { employeeId: string; password: string }) =>
    apiClient.post('/auth/login/employee-id', credentials, { timeout: AUTH_TIMEOUT_MS }),

  sendOtp: (body: { email: string }) =>
    apiClient.post('/auth/otp/send', body, { timeout: AUTH_TIMEOUT_MS }),

  verifyOtp: (body: { email: string; otp: string }) =>
    apiClient.post('/auth/otp/verify', body, { timeout: AUTH_TIMEOUT_MS }),

  logout: (refreshToken: string, reason?: string) =>
    apiClient.post('/auth/logout', { refreshToken, reason }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiClient.post('/auth/change-password', body),
};
