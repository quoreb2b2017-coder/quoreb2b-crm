'use client';

import './login.css';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { ShieldX, Wifi, X } from 'lucide-react';

interface LoginAccessDeniedModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginAccessDeniedModal({ open, onClose }: LoginAccessDeniedModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="login-denied-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-denied-title"
      onClick={onClose}
    >
      <div className="login-denied-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="login-denied-close"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="login-denied-icon-wrap">
          <div className="login-denied-icon-ring" aria-hidden />
          <ShieldX className="login-denied-icon h-7 w-7" strokeWidth={2} />
        </div>

        <h2 id="login-denied-title" className="login-denied-title">
          Access denied
        </h2>
        <p className="login-denied-lead">
          Your current IP address is not authorized to sign in to QuoreB2B CRM.
        </p>

        <div className="login-denied-info">
          <Wifi className="h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} />
          <p>
            Production login is restricted to approved office networks. If you believe this is a
            mistake, contact your administrator to whitelist your IP.
          </p>
        </div>

        <button type="button" onClick={onClose} className="login-denied-btn">
          Understood
        </button>
      </div>
    </div>,
    document.body,
  );
}
