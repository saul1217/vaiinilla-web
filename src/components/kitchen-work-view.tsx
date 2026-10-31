import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { OrderDetail } from '../types/api';
import { formatElapsed, minutesSince, type KitchenStage } from '../lib/kitchen';
import { KitchenOrderCard } from './kitchen-order-card';
import { CompactOrderRow } from './compact-order-row';
import { Button } from './ui';

/** Selection only. Queries, mutations and stage ordering belong to KitchenPage. */
export function KitchenWorkView({ pending, preparing, ready, now, leavingId, actions, startAll }: {
  pending: OrderDetail[]; preparing: OrderDetail[]; ready: OrderDetail[]; now: number;
  leavingId: string | null; actions: (order: OrderDetail, stage: KitchenStage) => ReactNode;
  startAll: ReactNode;
}) {
  const groups = [
    { stage: 'pending', title: 'Pendientes', orders: pending },
    { stage: 'preparing', title: 'En preparación', orders: preparing },
    { stage: 'ready', title: 'Listos', orders: ready },
  ] as const;
  const all = [...preparing, ...pending, ...ready];
  const [selection, setSelection] = useState<{ id: string; state: string } | null>(null);
  const current = all.find(order => order.id === selection?.id);
  const becameReady = current?.estado === 'listo' && selection?.state === 'preparando';
  const selected = (becameReady ? preparing[0] ?? pending[0] ?? current : current) ?? all[0];
  if (selected && (selection?.id !== selected.id || selection.state !== selected.estado)) {
    setSelection({ id: selected.id, state: selected.estado });
  }
  const heading = useRef<HTMLHeadingElement>(null);
  const ticketHadFocus = useRef(false);
  const manualSelection = useRef(false);
  const previousStage = useRef<string | undefined>(undefined);
  const previousId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (previousId.current && (previousId.current !== selected?.id || previousStage.current !== selected?.estado) && (ticketHadFocus.current || manualSelection.current)) heading.current?.focus();
    manualSelection.current = false;
    previousId.current = selected?.id;
    previousStage.current = selected?.estado;
  }, [selected?.id, selected?.estado]);
  return <section className="kitchen-work" aria-label="Pedidos de Cocina"
    onFocusCapture={event => { ticketHadFocus.current = Boolean(event.target.closest('.kitchen-work__ticket')); }}
    onBlurCapture={event => { if (event.relatedTarget) ticketHadFocus.current = Boolean(event.relatedTarget.closest('.kitchen-work__ticket')); }}>
    <h2 ref={heading} tabIndex={-1} className="kitchen-work__heading">{selected ? 'Comanda activa' : 'Sin comandas activas'}</h2>
    {!selected ? <p>Las nuevas comandas aparecerán aquí, incluso si siguen pendientes de pago.</p> : <>
      <div className="kitchen-work__columns">
        {groups.map(group => <section key={group.stage} className={`kitchen-work__column kitchen-work__column--${group.stage}`} aria-label={group.title}>
          <h2 className="kitchen-work__stage-title">{group.title} · {group.orders.length}</h2>
          {group.orders.map(order => <div key={order.id} className={`kitchen-work__ticket${order.id === selected.id ? ' kitchen-work__ticket--selected' : ''}`}>
            <KitchenOrderCard variant={order.id === selected.id ? 'protagonist' : 'standard'} order={order} stage={group.stage} now={now} leaving={leavingId === order.id} action={actions(order, group.stage)} />
          </div>)}
          {!group.orders.length && <p className="kitchen-work__stage-empty">Sin pedidos en esta etapa</p>}
        </section>)}
      </div>
      <section className="kitchen-work__queue" aria-label="En fila">
        <h2>En fila</h2>
        {groups.map(group => <section key={group.stage} aria-label={group.title}>
          <h3>{group.title} · {group.orders.length}</h3>
          <ul>{group.orders.filter(order => order.id !== selected.id).map(order => <CompactOrderRow key={order.id}
            title={`#${order.folio}`} summary={order.items.filter(item => !item.rechazo).map(item => `${item.cantidad}× ${item.nombre_producto}`).join(' · ')}
            meta={<>{order.destino === 'para_llevar' ? 'Para llevar' : order.espacio?.nombre ?? 'En espacio'} · {formatElapsed(minutesSince(order.creado_en, now))}{order.llegada_en && ' · Ya llegó'}</>}
            action={<Button variant="secondary" aria-label={`Ver comanda ${order.folio}`} onClick={() => { manualSelection.current = true; setSelection({ id: order.id, state: order.estado }); }}>Ver comanda</Button>} />)}</ul>
          {group.orders.some(order => order.id === selected.id) && <p>Comanda #{selected.folio} seleccionada</p>}
          {!group.orders.length && <p>Sin pedidos en esta etapa</p>}
        </section>)}
      </section>
    </>}
    {pending.length > 0 && <div className="kitchen-work__batch">{startAll}</div>}
  </section>;
}
