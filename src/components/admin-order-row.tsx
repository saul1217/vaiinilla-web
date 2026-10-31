import type { OrderDetail } from '../types/api';
import { formatMoney } from '../lib/money';
import { CompactOrderRow } from './compact-order-row';
import { OrderStatusBadge } from './status-badge';
import { Button } from './ui';
import { adminOrderDateTimeFormatter } from './admin-order-format';

export function AdminOrderRow({ order, onSelect }: { order: OrderDetail; onSelect: (order: OrderDetail) => void }) {
  const summary = order.items.map((item) => `${item.cantidad} × ${item.nombre_producto}`).join(', ');
  const destination = order.destino === 'en_espacio'
    ? order.espacio?.nombre ?? 'En espacio'
    : 'Para llevar';

  return (
    <CompactOrderRow
      title={`#${order.folio}`}
      status={<OrderStatusBadge status={order.estado} />}
      summary={
        <p className="admin-order-row__summary" title={summary}>
          {summary}
        </p>
      }
      meta={
        <>
          {destination} · {order.usuario?.nombre ?? 'Cliente'} ·{' '}
          <time dateTime={order.creado_en}>
            {adminOrderDateTimeFormatter.format(new Date(order.creado_en))}
          </time>
        </>
      }
      amount={formatMoney(order.total)}
      action={
        <Button
          variant="secondary"
          aria-label={`Ver pedido ${order.folio}`}
          onClick={() => onSelect(order)}
        >
          Ver detalle
        </Button>
      }
    />
  );
}
