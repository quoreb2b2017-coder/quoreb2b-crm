'use client';

import { useState } from 'react';
import { Mail, KeyRound, Lock, LogIn, AlertCircle, Fingerprint } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLogin } from '@/components/auth/LoginProvider';
import { cn } from '@/lib/utils/cn';

type AuthMode = 'password' | 'otp';

export function AdminLoginForm() {
  const {
    loading,
    error,
    setError,
    loginAdminPassword,
    loginAdminOtpRequest,
    loginAdminOtpVerify,
  } = useLogin();
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setOtpSent(false);
    setOtp('');
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await loginAdminOtpRequest(email);
    if (res.ok) setOtpSent(true);
  };

  return (
    <div className="animate-fade-in">
      <p className="mb-5 text-sm text-slate-600">
        Super Admin — sign in with <span className="font-medium text-slate-800">email & password</span>{' '}
        or <span className="font-medium text-slate-800">email OTP</span>.
      </p>

      <div className="mb-6 flex gap-6 border-b border-slate-100">
        {(['password', 'otp'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 pb-2 text-sm font-medium -mb-px transition-colors',
              mode === m
                ? 'border-quore-500 text-slate-900'
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
            placeholder="quoreb2b2017@gmail.com"
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
          <Button type="submit" variant="quore" fullWidth disabled={loading} className="mt-2 gap-2">
            <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} />
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!otpSent) void handleSendOtp(e);
            else loginAdminOtpVerify(email, otp);
          }}
          className="space-y-4"
        >
          <Input
            label="Email address"
            type="email"
            icon={Mail}
            placeholder="quoreb2b2017@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={otpSent}
          />
          {otpSent && (
            <>
              <p className="text-xs text-slate-500">
                Check your inbox (and spam) for the 6-digit code.
              </p>
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
            </>
          )}
          <Button type="submit" variant="quore" fullWidth disabled={loading} className="mt-2 gap-2">
            {!otpSent ? (
              <>
                <Mail className="h-4 w-4 shrink-0" strokeWidth={2} />
                {loading ? 'Sending code...' : 'Send OTP'}
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
                setError('');
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
    </div>
  );
}
