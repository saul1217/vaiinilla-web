import type { ReactNode } from 'react';

export function ReceiptSurface({ children, label }: { children: ReactNode; label: string }) {
  return <section className="app-receipt" aria-label={label}>{children}</section>;
}
