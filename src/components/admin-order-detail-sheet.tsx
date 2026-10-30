import type { RefObject } from 'react';
import type { OrderDetail } from '../types/api';
import { AppSheet } from './app-sheet';
import { OrderStatusBadge } from './status-badge';
import { OrderDetailContent } from './order-card';

export function AdminOrderDetailSheet({ order, onClose, fallbackFocusRef }: { order: OrderDetail | null; onClose: () => void; fallbackFocusRef: RefObject<HTMLElement | null> }) {
  return <AppSheet open={Boolean(order)} onOpenChange={(open) => { if (!open) onClose(); }}
    title={order ? `Pedido ${order.folio}` : 'Detalle del pedido'}
    description="Información registrada al abrir el detalle."
    contentClassName="admin-order-detail-sheet" fallbackFocusRef={fallbackFocusRef}>
    {order && <AppSheet.Body>
      <dl className="admin-order-facts">
        <div><dt>Estado</dt><dd><OrderStatusBadge status={order.estado} /></dd></div>
        <div><dt>Pago</dt><dd>{{ efectivo: 'Efectivo', stripe: 'Tarjeta', saldo: 'Saldo Vaiinilla' }[order.metodo_pago]}{order.pago_diferido && ' · Cuenta diferida'}{order.pago_pendiente && ' · Pendiente'}</dd></div>
        <div><dt>Destino</dt><dd>{order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En espacio' : 'Para llevar'}</dd></div>
        <div><dt>Cliente</dt><dd>{order.usuario?.nombre ?? 'Cliente'}{order.usuario?.matricula && <small> · {order.usuario.matricula}</small>}{order.invitado && ' · Invitado'}</dd></div>
        <div><dt>Hora registrada</dt><dd><time dateTime={order.creado_en}>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.creado_en))}</time></dd></div>
      </dl>
      <OrderDetailContent order={order} hideSummary />
    </AppSheet.Body>}
  </AppSheet>;
}
