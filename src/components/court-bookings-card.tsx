// Reservas de cancha del día para caja: quién, qué cancha, a qué hora, si ya pagó o paga en
// efectivo, y cuándo vence el apartado. Cobrar (efectivo) o liberar/cancelar la que no llegó.
// Contrato: GET /reservas?fecha=, POST /reservas/:id/pago y /reservas/:id/cancelacion.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button, Feedback, Field, Modal } from './ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { MONEY_PATTERN, calculateChange, moneyToCents, formatMoney, normalizeMoneyInput } from '../lib/money';
import { clock } from '../lib/space-status';
import type { StaffBooking } from '../types/api';

function localDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: 'Por pagar en efectivo',
  confirmada: 'Pagada',
  en_curso: 'Pagada',
  terminada: 'Pagada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  conflicto: 'Con conflicto',
};
const PAID = new Set(['confirmada', 'en_curso', 'terminada']);
// Solo la confirmada se cancela; una reserva iniciada o terminada ya no (RESERVATION_IN_PROGRESS).
const REFUNDABLE = new Set(['confirmada']);

function actionError(error: unknown): string {
  if (error instanceof VaiinillaApiError && error.status === 403) {
    return 'Tu rol no tiene permiso para esta acción todavía. Pide a un cajero que la haga o espera la actualización del backend.';
  }
  return errorMessage(error);
}

export function CourtBookingsCard() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const date = localDate();
  const [paying, setPaying] = useState<StaffBooking | null>(null);
  const [received, setReceived] = useState('');
  const [canceling, setCanceling] = useState<StaffBooking | null>(null);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = ['court-bookings', scopeId, date];
  // Espera sesión y establecimiento (evita pedir sin token o con otro alcance). Un 404 puntual
  // en la primera carga se reintenta una vez antes de mostrarse; siempre refresca al abrir.
  const bookings = useQuery({
    queryKey,
    enabled: Boolean(token && scopeId),
    refetchOnMount: 'always',
    retry: (failureCount, error) => {
      if (error instanceof VaiinillaApiError) {
        if (error.status === 404) return failureCount < 1;
        if (error.status < 500) return false;
      }
      return failureCount < 2;
    },
    retryDelay: 600,
    queryFn: () => api.listStaffBookings(token, date),
  });
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
    mutationFn: (booking: StaffBooking) =>
      api.cancelCounterRental(
        token,
        booking.id,
        REFUNDABLE.has(booking.estado)
          ? { motivo: reason.trim(), monto_reembolso: normalizeMoneyInput(refundAmount) }
          : undefined,
      ),
    onSuccess: async () => {
      const refunded = canceling && REFUNDABLE.has(canceling.estado);
      setCanceling(null);
      setNotice(refunded ? 'Reserva cancelada y reembolso registrado.' : 'Cancha liberada. La reserva quedó cancelada.');
      await refresh();
    },
    onError: () => void refresh(),
  });

  const rows = (bookings.data ?? []).filter((booking) => booking.estado !== 'cancelada');
  const cancelingPaid = Boolean(canceling && REFUNDABLE.has(canceling.estado));
  const refundCents = moneyToCents(normalizeMoneyInput(refundAmount));
  const paidCents = canceling?.monto ? moneyToCents(canceling.monto) : null;
  const refundError =
    refundCents === null
      ? 'Escribe un monto válido, de 0 al total pagado.'
      : paidCents !== null && refundCents > paidCents
        ? 'El reembolso no puede ser mayor a lo pagado.'
        : null;
  const reasonLength = reason.trim().length;
  const canConfirmCancel = !cancelingPaid || (reasonLength >= 3 && reasonLength <= 240 && !refundError);
  const openCancel = (booking: StaffBooking) => {
    cancel.reset();
    setReason('');
    setRefundAmount(booking.monto ?? '0.00');
    setCanceling(booking);
  };
  const change = paying?.monto && MONEY_PATTERN.test(received) ? calculateChange(received, paying.monto) : null;

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
      {bookings.isError && !bookings.isFetching && <Feedback tone="error">{bookings.error instanceof VaiinillaApiError && bookings.error.status === 403
            ? 'Tu rol no tiene permiso para ver las reservas.'
            : errorMessage(bookings.error)}</Feedback>}
      {cancel.isError && <Feedback tone="error">{actionError(cancel.error)}</Feedback>}
      {bookings.isLoading && <p className="text-sm text-muted">Consultando reservas…</p>}
      {bookings.isSuccess && rows.length === 0 && <p className="text-sm text-muted">No hay reservas para hoy.</p>}
      {rows.length > 0 && (
        <ul className="grid gap-3">
          {rows.map((booking) => {
            const unpaid = booking.estado === 'pendiente_pago';
            const paid = PAID.has(booking.estado);
            const spaceName = booking.espacio?.nombre ?? 'Cancha';
            return (
              <li key={booking.id} className="grid gap-2 rounded-2xl bg-cream p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold text-ink" data-qa-volatil>
                    {spaceName} · {clock(booking.inicio)}–{clock(booking.fin)}
                  </p>
                  <span className={`status-badge ${paid ? 'status-badge--success' : 'status-badge--warning'}`}>
                    {STATUS_LABEL[booking.estado] ?? booking.estado}
                  </span>
                </div>
                <p className="text-sm text-muted" data-qa-volatil>
                  {booking.cliente?.nombre ?? 'Cliente'} · {booking.monto ? formatMoney(booking.monto) : 'Monto por confirmar'}
                  {unpaid && booking.expira_en ? ` · Vence ${clock(booking.expira_en)}` : ''}
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
                      onClick={() => openCancel(booking)}
                    >
                      Liberar cancha / Cancelar
                    </Button>
                  </div>
                ) : REFUNDABLE.has(booking.estado) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="danger" onClick={() => openCancel(booking)}>
                      Cancelar y reembolsar
                    </Button>
                  </div>
                ) : paid ? (
                  <p className="text-xs text-muted">La reserva ya inició: no se puede cancelar.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={Boolean(canceling)}
        onOpenChange={(open) => !open && setCanceling(null)}
        title={cancelingPaid ? 'Cancelar reserva pagada' : 'Liberar cancha'}
        description={
          canceling
            ? `¿Cancelar la reserva de ${canceling.cliente?.nombre ?? 'el cliente'} en ${canceling.espacio?.nombre ?? 'la cancha'}, de ${clock(canceling.inicio)} a ${clock(canceling.fin)}? El horario queda libre${cancelingPaid ? '. Elige cuánto se reembolsa (de $0 a lo pagado) y escribe el motivo.' : ' y el cliente verá su pedido como cancelado por el establecimiento.'}`
            : undefined
        }
      >
        {cancelingPaid && (
          <div className="mb-3 grid gap-3">
            <Field
              label="Monto a reembolsar"
              name="booking-refund-amount"
              inputMode="decimal"
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
              error={refundError ?? undefined}
              hint={canceling?.monto ? `Pagado: ${formatMoney(canceling.monto)}. Puedes reembolsar $0.` : undefined}
            />
            <Field
              label="Motivo (3 a 240 caracteres)"
              name="booking-refund-reason"
              maxLength={240}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}
        {cancel.isError && <Feedback tone="error">{actionError(cancel.error)}</Feedback>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="danger"
            loading={cancel.isPending}
            disabled={!canConfirmCancel}
            onClick={() => canceling && cancel.mutate(canceling)}
          >
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
        description={paying ? `${paying.espacio?.nombre ?? 'Cancha'}${paying.monto ? ` · ${formatMoney(paying.monto)}` : ''}` : undefined}
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
          {pay.isError && <Feedback tone="error">{actionError(pay.error)}</Feedback>}
          <Button type="submit" loading={pay.isPending} disabled={!MONEY_PATTERN.test(received)}>
            Cobrar
          </Button>
        </form>
      </Modal>
    </section>
  );
}
