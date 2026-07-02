'use client';

import { BadgeCheck, Lock, LogIn, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLogin } from '@/components/auth/LoginProvider';

interface IdLoginFormProps {
  panel: 'db_admin' | 'employee';
}

export function IdLoginForm({ panel }: IdLoginFormProps) {
  const { loading, error, loginWithId } = useLogin();

  return (
    <div className="animate-fade-in">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          loginWithId(
            fd.get('employeeId') as string,
            fd.get('password') as string,
            panel,
          );
        }}
        className="space-y-4"
      >
        <Input
          label="Employee ID"
          name="employeeId"
          icon={BadgeCheck}
          placeholder={panel === 'db_admin' ? 'DBA001' : 'EMP001'}
          required
          autoComplete="username"
        />
        <Input
          label="Password"
          name="password"
          type="password"
          icon={Lock}
          placeholder="Min. 8 characters"
          required
          minLength={8}
          autoComplete="current-password"
        />
        <Button type="submit" variant="quore" fullWidth disabled={loading} className="mt-2 gap-2">
          <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} />
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
