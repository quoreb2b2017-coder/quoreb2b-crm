/** Shift login 9:00 AM US Eastern — on-time cutoff for attendance. */
export const SHIFT_LOGIN_TIME = '09:00';
export const SHIFT_LOGIN_LABEL = '9:00 AM';

/** Expected shift logout 3:30 AM US Eastern (next calendar day). */
export const SHIFT_LOGOUT_TIME = '03:30';

/** Full shift span including breaks (6:30 PM → 3:30 AM). */
export const DAILY_GROSS_TARGET_MINUTES = 9 * 60;

export const DAILY_GROSS_TARGET_LABEL = '9h';

/** 45m lunch + 2×15m tea — deducted from gross when no break punches logged. */
export const SCHEDULED_SHIFT_BREAK_MINUTES = 45 + 30;

/** 9h shift − 45m lunch − 2×15m tea = 7h 45m net working time. */
export const DAILY_NET_WORK_TARGET_MINUTES = 7 * 60 + 45;

export const DAILY_NET_WORK_TARGET_LABEL = '7h 45m';
