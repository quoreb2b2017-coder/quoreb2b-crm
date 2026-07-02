import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import quoreMark from '@/assets/brand/quore-logo.jpg';

type BrandLogoProps = {
  variant?: 'navbar' | 'footer' | 'sidebar' | 'hero' | 'icon' | 'large';
  showSubtitle?: boolean;
  className?: string;
  href?: string | null;
  inverted?: boolean;
};

const ICON_SIZE: Record<BrandLogoProps['variant'] & string, number> = {
  navbar: 44,
  footer: 40,
  sidebar: 36,
  hero: 52,
  large: 64,
  icon: 36,
};

const TEXT_CLASS: Record<Exclude<BrandLogoProps['variant'], 'icon' | undefined>, string> = {
  navbar: 'text-xl sm:text-2xl',
  footer: 'text-lg sm:text-xl',
  sidebar: 'text-base sm:text-lg',
  hero: 'text-2xl sm:text-[1.75rem]',
  large: 'text-2xl sm:text-3xl',
};

function BrandWordmark({
  variant,
  inverted,
}: {
  variant: Exclude<BrandLogoProps['variant'], 'icon' | undefined>;
  inverted?: boolean;
}) {
  const textClass = TEXT_CLASS[variant];

  return (
    <span className={cn('inline-flex items-baseline gap-1 leading-none', textClass)}>
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
      <span
        className={cn(
          'font-bold tracking-tight',
          inverted || variant === 'large' || variant === 'hero'
            ? 'text-white'
            : 'text-quore-500',
        )}
      >
        CRM
      </span>
    </span>
  );
}

export function BrandLogo({
  variant = 'navbar',
  showSubtitle = false,
  className,
  href = '/',
  inverted = false,
}: BrandLogoProps) {
  const iconSize = ICON_SIZE[variant ?? 'navbar'];

  const inner =
    variant === 'icon' ? (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src={quoreMark}
          alt="QuoreB2B CRM"
          width={iconSize}
          height={iconSize}
          className={cn(
            'shrink-0 object-contain bg-transparent',
            inverted && 'brightness-0 invert',
          )}
          style={{ width: iconSize, height: iconSize }}
        />
      </span>
    ) : (
      <span className={cn('inline-flex items-center gap-2.5', className)}>
        <Image
          src={quoreMark}
          alt=""
          width={iconSize}
          height={iconSize}
          className={cn(
            'shrink-0 object-contain bg-transparent',
            inverted && 'brightness-0 invert',
          )}
          style={{ width: iconSize, height: iconSize }}
          priority={variant === 'navbar' || variant === 'hero' || variant === 'large'}
        />
        <span className="min-w-0 text-left leading-none">
          <BrandWordmark variant={variant} inverted={inverted} />
          {showSubtitle && (variant === 'hero' || variant === 'large') && (
            <span className="mt-2 block text-sm font-medium text-white/80">Enterprise B2B CRM</span>
          )}
        </span>
      </span>
    );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity hover:opacity-90">
        {inner}
      </Link>
    );
  }

  return inner;
}
