import type { SVGProps } from 'react';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-logo brand-logo--compact ${className}`}>
      <img className="brand-logo__image" src="/brand/vaiinilla-mark.webp" alt="Vaiinilla" />
    </span>
  );
}

export function Logo({
  compact = false,
  theme = 'light',
  variant = 'standard',
}: {
  compact?: boolean;
  theme?: 'light' | 'dark';
  variant?: 'standard' | 'splash';
}) {
  const source = compact
    ? '/brand/vaiinilla-mark.webp'
    : `/brand/vaiinilla-logo${variant === 'splash' ? '-splash' : ''}-${theme}.` +
      (variant === 'splash' ? 'png' : 'webp');

  return (
    <span
      className={`brand-logo ${compact ? 'brand-logo--compact' : 'brand-logo--full'} ${
        !compact && variant === 'splash' ? 'brand-logo--splash' : ''
      } brand-logo--${theme}`}
    >
      <img className="brand-logo__image" src={source} alt="Vaiinilla" />
    </span>
  );
}

export function Spinner(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`size-5 animate-spin ${props.className ?? ''}`}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
