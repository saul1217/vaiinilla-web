import type { InvitationStatus, OperationalOrderStatus, OrderStatus, PaymentStatus } from '../types/api';
import { operationalOrderStatus } from '../lib/order-status';

const invitationLabels: Record<InvitationStatus, string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  revocada: 'Revocada',
  reemplazada: 'Reemplazada',
  expirada: 'Expirada',
};

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  return <span className={`status-badge status-badge--${status}`}>{invitationLabels[status]}</span>;
}

export function EstablishmentStatusBadge({ status }: { status: 'activo' | 'suspendido' }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      {status === 'activo' ? 'Activo' : 'Suspendido'}
    </span>
  );
}

export function OrderStatusBadge({
  status,
  estadoOperativo,
  estadoPago,
  pagoPendiente,
}: {
  status: OrderStatus;
  estadoOperativo?: OperationalOrderStatus;
  estadoPago?: PaymentStatus;
  /** Campo legado: nunca reemplaza el estado operativo. */
  pagoPendiente?: boolean;
}) {
  const operational = operationalOrderStatus({ estado: status, estado_operativo: estadoOperativo });
  const operationalLabels: Record<OperationalOrderStatus, string> = {
    recibido: 'Recibido',
    preparando: 'Preparando',
    listo: 'Listo',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
    no_recogido: 'No recogido',
    expirado: 'Expirado',
  };
  const paymentLabel = estadoPago
    ? paymentLabels[estadoPago]
    : pagoPendiente === true
      ? 'Pendiente'
      : null;
  return (
    <>
      <span className={`status-badge status-badge--order-${operational}`}>{operationalLabels[operational]}</span>
      {paymentLabel ? <span className={`status-badge status-badge--payment-${estadoPago ?? 'pendiente'}`}>{paymentLabel}</span> : null}
    </>
  );
}

const paymentLabels: Record<PaymentStatus, string> = {
  pendiente: 'Pago pendiente',
  parcial: 'Pago parcial',
  pagado: 'Pagado',
  reembolsado: 'Reembolsado',
  sin_cargo: 'Sin cargo',
};
