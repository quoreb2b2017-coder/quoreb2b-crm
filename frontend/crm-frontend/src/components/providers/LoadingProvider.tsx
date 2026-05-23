'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    // Only show spinner if loading takes more than 100ms
    const spinnerTimer = setTimeout(() => setShowSpinner(true), 100);
    const hideTimer = setTimeout(() => {
      setIsLoading(false);
      setShowSpinner(false);
    }, 400);
    
    return () => {
      clearTimeout(spinnerTimer);
      clearTimeout(hideTimer);
    };
  }, [pathname, searchParams]);

  return (
    <>
      {children}
      {showSpinner && isLoading && (
        <div className="fixed inset-0 pointer-events-none z-[9999]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 mt-4">
            <div className="flex items-center justify-center">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 border-r-indigo-500 animate-spin" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
