import { Suspense } from 'react';
import { LoginHub } from '@/components/auth/LoginHub';

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <LoginHub />
    </Suspense>
  );
}