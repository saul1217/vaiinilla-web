// Agenda de reservas del negocio: por día y por cancha, crear (renta de mostrador por cobrar en
// Caja), mover a otro horario y cancelar (con reembolso si ya se pagó). Paridad con Mesas y
// espacios › Reservas y la renta de mostrador de Android. Contrato: docs/reservas-cancha.md del back;
// solo usa GET /reservas/disponibilidad, GET /reservas?fecha=, POST /reservas, POST /reservas/:id/pago
// (efectivo sin monto) y POST /reservas/:id/cancelacion.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Redirect } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback, Field, Modal, SelectField } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { AGENDA_ENABLED } from '../lib/agenda-feature';
import {
  STATUS_LABEL,
  agendaKeys,
  availableDurations,
  bookableDates,
  bookingMinutes,
  bookingName,
  bookingSpaceId,
  canCancel,
  canMove,
  clockIn,
  dateLabel,
  durationLabel,
  freeStarts,
  isLive,
  moveBooking,
  needsRefund,
} from '../lib/agenda';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import { formatMoney, moneyToCents, normalizeMoneyInput } from '../lib/money';
import { tenantHomePath } from '../lib/tenant-route';
import type { CourtAvailabilityDay, StaffBooking } from '../types/api';

const BADGE: Record<string, string> = {
  pendiente_pago: 'pendiente',
  confirmada: 'activo',
  en_curso: 'activo',
  terminada: 'reemplazada',
  cancelada: 'revocada',
  expirada: 'expirada',
  conflicto: 'suspendido',
};

function actionError(error: unknown): string {
  if (error instanceof VaiinillaApiError && error.status === 403) return 'Tu rol no tiene permiso para esta acción.';
  return errorMessage(error);
}

export function AgendaPage() {
  const { tenant } = useSessions();
  if (!tenant) return null;
  // Con la bandera apagada no se monta nada que llame a la API.
  if (!AGENDA_ENABLED) return <Redirect to={tenantHomePath(tenant.context.rol)} />;
  const storeId = tenant.context.establecimiento_id;
  return <AgendaScreen key={`${storeId}:${tenant.context.membresia_id}`} token={tenant.token} storeId={storeId} />;
}

type FormState = { kind: 'create'; espacioId?: number; inicio?: string } | { kind: 'move'; booking: StaffBooking };

function AgendaScreen({ token, storeId }: { token: string; storeId: string }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [canceling, setCanceling] = useState<StaffBooking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const day = useQuery({
    queryKey: agendaKeys.day(storeId, date),
    enabled: Boolean(token),
    queryFn: () => api.courtAvailability(token, date ?? undefined),
  });
  const shownDate = day.data?.fecha ?? null;
  const bookings = useQuery({
    queryKey: agendaKeys.bookings(storeId, shownDate ?? ''),
    enabled: Boolean(token && shownDate),
    queryFn: () => api.listStaffBookings(token, shownDate!),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: agendaKeys.all(storeId) });

  const done = async (message: string) => {
    setNotice(message);
    await refresh();
  };

  let body;
  if (day.isLoading) body = <LoadingState label="Cargando la agenda…" cards={2} />;
  else if (day.isError) {
    body = <Feedback tone="error">
      {day.error instanceof VaiinillaApiError && day.error.status === 403 ? 'Tu rol no tiene permiso para ver la agenda.' : `No se pudo cargar la agenda: ${errorMessage(day.error)}`}{' '}
      <VaiButton variant="secondary" onClick={() => void day.refetch()}>Reintentar</VaiButton>
    </Feedback>;
  } else if (day.data) {
    body = <AgendaDay
      day={day.data}
      now={bookings.dataUpdatedAt || day.dataUpdatedAt}
      bookings={bookings.data ?? []}
      bookingsLoading={bookings.isLoading}
      bookingsError={bookings.isError ? bookings.error : null}
      onSelectDate={(next) => { setNotice(null); setDate(next); }}
      onCreate={(espacioId, inicio) => setForm({ kind: 'create', espacioId, inicio })}
      onMove={(booking) => setForm({ kind: 'move', booking })}
      onCancel={(booking) => setCanceling(booking)}
    />;
  }

  return <div className="grid gap-5">
    <AppPageHeader eyebrow="Reservas" title="Agenda" description="Las reservas de tus canchas por día: aparta, mueve o cancela."
      action={<div className="flex flex-wrap gap-2">
        <VaiButton variant="secondary" onClick={() => void refresh()}><RefreshCw aria-hidden="true" className="size-4" /> Actualizar</VaiButton>
        {day.data && !day.data.cerrado && day.data.canchas.some((court) => court.rentable) && (
          <VaiButton variant="accent" onClick={() => setForm({ kind: 'create' })}><Plus aria-hidden="true" className="size-4" /> Nueva reserva</VaiButton>
        )}
      </div>} />
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {body}
    {form && shownDate && day.data && (
      <BookingFormModal
        token={token}
        storeId={storeId}
        initialDate={shownDate}
        dates={bookableDates(day.data)}
        today={day.data.hoy}
        state={form}
        onClose={() => setForm(null)}
        onDone={async (message) => { setForm(null); await done(message); }}
      />
    )}
    {canceling && day.data && (
      <CancelModal
        token={token}
        booking={canceling}
        timeZone={day.data.zona_horaria}
        onClose={() => setCanceling(null)}
        onDone={async (message) => { setCanceling(null); await done(message); }}
        onError={() => void refresh()}
      />
    )}
  </div>;
}

function AgendaDay({ day, now, bookings, bookingsLoading, bookingsError, onSelectDate, onCreate, onMove, onCancel }: {
  day: CourtAvailabilityDay;
  /** Hora de la última lectura de reservas: decide qué ya empezó sin leer el reloj al pintar. */
  now: number;
  bookings: StaffBooking[];
  bookingsLoading: boolean;
  bookingsError: unknown;
  onSelectDate: (date: string) => void;
  onCreate: (espacioId: number, inicio: string) => void;
  onMove: (booking: StaffBooking) => void;
  onCancel: (booking: StaffBooking) => void;
}) {
  const courts = day.canchas.filter((court) => court.rentable);
  const live = bookings.filter(isLive).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const courtIds = new Set(courts.map((court) => court.espacio.id));
  const others = live.filter((booking) => !courtIds.has(bookingSpaceId(booking) ?? -1));
  return <>
    <ChipRow label="Día de la agenda" scroll>
      {bookableDates(day).map((value) => (
        <Chip key={value} selected={value === day.fecha} onClick={() => onSelectDate(value)}>{dateLabel(value, day.hoy)}</Chip>
      ))}
    </ChipRow>
    {bookingsError ? <Feedback tone="error">No se pudieron cargar las reservas: {actionError(bookingsError)}</Feedback> : null}
    {courts.length === 0 ? (
      <VaiEmptyState icon={<CalendarDays />} title="No hay canchas que se renten"
        message="Pon precio por hora a una cancha en Mesas y espacios para que se pueda reservar." />
    ) : (
      <>
        {day.cerrado && <Feedback tone="info">Ese día el lugar no abre: no se aparta ninguna cancha.</Feedback>}
        {bookingsLoading && <p className="text-sm text-muted">Consultando reservas…</p>}
        {courts.map((court) => {
          const rows = live.filter((booking) => bookingSpaceId(booking) === court.espacio.id);
          const starts = freeStarts(day, court);
          return <Card key={court.espacio.id} title={court.espacio.nombre}
            description={court.precio_hora ? `${formatMoney(court.precio_hora)} por hora` : undefined}>
            {rows.length === 0 ? <p className="text-sm text-muted">Sin reservas este día.</p> : (
              <ul className="grid gap-3" aria-label={`Reservas de ${court.espacio.nombre}`}>
                {rows.map((booking) => <BookingRow key={booking.id} booking={booking} timeZone={day.zona_horaria} now={now} onMove={onMove} onCancel={onCancel} />)}
              </ul>
            )}
            {!day.cerrado && (starts.length > 0 ? (
              <div className="mt-4 grid gap-2">
                <p className="text-sm font-semibold text-ink">Horarios libres</p>
                <ChipRow label={`Horarios libres de ${court.espacio.nombre}`} scroll>
                  {starts.map((start) => (
                    <Chip key={start} selected={false} onClick={() => onCreate(court.espacio.id, start)}>{clockIn(start, day.zona_horaria)}</Chip>
                  ))}
                </ChipRow>
              </div>
            ) : <p className="mt-3 text-sm text-muted">No quedan horarios libres este día.</p>)}
          </Card>;
        })}
        {others.length > 0 && (
          <Card title="Otros espacios">
            <ul className="grid gap-3">
              {others.map((booking) => <BookingRow key={booking.id} booking={booking} timeZone={day.zona_horaria} now={now} onMove={onMove} onCancel={onCancel} />)}
            </ul>
          </Card>
        )}
      </>
    )}
  </>;
}

function BookingRow({ booking, timeZone, now, onMove, onCancel }: {
  booking: StaffBooking;
  timeZone: string;
  now: number;
  onMove: (booking: StaffBooking) => void;
  onCancel: (booking: StaffBooking) => void;
}) {
  const pending = booking.estado === 'pendiente_pago';
  const details = [
    bookingName(booking),
    durationLabel(bookingMinutes(booking)),
    booking.monto ? formatMoney(booking.monto) : null,
    pending && booking.expira_en ? `Vence ${clockIn(booking.expira_en, timeZone)}` : null,
  ].filter(Boolean).join(' · ');
  return <li className="grid gap-2 rounded-2xl bg-cream p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-extrabold text-ink" data-qa-volatil>{clockIn(booking.inicio, timeZone)}–{clockIn(booking.fin, timeZone)}</p>
      <span className={`status-badge status-badge--${BADGE[booking.estado] ?? 'pendiente'}`}>{STATUS_LABEL[booking.estado] ?? booking.estado}</span>
    </div>
    <p className="text-sm text-muted" data-qa-volatil>{details}</p>
    {(canMove(booking, now) || canCancel(booking, now)) ? (
      <div className="flex flex-wrap gap-2">
        {canMove(booking, now) && <VaiButton variant="secondary" onClick={() => onMove(booking)}>Mover</VaiButton>}
        {canCancel(booking, now) && (
          <VaiButton variant="coral" onClick={() => onCancel(booking)}>{needsRefund(booking) ? 'Cancelar y reembolsar' : 'Cancelar'}</VaiButton>
        )}
      </div>
    ) : booking.estado === 'en_curso' || (booking.estado === 'confirmada' && Date.parse(booking.inicio) <= now) ? (
      <p className="text-xs text-muted">Ya empezó: no se mueve ni se cancela.</p>
    ) : null}
    {booking.estado === 'confirmada' && Date.parse(booking.inicio) > now && (
      <p className="text-xs text-muted">Pagada: para cambiarla de horario, cancélala con reembolso y aparta el nuevo.</p>
    )}
  </li>;
}

function BookingFormModal({ token, storeId, initialDate, dates, today, state, onClose, onDone }: {
  token: string;
  storeId: string;
  initialDate: string;
  dates: string[];
  today: string;
  state: FormState;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const moving = state.kind === 'move' ? state.booking : null;
  const [date, setDate] = useState(initialDate);
  const [spaceId, setSpaceId] = useState<number | null>(moving ? bookingSpaceId(moving) : state.kind === 'create' ? state.espacioId ?? null : null);
  const [start, setStart] = useState<string>(state.kind === 'create' ? state.inicio ?? '' : '');
  const [minutes, setMinutes] = useState<number | null>(moving ? bookingMinutes(moving) : null);
  const [name, setName] = useState('');

  const day = useQuery({
    queryKey: agendaKeys.day(storeId, date),
    enabled: Boolean(token),
    queryFn: () => api.courtAvailability(token, date),
  });
  const courts = (day.data?.canchas ?? []).filter((court) => court.rentable);
  const court = courts.find((item) => item.espacio.id === spaceId) ?? courts[0];
  const starts = day.data && court ? freeStarts(day.data, court) : [];
  const chosenStart = starts.includes(start) ? start : '';
  const durations = day.data && court && chosenStart ? availableDurations(day.data, court, chosenStart) : [];
  const chosenMinutes = minutes !== null && durations.includes(minutes) ? minutes : durations[0] ?? null;
  const zone = day.data?.zona_horaria ?? 'America/Mexico_City';
  const nameError = name.trim().length > 120 ? 'Hasta 120 caracteres.' : undefined;
  const ready = Boolean(court && chosenStart && chosenMinutes && !nameError);

  const save = useMutation({
    mutationFn: async () => {
      const target = { espacio_id: court!.espacio.id, inicio: chosenStart, duracion_min: chosenMinutes! };
      if (moving) {
        return moveBooking({
          create: (input) => api.createStaffBooking(token, input, createIdempotencyKey()),
          markCashLater: (id) => api.markBookingCashLater(token, id, createIdempotencyKey()),
          cancel: (id) => api.cancelCounterRental(token, id),
        }, moving, target);
      }
      const trimmed = name.trim();
      const created = await api.createStaffBooking(token, { ...target, ...(trimmed ? { nombre_cliente: trimmed } : {}) }, createIdempotencyKey());
      try {
        await api.markBookingCashLater(token, created.id, createIdempotencyKey());
      } catch {
        return { ...created, holdOnly: true };
      }
      return created;
    },
    onSuccess: async (result) => {
      const when = `${dateLabel(date, today).toLowerCase()} a las ${clockIn(chosenStart, zone)}`;
      if (moving) await onDone(`Reserva movida a ${court!.espacio.nombre}, ${when}.`);
      else if ('holdOnly' in result) await onDone(`Horario apartado en ${court!.espacio.nombre}, ${when}, pero no quedó por cobrar en Caja: cóbralo en los próximos 10 minutos o vence.`);
      else await onDone(`Reserva creada en ${court!.espacio.nombre}, ${when}. Queda por cobrar en Caja.`);
    },
  });

  return <Modal open onOpenChange={(open) => !open && onClose()}
    title={moving ? 'Mover reserva' : 'Nueva reserva'}
    description={moving
      ? `${bookingName(moving)}: ahora está de ${clockIn(moving.inicio, zone)} a ${clockIn(moving.fin, zone)}. Elige el horario nuevo; el anterior se libera al confirmar.`
      : 'Aparta una cancha para alguien que llamó o llegó. Queda por cobrar en Caja.'}>
    <div className="grid gap-3">
      <SelectField label="Día" value={date} onChange={(event) => { setDate(event.target.value); setStart(''); }}>
        {dates.map((value) => <option key={value} value={value}>{dateLabel(value, today)} ({value})</option>)}
      </SelectField>
      {day.isLoading && <p className="text-sm text-muted">Consultando horarios…</p>}
      {day.isError && <Feedback tone="error">No se pudieron cargar los horarios: {errorMessage(day.error)}</Feedback>}
      {day.data && (day.data.cerrado ? <Feedback tone="info">Ese día el lugar no abre.</Feedback> : <>
        <SelectField label="Cancha" value={court?.espacio.id ?? ''} onChange={(event) => { setSpaceId(Number(event.target.value)); setStart(''); }}>
          {courts.map((item) => <option key={item.espacio.id} value={item.espacio.id}>{item.espacio.nombre}</option>)}
        </SelectField>
        <SelectField label="Empieza" value={chosenStart} onChange={(event) => setStart(event.target.value)}
          hint={starts.length === 0 ? 'No quedan horarios libres en esta cancha ese día.' : undefined}>
          <option value="">Elige la hora</option>
          {starts.map((value) => <option key={value} value={value}>{clockIn(value, zone)}</option>)}
        </SelectField>
        <SelectField label="Duración" value={chosenMinutes ?? ''} disabled={!chosenStart} onChange={(event) => setMinutes(Number(event.target.value))}>
          {durations.map((value) => <option key={value} value={value}>{durationLabel(value)}</option>)}
        </SelectField>
        {!moving && <Field label="Nombre del cliente (opcional)" name="agenda-customer-name" maxLength={120} value={name}
          onChange={(event) => setName(event.target.value)} error={nameError} />}
      </>)}
      {save.isError && <Feedback tone="error">{actionError(save.error)}</Feedback>}
      <div className="flex flex-wrap gap-2">
        <VaiButton variant="accent" loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
          {moving ? 'Mover reserva' : 'Apartar'}
        </VaiButton>
        <VaiButton variant="quiet" onClick={onClose}>Cerrar</VaiButton>
      </div>
    </div>
  </Modal>;
}

function CancelModal({ token, booking, timeZone, onClose, onDone, onError }: {
  token: string;
  booking: StaffBooking;
  timeZone: string;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
  onError: () => void;
}) {
  const paid = needsRefund(booking);
  const [reason, setReason] = useState('');
  const [refundAmount, setRefundAmount] = useState(booking.monto ?? '0.00');
  const refundCents = moneyToCents(normalizeMoneyInput(refundAmount));
  const paidCents = booking.monto ? moneyToCents(booking.monto) : null;
  const refundError = refundCents === null
    ? 'Escribe un monto válido, de 0 al total pagado.'
    : paidCents !== null && refundCents > paidCents ? 'El reembolso no puede ser mayor a lo pagado.' : null;
  const reasonLength = reason.trim().length;
  const valid = !paid || (reasonLength >= 3 && reasonLength <= 240 && !refundError);
  const cancel = useMutation({
    mutationFn: () => api.cancelCounterRental(token, booking.id,
      paid ? { motivo: reason.trim(), monto_reembolso: normalizeMoneyInput(refundAmount) } : undefined),
    onSuccess: () => onDone(paid ? 'Reserva cancelada y reembolso registrado.' : 'Reserva cancelada. El horario quedó libre.'),
    onError,
  });
  return <Modal open onOpenChange={(open) => !open && onClose()}
    title={paid ? 'Cancelar reserva pagada' : 'Cancelar reserva'}
    description={`¿Cancelar la reserva de ${bookingName(booking)} en ${booking.espacio?.nombre ?? 'la cancha'}, de ${clockIn(booking.inicio, timeZone)} a ${clockIn(booking.fin, timeZone)}? El horario queda libre${paid ? '. Elige cuánto se reembolsa (de $0 a lo pagado) y escribe el motivo.' : '.'}`}>
    {paid && <div className="mb-3 grid gap-3">
      <Field label="Monto a reembolsar" name="agenda-refund-amount" inputMode="decimal" value={refundAmount}
        onChange={(event) => setRefundAmount(event.target.value)} error={refundError ?? undefined}
        hint={booking.monto ? `Pagado: ${formatMoney(booking.monto)}. Puedes reembolsar $0.` : undefined} />
      <Field label="Motivo (3 a 240 caracteres)" name="agenda-refund-reason" maxLength={240} value={reason}
        onChange={(event) => setReason(event.target.value)} />
    </div>}
    {cancel.isError && <Feedback tone="error">{actionError(cancel.error)}</Feedback>}
    <div className="flex flex-wrap gap-2">
      <VaiButton variant="coral" loading={cancel.isPending} disabled={!valid} onClick={() => cancel.mutate()}>Sí, cancelar reserva</VaiButton>
      <VaiButton variant="quiet" onClick={onClose}>No, conservar</VaiButton>
    </div>
  </Modal>;
}
