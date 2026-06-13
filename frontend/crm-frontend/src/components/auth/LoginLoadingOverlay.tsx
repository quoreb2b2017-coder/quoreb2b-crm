'use client';

import './login.css';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

export function LoginLoadingOverlay({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible) return null;

  return createPortal(
    <div className="login-overlay" role="status" aria-live="polite" aria-label="Signing in">
      <div className="login-card">
        <div className="login-spinner-wrap">
          <div className="login-spinner-glow" />
          <div className="login-spinner-ring" />
          <div className="login-spinner-ring login-spinner-ring--inner" />
        </div>
        <p className="text-sm font-semibold text-slate-900">Signing you in</p>
        <p className="mt-1 text-xs text-slate-500">Preparing your workspace…</p>
        <div className="login-status-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>,
    document.body,
  );
}
