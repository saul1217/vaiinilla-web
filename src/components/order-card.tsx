import { Clock3, MapPin, ReceiptText, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatMoney } from '../lib/money';
import type { OrderDetail } from '../types/api';
import { OrderStatusBadge } from './status-badge';

export function OrderCard({
  order,
  actions,
  showKitchenNotes = false,
}: {
  order: OrderDetail;
  actions?: ReactNode;
  showKitchenNotes?: boolean;
}) {
  return (
    <article className="order-card">
      <header className="order-card__header">
        <div>
          <p className="order-card__folio"><ReceiptText aria-hidden="true" /> Folio {order.folio}</p>
          <p className="order-card__time"><Clock3 aria-hidden="true" /> {formatTime(order.creado_en)}</p>
        </div>
        <OrderStatusBadge status={order.estado} />
      </header>

      <div className="order-card__customer">
        <UserRound aria-hidden="true" />
        <span>
          <strong>{order.usuario?.nombre ?? 'Cliente'}</strong>
          {order.usuario?.matricula && <small>{order.usuario.matricula}</small>}
        </span>
      </div>

      <OrderItems order={order} />

      {showKitchenNotes && order.notas_cocina && (
        <div className="order-note order-note--compact">
          <strong>Notas de cocina</strong>
          <p>{order.notas_cocina}</p>
        </div>
      )}

      <div className="order-card__destination">
        <MapPin aria-hidden="true" />
        {order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En espacio' : 'Para llevar'}
      </div>

      <footer className="order-card__footer">
        <span><small>Total</small><strong>{formatMoney(order.total)}</strong></span>
        {actions && <div className="order-card__actions">{actions}</div>}
      </footer>
    </article>
  );
}

export function OrderDetailContent({ order }: { order: OrderDetail }) {
  return (
    <div className="order-detail">
      <div className="order-detail__summary">
        <div><small>Folio</small><strong>{order.folio}</strong></div>
        <div><small>Estado</small><OrderStatusBadge status={order.estado} /></div>
        <div><small>Cliente</small><strong>{order.usuario?.nombre ?? 'Cliente'}</strong></div>
        <div><small>Creado</small><strong>{formatDateTime(order.creado_en)}</strong></div>
      </div>
      <OrderItems order={order} expanded />
      {order.notas_cocina && <div className="order-note"><strong>Notas de cocina</strong><p>{order.notas_cocina}</p></div>}
      <dl className="order-totals">
        <div><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>
        <div><dt>Ahorro combinado</dt><dd>− {formatMoney(order.ahorro_combinado)}</dd></div>
        {order.cashback_otorgado !== '0.00' && <div><dt>Cashback</dt><dd>{formatMoney(order.cashback_otorgado)}</dd></div>}
        <div className="order-totals__total"><dt>Total</dt><dd>{formatMoney(order.total)}</dd></div>
      </dl>
    </div>
  );
}

function OrderItems({ order, expanded = false }: { order: OrderDetail; expanded?: boolean }) {
  return (
    <ul className={`order-items ${expanded ? 'order-items--expanded' : ''}`} aria-label="Productos del pedido">
      {order.items.map((item) => (
        <li key={item.id}>
          <span className="order-items__quantity">{item.cantidad}×</span>
          <span className="order-items__name">
            <strong>{item.nombre_producto}</strong>
            {item.opciones.length > 0 && <small>{item.opciones.map((option) => option.nombre).join(', ')}</small>}
          </span>
          {expanded && <span className="order-items__subtotal">{formatMoney(item.subtotal)}</span>}
        </li>
      ))}
    </ul>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
