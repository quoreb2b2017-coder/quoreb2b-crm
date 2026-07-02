import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import quoreIcon from '@/assets/brand/quore-icon.png';

type BrandLogoProps = {
  variant?: 'navbar' | 'footer' | 'sidebar' | 'hero' | 'icon' | 'large';
  showSubtitle?: boolean;
  className?: string;
  href?: string | null;
  inverted?: boolean;
};

const SIZES = {
  navbar: 38,
  footer: 34,
  sidebar: 32,
  hero: 56,
  icon: 28,
  large: 88,
} as const;

function BrandWordmark({
  variant,
  inverted,
}: {
  variant: BrandLogoProps['variant'];
  inverted?: boolean;
}) {
  const sizeClass =
    variant === 'large' || variant === 'hero'
      ? 'text-2xl sm:text-[1.75rem]'
      : variant === 'navbar'
        ? 'text-base'
        : 'text-sm';

  return (
    <span className={cn('inline-flex items-baseline gap-1', sizeClass)}>
      <span
        className={cn(
          'font-bold tracking-tight',
          inverted || variant === 'large' || variant === 'hero'
            ? 'text-white'
            : variant === 'footer'
              ? 'text-slate-100'
              : 'text-slate-900',
        )}
      >
        QuoreB2B
      </span>
      {(variant === 'navbar' || variant === 'footer' || variant === 'large' || variant === 'hero') && (
        <span
          className={cn(
            'font-bold tracking-tight',
            inverted || variant === 'large' || variant === 'hero'
              ? 'text-white/90'
              : 'text-quore-500',
          )}
        >
          CRM
        </span>
      )}
    </span>
  );
}

export function BrandLogo({
  variant = 'navbar',
  showSubtitle = true,
  className,
  href = '/',
  inverted = false,
}: BrandLogoProps) {
  const size = SIZES[variant];

  const inner = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src={quoreIcon}
        alt=""
        width={size}
        height={size}
        className={cn(
          'shrink-0 object-contain bg-transparent',
          inverted && 'brightness-0 invert',
        )}
        priority={variant === 'navbar' || variant === 'hero' || variant === 'large'}
      />

      {variant !== 'icon' && (
        <span className="min-w-0 text-left leading-none">
          <BrandWordmark variant={variant} inverted={inverted} />
          {showSubtitle && variant !== 'large' && variant !== 'hero' && variant !== 'navbar' && variant !== 'footer' && (
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              CRM Platform
            </span>
          )}
          {(variant === 'large' || variant === 'hero') && (
            <span className="mt-1.5 block text-sm font-medium text-white/80">
              Enterprise B2B CRM
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="transition-opacity hover:opacity-90">
        {inner}
      </Link>
    );
  }

  return inner;
}
