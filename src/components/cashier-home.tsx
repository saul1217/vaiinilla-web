import type { ReactNode } from 'react';
import './cashier.css';

export function CashierHome({ cashier, children }: { cashier: boolean; children: ReactNode }) {
  return <div className={`page-stack staff-page${cashier ? ' cashier-home' : ''}`}>{children}</div>;
}
