'use client';

import { useState } from 'react';
import { Mail, KeyRound, Lock, LogIn, AlertCircle, Fingerprint } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLogin } from '@/components/auth/LoginProvider';
import { cn } from '@/lib/utils/cn';

type AuthMode = 'password' | 'otp';

export function AdminLoginForm() {
  const { loading, error, setError, loginAdminPassword, loginAdminOtpRequest, loginAdminOtpVerify } =
    useLogin();
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState('');

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setOtpSent(false);
    setOtp('');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await loginAdminOtpRequest(email);
    if (res.ok) {
      setOtpSent(true);
      if (res.devOtp) setDevOtpHint(res.devOtp);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex gap-6 border-b border-slate-100">
        {(['password', 'otp'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium -mb-px transition-colors',
              mode === m
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {m === 'password' ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Fingerprint className="h-3.5 w-3.5" />
            )}
            {m === 'password' ? 'Password' : 'Email OTP'}
          </button>
        ))}
      </div>

      {mode === 'password' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            loginAdminPassword(email, password);
          }}
          className="space-y-4"
        >
          <Input
            label="Email address"
            type="email"
            icon={Mail}
            placeholder="admin@quoreb2b.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" fullWidth disabled={loading} className="mt-2 gap-2">
            <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} />
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!otpSent) handleSendOtp(e);
            else loginAdminOtpVerify(email, otp);
          }}
          className="space-y-4"
        >
          <Input
            label="Email address"
            type="email"
            icon={Mail}
            placeholder="admin@quoreb2b.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={otpSent}
          />
          {otpSent && (
            <Input
              label="6-digit OTP"
              type="text"
              icon={KeyRound}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
              className="tracking-[0.35em] text-center font-mono"
            />
          )}
          {devOtpHint && process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-amber-800">Dev OTP: {devOtpHint}</p>
          )}
          <Button type="submit" fullWidth disabled={loading} className="mt-2 gap-2">
            {!otpSent ? (
              <>
                <Mail className="h-4 w-4 shrink-0" strokeWidth={2} />
                {loading ? 'Sending...' : 'Send OTP'}
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 shrink-0" strokeWidth={2} />
                {loading ? 'Verifying...' : 'Verify & sign in'}
              </>
            )}
          </Button>
          {otpSent && (
            <button
              type="button"
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={() => {
                setOtpSent(false);
                setOtp('');
              }}
            >
              Use a different email
            </button>
          )}
        </form>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <p className="mt-6 text-xs text-slate-400">Demo: admin@quoreb2b.com / Admin@123</p>
    </div>
  );
}
