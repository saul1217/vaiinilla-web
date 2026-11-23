import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lateOrders } from '../lib/delay-alerts';
import type { BusinessSettings, OrderDetail } from '../types/api';
import { AlertCircle } from 'lucide-react';

/** Pedidos pagados que ya pasaron su límite sin entregarse. Solo sale si el negocio prendió el aviso. */
export function DelayAlertsCard({
  orders,
  settings,
}: {
  orders: OrderDetail[] | undefined;
  settings: BusinessSettings | undefined;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const late = lateOrders(orders ?? [], settings, nowMs);
  if (late.length === 0) return null;
  return (
    // role=status, no alert: la lista cambia cada minuto y un lector de pantalla no debe repetirla a gritos.
    <div className="feedback feedback--error" role="status">
      <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
      <span className="grid gap-1">
        <strong>
          {late.length === 1 ? '1 pedido pagado va tarde' : `${late.length} pedidos pagados van tarde`}
        </strong>
        {late.slice(0, 5).map((order) => (
          <span key={order.id}>
            #{order.folio} · {order.minutes} min sin entregar ({order.kitchen ? 'con cocina' : 'sin cocina'}, límite{' '}
            {order.limit} min)
          </span>
        ))}
        <Link to="/app/pedidos" className="underline">
          Ver pedidos
        </Link>
      </span>
    </div>
  );
}
