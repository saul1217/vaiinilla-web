// Reporte de reembolsos de reservas de cancha para Administración: quién canceló, con qué rol,
// cuánto, por qué método y por qué motivo. Registro solo de inserción.
// Contrato: GET /reservas/reembolsos (solo Administración del mismo negocio).
import { useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { Button, Feedback } from './ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';

const ROLE_LABEL: Record<string, string> = { admin: 'Administración', cajero: 'Caja', mesero: 'Mesero' };

export function BookingRefundsCard() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const refunds = useQuery({
    queryKey: ['booking-refunds', scopeId],
    enabled: Boolean(token && scopeId),
    queryFn: () => api.listBookingRefunds(token),
  });
  const rows = refunds.data ?? [];

  return (
    <section className="panel-card p-5 sm:p-6" aria-labelledby="booking-refunds-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
            <Undo2 aria-hidden="true" />
          </span>
          <div>
            <h2 id="booking-refunds-title" className="text-xl font-extrabold text-ink">
              Reembolsos de reservas
            </h2>
            <p className="mt-1 text-sm text-muted">Cancelaciones de canchas ya pagadas y lo que se devolvió.</p>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={() => void refunds.refetch()}>
          Actualizar
        </Button>
      </div>
      {refunds.isError && !refunds.isFetching && (
        <Feedback tone="error">
          {refunds.error instanceof VaiinillaApiError && refunds.error.status === 403
            ? 'Solo Administración puede ver los reembolsos.'
            : errorMessage(refunds.error)}
        </Feedback>
      )}
      {refunds.isLoading && <p className="text-sm text-muted">Consultando reembolsos…</p>}
      {refunds.isSuccess && rows.length === 0 && <p className="text-sm text-muted">Todavía no hay reembolsos.</p>}
      {rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((refund) => (
            <li key={refund.id} className="grid gap-1 rounded-2xl bg-cream p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold text-ink">
                  {refund.espacio?.nombre ?? 'Cancha'} · {formatMoney(refund.monto)}
                </p>
                <span className="status-badge status-badge--warning">
                  {refund.salida === 'devolucion_pendiente' ? 'Devolución pendiente' : refund.metodo}
                </span>
              </div>
              <p className="text-sm text-muted" data-qa-volatil>
                {refund.cliente?.nombre ?? 'Cliente'} · {ROLE_LABEL[refund.rol] ?? refund.rol}
                {refund.por?.nombre ? ` (${refund.por.nombre})` : ''} ·{' '}
                {new Date(refund.creado_en).toLocaleString('es-MX')}
              </p>
              <p className="text-sm text-ink">Motivo: {refund.motivo}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
