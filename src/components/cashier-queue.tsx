import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OrderDetail } from '../types/api';
import { CompactOrderRow } from './compact-order-row';
import { OrderStatusBadge } from './status-badge';
import { Button } from './ui';
import { CashierReceipt } from './cashier-receipt';

type Group = 'cash' | 'ready';
export function CashierQueue({ cashOrders, readyOrders, actions }: { cashOrders: OrderDetail[]; readyOrders: OrderDetail[]; actions: (order: OrderDetail, group: Group) => ReactNode }) {
  const [selection, setSelection] = useState<{ id: string; group: Group } | null>(null);
  const ticket = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hadTicketFocus = useRef(false);
  const all = [...cashOrders, ...readyOrders];
  const selected = all.find(order => order.id === selection?.id) ?? (selection?.group === 'ready' ? readyOrders[0] : cashOrders[0]) ?? all[0];
  const group: Group = selected && cashOrders.some(order => order.id === selected.id) ? 'cash' : 'ready';
  if (selected && (selected.id !== selection?.id || group !== selection?.group)) setSelection({ id: selected.id, group });
  const previousId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (previousId.current && previousId.current !== selected?.id && hadTicketFocus.current) heading.current?.focus();
    previousId.current = selected?.id;
  }, [selected?.id]);
  return <div className="cashier-queue" onFocusCapture={event => { hadTicketFocus.current = Boolean(ticket.current?.contains(event.target)); }} onBlurCapture={event => { if (event.relatedTarget) hadTicketFocus.current = Boolean(ticket.current?.contains(event.relatedTarget as Node)); }}>
    <h2 ref={heading} tabIndex={-1} className="cashier-queue__heading">Fila de Caja</h2>
    {selected && <div ref={ticket} className="cashier-queue__ticket"><CashierReceipt order={selected} actions={actions(selected, group)} /></div>}
    <div className="cashier-queue__groups">{([{ key: 'cash', title: 'Por cobrar', orders: cashOrders, empty: 'Sin cobros pendientes' }, { key: 'ready', title: 'Listos para entregar', orders: readyOrders, empty: 'Sin entregas pendientes' }] as const).map(section => <section key={section.key} aria-label={section.title}>
      <h3>{section.title} <span aria-label={`${section.orders.length} pedidos`}>{section.orders.length}</span></h3>
      {!section.orders.length ? <p>{section.empty}</p> : <ul>{section.orders.filter(order => order.id !== selected?.id).map(order => <CompactOrderRow key={order.id} title={`#${order.folio}`} summary={order.items.map(item => `${item.cantidad}× ${item.nombre_producto}`).join(' · ')} meta={order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En espacio' : 'Para llevar'} status={<OrderStatusBadge status={order.estado} />} action={<Button variant="secondary" onClick={() => setSelection({ id: order.id, group: section.key })} aria-label={`Ver pedido ${order.folio}`}>Ver pedido</Button>} />)}</ul>}
      {selected && group === section.key && <p className="cashier-queue__selected">Ticket #{selected.folio} seleccionado</p>}
    </section>)}</div>
  </div>;
}
