export type LoginPanel = 'admin' | 'db_admin' | 'employee';

export type UserRole = 'super_admin' | 'admin' | 'employee' | 'db_admin';

export interface User {
  id: string;
  email: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  permissions: string[];
  panel?: LoginPanel;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface IdLoginCredentials {
  employeeId: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: User;
  };
}

export interface AttendancePunchOnLogin {
  punchedIn: boolean;
  alreadyCheckedIn?: boolean;
  /** True when today's attendance already has checkout (EOD) — wait until next day */
  dayClosed?: boolean;
  isLate?: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  /** ISO timestamp — work timer starts from this moment */
  checkInAt?: string;
  checkOutAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
  sessionId?: string;
  attendancePunch?: AttendancePunchOnLogin;
  /** Gross work minutes already logged today (all prior sessions). */
  workTimeTodayGrossMinutes?: number;
}
