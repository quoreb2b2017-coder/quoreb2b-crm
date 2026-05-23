import apiClient from './client';

export const authService = {
  login: (credentials: { email: string; password: string }) =>
    apiClient.post('/auth/login', credentials),

  loginByEmployeeId: (credentials: { employeeId: string; password: string }) =>
    apiClient.post('/auth/login/employee-id', credentials),

  sendOtp: (body: { email: string }) => apiClient.post('/auth/otp/send', body),

  verifyOtp: (body: { email: string; otp: string }) =>
    apiClient.post('/auth/otp/verify', body),

  logout: (refreshToken: string, reason?: string) =>
    apiClient.post('/auth/logout', { refreshToken, reason }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiClient.post('/auth/change-password', body),
};
