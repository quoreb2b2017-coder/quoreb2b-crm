import { todayDateKey, WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import type { LoginPanel } from '@/types/auth';

const PENDING_KEY = 'crm-pending-welcome';

export interface LoginWelcomePayload {
  name: string;
  panel: LoginPanel;
}

const DAILY_TIPS = [
  'Your dashboard is ready — have a productive day.',
  'Small steps today lead to big wins this week.',
  'Check your priorities and tackle what matters most.',
  'Stay focused — you have got this.',
  'A clear plan makes every task easier.',
  'Consistency beats intensity. Show up and deliver.',
  'Review your metrics and keep momentum going.',
  'Great work starts with showing up — you are here.',
];

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dailyTip(): string {
  const key = todayDateKey();
  const hash = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return DAILY_TIPS[hash % DAILY_TIPS.length];
}

const ROLE_LABELS: Record<LoginPanel, string> = {
  admin: 'Super Admin',
  db_admin: 'Database Administrator',
  employee: 'Employee',
};

export function stashLoginWelcome(payload: LoginWelcomePayload) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

export function consumeLoginWelcome(): LoginWelcomePayload | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as LoginWelcomePayload;
  } catch {
    return null;
  }
}

export function dailyTipForToday(): string {
  return dailyTip();
}

export function buildWelcomeMessage(payload: LoginWelcomePayload) {
  const greeting = timeGreeting();
  const dateLabel = new Date().toLocaleDateString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return {
    title: `${greeting}, ${payload.name}!`,
    message: `Welcome to your ${ROLE_LABELS[payload.panel]} workspace · ${dateLabel}. ${dailyTip()}`,
  };
}
