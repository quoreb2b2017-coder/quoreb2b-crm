'use client';

import { useEffect } from 'react';
import { buildWelcomeMessage, consumeLoginWelcome } from '@/lib/auth/login-welcome';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/store/auth.store';

export function LoginWelcomeToast() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const payload = consumeLoginWelcome();
    if (!payload) return;

    const { title, message } = buildWelcomeMessage(payload);
    const timer = window.setTimeout(() => {
      useToastStore.getState().add({
        type: 'success',
        title,
        message,
        duration: 6000,
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [user]);

  return null;
}
