import type { OfflineStaffOrdersApi } from '../hooks/use-offline-staff-orders';
import { Feedback } from './ui';
import { Badge, Card, VaiButton } from './vai';

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Lo que Caja y Mesero ven de los pedidos tomados sin internet: los que faltan por mandar y los
 * que el servidor no aceptó, con Reintentar y «Ya lo registré». Igual que la lista de Android.
 */
export function OfflineStaffOrdersPanel({ offline }: { offline: OfflineStaffOrdersApi }) {
  if (!offline.enabled) return null;
  const total = offline.pending.length + offline.problems.length;
  if (total === 0 && !offline.storageError) return null;
  const unregisteredCash = [...offline.pending, ...offline.problems].filter((order) => order.collectedCash).length;
  return (
    <Card
      className="offline-orders"
      aria-label="Pedidos sin conexión"
      title={<>Pedidos sin conexión <Badge count={total} label="pedidos por mandar" /></>}
      description={offline.sending ? 'Mandando los pedidos guardados…' : 'Se mandan solos cuando vuelve la conexión, cada 30 segundos.'}
    >
      {offline.storageError && <Feedback tone="error">{offline.storageError}</Feedback>}
      {unregisteredCash > 0 && (
        <p role="status">
          {unregisteredCash === 1 ? 'Hay 1 cobro en efectivo' : `Hay ${unregisteredCash} cobros en efectivo`} que todavía no entra al corte.
        </p>
      )}
      {offline.pending.length > 0 && (
        <ul className="offline-orders__list" aria-label="Por mandar">
          {offline.pending.map((order) => (
            <li key={order.id}>
              <strong>{order.localFolio}</strong> · {order.placeLabel} · {hora(order.capturedAt)}
              <small>{order.summary}{order.collectedCash ? ' · cobrado en efectivo' : ''}</small>
            </li>
          ))}
        </ul>
      )}
      {offline.problems.length > 0 && (
        <ul className="offline-orders__list" aria-label="Con problema">
          {offline.problems.map((order) => (
            <li key={order.id}>
              <strong>{order.localFolio}</strong> · {order.placeLabel} · {hora(order.capturedAt)}
              <small>{order.summary}</small>
              <Feedback tone="error">{order.problem}</Feedback>
              <div className="offline-orders__actions">
                {order.registeredFolio === null && (
                  <VaiButton variant="secondary" onClick={() => offline.retry(order.id)}>Reintentar</VaiButton>
                )}
                <VaiButton variant="quiet" onClick={() => offline.resolve(order.id)}>Ya lo registré</VaiButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {offline.pending.length > 0 && (
        <VaiButton variant="secondary" loading={offline.sending} onClick={offline.flushNow}>Mandar ahora</VaiButton>
      )}
    </Card>
  );
}
