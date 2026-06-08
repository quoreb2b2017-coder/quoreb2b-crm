'use client';

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface NavigationContextValue {
  pendingHref: string | null;
  isNavigating: boolean;
  startNavigation: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextValue>({
  pendingHref: null,
  isNavigating: false,
  startNavigation: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}

function NavProgressBar({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden bg-slate-200/40"
      aria-hidden
    >
      <div className="h-full w-2/5 animate-nav-progress bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500" />
    </div>
  );
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LoadingProviderInner>{children}</LoadingProviderInner>
    </Suspense>
  );
}

function LoadingProviderInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const startNavigation = useCallback(
    (href: string) => {
      if (href === pathname) return;
      setPendingHref(href);
      setIsNavigating(true);
    },
    [pathname],
  );

  useEffect(() => {
    setPendingHref(null);
    setIsNavigating(false);
  }, [pathname, searchParams]);

  const value = useMemo(
    () => ({ pendingHref, isNavigating, startNavigation }),
    [pendingHref, isNavigating, startNavigation],
  );

  return (
    <NavigationContext.Provider value={value}>
      <NavProgressBar active={isNavigating} />
      {children}
    </NavigationContext.Provider>
  );
}
