// Cómo se describe un espacio al personal: su turno, su gracia, su cuenta o su próxima reserva.
import type { SpaceAvailability } from '../types/api';

/** Hora local corta, por ejemplo "19:00". */
export function clock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/** Estado del espacio en una línea: turno, gracia, cuenta pendiente o libre. */
export function spaceStatusLine(space: Pick<SpaceAvailability, 'estado' | 'fin_previsto' | 'proxima_reserva'>): string {
  const next = space.proxima_reserva ? ` · Reservada ${clock(space.proxima_reserva.inicio)}` : '';
  switch (space.estado) {
    case 'ocupada':
      return (space.fin_previsto ? `Hasta ${clock(space.fin_previsto)}` : 'Ocupada') + next;
    case 'en_gracia':
      return 'Terminando' + next;
    case 'por_cobrar':
      return 'Cuenta por cobrar' + next;
    default:
      return space.proxima_reserva ? `Reservada ${clock(space.proxima_reserva.inicio)}` : 'Libre';
  }
}
