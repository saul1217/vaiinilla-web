import type { InvitationStatus, OrderStatus } from '../types/api';

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

const orderLabels: Record<OrderStatus, string> = {
  por_cobrar: 'Por cobrar',
  cobrado: 'Cobrado',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  no_recogido: 'No recogido',
  expirado: 'Expirado',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-badge--order-${status}`}>{orderLabels[status]}</span>;
}
