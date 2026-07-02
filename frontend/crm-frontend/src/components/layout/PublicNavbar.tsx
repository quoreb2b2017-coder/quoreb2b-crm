import { ArrowRight, LogIn } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';

export function PublicNavbar() {
  return (
    <header className="public-hub__nav">
      <div className="public-hub__nav-accent" aria-hidden />
      <div className="public-hub__nav-shell">
        <div className="public-hub__nav-inner">
          <BrandLogo variant="navbar" showSubtitle={false} />

          <a href="#sign-in" className="public-hub__nav-cta">
            <LogIn className="h-4 w-4" strokeWidth={2.25} />
            <span>Sign in</span>
            <ArrowRight className="public-hub__nav-cta-arrow h-3.5 w-3.5" strokeWidth={2.5} />
          </a>
        </div>
      </div>
    </header>
  );
}
