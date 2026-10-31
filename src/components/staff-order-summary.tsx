import type { ReactNode } from 'react';

export function StaffOrderSummary({ children }: { children: ReactNode }) {
  return <div className="staff-order__pie">{children}</div>;
}
