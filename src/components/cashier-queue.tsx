import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OrderDetail } from '../types/api';
import { CompactOrderRow } from './compact-order-row';
import { OrderStatusBadge } from './status-badge';
import { Button } from './ui';
import { CashierReceipt } from './cashier-receipt';
import { ReadyNotice } from './cashier-lines';

type Group = 'cash' | 'ready';
/**
 * `pick` abre en el ticket el pedido que Caja eligió desde «Buscar un pedido» o desde el tablero
 * de filas; `seq` distingue dos elecciones del mismo pedido. Con `list` otra vista ocupa el lugar
 * de las listas y aquí queda solo el ticket.
 */
export function CashierQueue({ cashOrders, readyOrders, actions, pick, now, list }: { cashOrders: OrderDetail[]; readyOrders: OrderDetail[]; actions: (order: OrderDetail, group: Group) => ReactNode; pick?: { id: string; seq: number } | null; now?: Date; list?: ReactNode }) {
  const [selection, setSelection] = useState<{ id: string; group: Group } | null>(null);
  const [handledPick, setHandledPick] = useState(0);
  if (pick && pick.seq !== handledPick) {
    setHandledPick(pick.seq);
    const pickedGroup: Group | null = cashOrders.some(order => order.id === pick.id) ? 'cash' : readyOrders.some(order => order.id === pick.id) ? 'ready' : null;
    if (pickedGroup) setSelection({ id: pick.id, group: pickedGroup });
  }
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
  // Lo elegido en la búsqueda queda a la vista y con el foco en el ticket.
  useLayoutEffect(() => {
    if (!handledPick) return;
    ticket.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, [handledPick]);
  return <div className="cashier-queue" onFocusCapture={event => { hadTicketFocus.current = Boolean(ticket.current?.contains(event.target)); }} onBlurCapture={event => { if (event.relatedTarget) hadTicketFocus.current = Boolean(ticket.current?.contains(event.relatedTarget as Node)); }}>
    <h2 ref={heading} tabIndex={-1} className="cashier-queue__heading">Fila de Caja</h2>
    {selected && <div ref={ticket} className="cashier-queue__ticket"><CashierReceipt order={selected} actions={actions(selected, group)} /></div>}
    {list ?? <div className="cashier-queue__groups">{([{ key: 'cash', title: 'Por cobrar', orders: cashOrders, empty: 'Sin cobros pendientes' }, { key: 'ready', title: 'Listos para entregar', orders: readyOrders, empty: 'Sin entregas pendientes' }] as const).map(section => <section key={section.key} aria-label={section.title}>
      <h3>{section.title} <span aria-label={`${section.orders.length} pedidos`}>{section.orders.length}</span></h3>
      {!section.orders.length ? <p>{section.empty}</p> : <ul>{section.orders.filter(order => order.id !== selected?.id).map(order => <CompactOrderRow key={order.id} title={`#${order.folio}`} summary={order.items.map(item => `${item.cantidad}× ${item.nombre_producto}`).join(' · ')} meta={<>{order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En espacio' : 'Para llevar'}{section.key === 'ready' && now && <> · <ReadyNotice order={order} now={now} /></>}</>} status={<OrderStatusBadge status={order.estado} />} action={<Button variant="secondary" onClick={() => setSelection({ id: order.id, group: section.key })} aria-label={`Ver pedido ${order.folio}`}>Ver pedido</Button>} />)}</ul>}
      {selected && group === section.key && <p className="cashier-queue__selected">Ticket #{selected.folio} seleccionado</p>}
    </section>)}</div>}
  </div>;
}
