// Reservas de cancha del día para caja: quién, qué cancha, a qué hora, si ya pagó o paga en
// efectivo, y cuándo vence el apartado. Cobrar (efectivo) o liberar/cancelar la que no llegó.
// Contrato: GET /reservas/personal?fecha=, POST /reservas/:id/pago y /reservas/:id/cancelacion.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button, Feedback, Field, Modal } from './ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { MONEY_PATTERN, calculateChange, formatMoney, normalizeMoneyInput } from '../lib/money';
import { clock } from '../lib/space-status';
import type { StaffBooking } from '../types/api';

function localDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Por pagar en efectivo',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
};

export function CourtBookingsCard() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const date = localDate();
  const [paying, setPaying] = useState<StaffBooking | null>(null);
  const [received, setReceived] = useState('');
  const [canceling, setCanceling] = useState<StaffBooking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = ['court-bookings', scopeId, date];
  const bookings = useQuery({ queryKey, enabled: Boolean(token), queryFn: () => api.listStaffBookings(token, date) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const pay = useMutation({
    mutationFn: (booking: StaffBooking) => api.payCounterRental(token, booking.id, normalizeMoneyInput(received)),
    onSuccess: async () => {
      setPaying(null);
      setNotice('Reserva cobrada.');
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (booking: StaffBooking) => api.cancelCounterRental(token, booking.id),
    onSuccess: async () => {
      setCanceling(null);
      setNotice('Cancha liberada. La reserva quedó cancelada.');
      await refresh();
    },
    onError: () => void refresh(),
  });

  const rows = (bookings.data ?? []).filter((booking) => booking.estado !== 'cancelada');
  const change = paying && MONEY_PATTERN.test(received) ? calculateChange(received, paying.monto) : null;

  return (
    <section className="panel-card p-5 sm:p-6" aria-labelledby="court-bookings-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
            <CalendarCheck aria-hidden="true" />
          </span>
          <div>
            <h2 id="court-bookings-title" className="text-xl font-extrabold text-ink">
              Reservas de hoy
            </h2>
            <p className="mt-1 text-sm text-muted">Cobra o libera las canchas que apartaron tus clientes.</p>
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={() => void bookings.refetch()}>
          <RefreshCw aria-hidden="true" className="size-4" /> Actualizar
        </Button>
      </div>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {bookings.isError && <Feedback tone="error">{errorMessage(bookings.error)}</Feedback>}
      {cancel.isError && <Feedback tone="error">{errorMessage(cancel.error)}</Feedback>}
      {bookings.isLoading && <p className="text-sm text-muted">Consultando reservas…</p>}
      {bookings.isSuccess && rows.length === 0 && <p className="text-sm text-muted">No hay reservas para hoy.</p>}
      {rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((booking) => {
            const unpaid = booking.estado === 'pendiente_pago';
            return (
              <li key={booking.id} className="grid gap-2 rounded-2xl bg-cream p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold text-ink">
                    {booking.espacio.nombre} · {clock(booking.inicio)}–{clock(booking.fin)}
                  </p>
                  <span className={`status-badge ${unpaid ? 'status-badge--warning' : 'status-badge--success'}`}>
                    {STATUS_LABEL[booking.estado] ?? booking.estado}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {booking.cliente?.nombre ?? 'Cliente'} · {formatMoney(booking.monto)}
                  {unpaid && booking.vence_en ? ` · Vence ${clock(booking.vence_en)}` : ''}
                </p>
                {unpaid ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        pay.reset();
                        setReceived('');
                        setPaying(booking);
                      }}
                    >
                      Cobrar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        cancel.reset();
                        setCanceling(booking);
                      }}
                    >
                      Liberar cancha / Cancelar
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Ya está pagada: no se cancela desde aquí hasta definir el reembolso.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={Boolean(canceling)}
        onOpenChange={(open) => !open && setCanceling(null)}
        title="Liberar cancha"
        description={
          canceling
            ? `¿Cancelar la reserva de ${canceling.cliente?.nombre ?? 'el cliente'} en ${canceling.espacio.nombre}, de ${clock(canceling.inicio)} a ${clock(canceling.fin)}? El horario queda libre y el cliente verá su pedido como cancelado por el establecimiento.`
            : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="danger" loading={cancel.isPending} onClick={() => canceling && cancel.mutate(canceling)}>
            Sí, cancelar reserva
          </Button>
          <Button type="button" variant="ghost" onClick={() => setCanceling(null)}>
            No, conservar
          </Button>
        </div>
      </Modal>
      <Modal
        open={Boolean(paying)}
        onOpenChange={(open) => !open && setPaying(null)}
        title="Cobrar reserva en efectivo"
        description={paying ? `${paying.espacio.nombre} · ${formatMoney(paying.monto)}` : undefined}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (paying && MONEY_PATTERN.test(received)) pay.mutate(paying);
          }}
        >
          <Field
            label="Efectivo recibido"
            name="booking-received"
            inputMode="decimal"
            value={received}
            onChange={(event) => setReceived(event.target.value)}
            hint={change ? `Cambio: ${formatMoney(change)}` : undefined}
          />
          {pay.isError && <Feedback tone="error">{errorMessage(pay.error)}</Feedback>}
          <Button type="submit" loading={pay.isPending} disabled={!MONEY_PATTERN.test(received)}>
            Cobrar
          </Button>
        </form>
      </Modal>
    </section>
  );
}
