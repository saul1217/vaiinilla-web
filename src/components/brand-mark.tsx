import type { SVGProps } from 'react';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M6 3h6l-1.5 4.5H8L6 3Z" fill="currentColor" />
        <rect x="7" y="8" width="7" height="13" rx="3" fill="currentColor" />
        <path d="M15 9c2.2 0 3.5 1.4 3.5 3.4 0 2.6-2.3 3.8-3.5 4.2V9Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3 font-extrabold tracking-[-0.03em] text-ink">
      <BrandMark />
      {!compact && <span>Vaiinilla</span>}
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
