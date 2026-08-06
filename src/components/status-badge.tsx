import type { InvitationStatus } from '../types/api';

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
