import type { ReactNode } from 'react';
import type { OrderDetail } from '../types/api';
import { formatMoney } from '../lib/money';
import { OrderItems } from './order-card';
import { OrderStatusBadge } from './status-badge';
import { ReceiptSurface } from './receipt-surface';

export function CashierReceipt({ order, actions }: { order: OrderDetail; actions: ReactNode }) {
  return <ReceiptSurface label={`Ticket ${order.folio}`}>
    <header className="cashier-receipt__header"><span>{order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En espacio' : 'Para llevar'} · <time dateTime={order.creado_en}>{new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(order.creado_en))}</time></span><OrderStatusBadge status={order.estado} /></header>
    <h3 className="cashier-receipt__folio">#{order.folio}</h3>
    <p>{order.usuario?.nombre ?? 'Cliente'} {order.usuario?.matricula} {order.invitado && <span className="guest-tag">Invitado</span>}</p>
    <OrderItems order={order} expanded />
    {order.llegada_en && <p role="status">Ya llegó</p>}
    <dl className="cashier-receipt__totals"><div><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>{order.saldo_pendiente != null && <div><dt>Pendiente</dt><dd>{formatMoney(order.saldo_pendiente)}</dd></div>}</dl>
    <div className="cashier-receipt__actions">{actions}</div>
  </ReceiptSurface>;
}
