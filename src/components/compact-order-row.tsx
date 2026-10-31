import type { ReactNode } from 'react';

/** Presentation only: callers supply existing data and the permitted action. */
export function CompactOrderRow({ title, summary, meta, status, amount, action }: {
  title: ReactNode; summary?: ReactNode; meta?: ReactNode; status?: ReactNode; amount?: ReactNode; action: ReactNode;
}) {
  return <li className="app-order-row">
    <div className="app-order-row__content"><div className="app-order-row__heading"><strong>{title}</strong>{status}</div>
      {summary && <div>{summary}</div>}{meta && <div className="app-order-row__meta">{meta}</div>}
    </div>
    <div className="app-order-row__action">{amount && <strong>{amount}</strong>}{action}</div>
  </li>;
}
