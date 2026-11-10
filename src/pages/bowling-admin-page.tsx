import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Minus, Plus, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback, Field, Modal } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import {
  DEFAULT_LANE_BATCH,
  MAX_CAPACITY,
  bookingStatusLabel,
  bookingWho,
  bowlingErrorMessage,
  bowlingKeys,
  canEditLanes,
  canRentLanes,
  canRequestRental,
  capacityLabel,
  durationLabel,
  isBowling,
  laneBatchCount,
  laneBatchInput,
  laneDetail,
  laneDurations,
  laneStatus,
  lanesOf,
  liveBookings,
  maxPlayers,
  parseCapacity,
  playersLabel,
  renewalStart,
  rentalChange,
  rentalPrice,
  stepPlayers,
  type LaneBatchDraft,
  type LaneStatus,
} from '../lib/bowling-admin';
import { createIdempotencyKey } from '../lib/idempotency';
import { parseHourlyPrice } from '../lib/hourly-price';
import { formatMoney, normalizeMoneyInput } from '../lib/money';
import { clock } from '../lib/space-status';
import type { CourtAvailabilityDay, CourtAvailabilityCourt, ManagedSpace, SpaceAvailability, StaffBooking } from '../types/api';

type Section = 'pistas' | 'turnos' | 'configurar';

/** Lo que se está rentando: la pista, si es renovación y desde cuándo. */
interface RentDraft {
  court: CourtAvailabilityCourt;
  renewalFrom: string | null;
}

/** Lo que se cobra en efectivo: una renta recién apartada o un turno del día por cobrar. */
interface Charge {
  id: string;
  title: string;
  amount: string;
  /** La apartó esta pantalla: si se cierra sin cobrar, se suelta el horario. */
  release: boolean;
}

export function BowlingAdminPage() {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const { establecimiento_id: storeId, membresia_id: membershipId, rol } = tenant.context;
  // Remontar al cambiar de negocio o de membresía descarta lo que quedó a medias de la sesión anterior.
  return <BowlingScreen key={`${storeId}:${membershipId}`} token={tenant.token} storeId={storeId} role={rol} />;
}

function BowlingScreen({ token, storeId, role }: { token: string; storeId: string; role: string }) {
  const keys = bowlingKeys(storeId);
  const queryClient = useQueryClient();
  const editor = canEditLanes(role);
  const renter = canRentLanes(role);
  const [section, setSection] = useState<Section>('pistas');
  const [rent, setRent] = useState<RentDraft | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availability = useQuery({
    queryKey: keys.availability,
    enabled: Boolean(token),
    refetchInterval: 30_000,
    queryFn: () => api.courtAvailability(token),
  });
  const bowling = isBowling(availability.data);
  const board = useQuery({
    queryKey: keys.board,
    enabled: Boolean(token) && bowling,
    refetchInterval: 30_000,
    queryFn: () => api.spaceAvailability(token),
  });
  const date = availability.data?.fecha ?? '';
  const bookings = useQuery({
    queryKey: keys.bookings(date),
    enabled: Boolean(token) && bowling && Boolean(date),
    refetchInterval: 30_000,
    queryFn: () => api.listStaffBookings(token, date),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['boliche', storeId] });
  }

  function closeCharge() {
    const pending = charge;
    setCharge(null);
    // No se cobró la renta que se acaba de apartar: se suelta el horario para que otro lo tome.
    if (pending?.release) void api.cancelCounterRental(token, pending.id).catch(() => undefined).finally(() => void refresh());
  }

  if (availability.isPending) return <LoadingState label="Cargando las pistas…" />;
  if (availability.isError) {
    return (
      <div className="grid gap-4">
        <AppPageHeader eyebrow="Boliche" title="Pistas" />
        <Feedback tone="error">{errorMessage(availability.error)}</Feedback>
      </div>
    );
  }
  if (!bowling) {
    return (
      <div className="grid gap-4">
        <AppPageHeader eyebrow="Boliche" title="Pistas" />
        <VaiEmptyState
          icon={<CalendarClock />}
          title="Este negocio no es un boliche"
          message="La administración de pistas solo aplica a negocios de tipo boliche. Las canchas se manejan desde Mesas y espacios."
        />
      </div>
    );
  }

  const data = availability.data;
  const boardBySpace = new Map<number, SpaceAvailability>((board.data ?? []).map((item) => [Number(item.espacio.id), item]));
  const sections: { id: Section; label: string }[] = [
    { id: 'pistas', label: 'Pistas ahora' },
    { id: 'turnos', label: 'Turnos de hoy' },
    ...(editor ? [{ id: 'configurar' as const, label: 'Configurar pistas' }] : []),
  ];

  return (
    <div className="grid gap-4">
      <AppPageHeader
        eyebrow="Boliche"
        title="Pistas"
        description={`Se rentan de ${data.apertura} a ${data.cierre}. La renta se cobra primero, en efectivo, con los jugadores anotados.`}
        action={
          <VaiButton variant="secondary" onClick={() => void refresh()} aria-label="Actualizar pistas">
            <RefreshCw aria-hidden="true" className="size-4" /> Actualizar
          </VaiButton>
        }
      />
      <ChipRow label="Secciones del boliche">
        {sections.map((item) => (
          <Chip key={item.id} selected={section === item.id} onClick={() => setSection(item.id)}>
            {item.label}
          </Chip>
        ))}
      </ChipRow>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {data.cerrado && <Feedback tone="info">Hoy el lugar no abre: no se rentan pistas.</Feedback>}

      {section === 'pistas' && (
        <LanesNow
          availability={data}
          board={boardBySpace}
          canRent={renter}
          onRent={(court, renewalFrom) => {
            setNotice(null);
            setRent({ court, renewalFrom });
          }}
        />
      )}
      {section === 'turnos' && (
        <TodayBookings
          query={bookings}
          canCharge={renter}
          onCharge={(booking) => {
            setNotice(null);
            setCharge({
              id: booking.id,
              title: `Cobrar ${booking.espacio?.nombre ?? 'pista'} · ${clock(booking.inicio)} a ${clock(booking.fin)}`,
              amount: booking.monto ?? '0.00',
              release: false,
            });
          }}
        />
      )}
      {section === 'configurar' && editor && <LanesConfig token={token} storeId={storeId} onChanged={refresh} />}

      {rent && (
        <RentLaneDialog
          token={token}
          draft={rent}
          availability={data}
          onClose={() => setRent(null)}
          onReserved={(created) => {
            setRent(null);
            setCharge({
              id: created.id,
              title: `Cobrar ${created.espacio?.nombre ?? rent.court.espacio.nombre} · ${clock(created.inicio)} a ${clock(created.fin)}`,
              amount: created.monto,
              release: true,
            });
          }}
        />
      )}
      {charge && (
        <ChargeDialog
          token={token}
          charge={charge}
          onClose={closeCharge}
          onPaid={async (text) => {
            setCharge(null);
            setNotice(text);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function laneStateText(status: LaneStatus): string {
  switch (status.state) {
    case 'en_turno':
      return status.until ? `En turno hasta ${clock(status.until)}` : 'En turno';
    case 'reservada':
      return `Libre · reservada a las ${clock(status.next)}`;
    case 'cerrada':
      return 'Cerrada hoy';
    case 'sin_precio':
      return 'Sin precio: no se renta';
    default:
      return 'Libre';
  }
}

function LanesNow({
  availability,
  board,
  canRent,
  onRent,
}: {
  availability: CourtAvailabilityDay;
  board: Map<number, SpaceAvailability>;
  canRent: boolean;
  onRent: (court: CourtAvailabilityCourt, renewalFrom: string | null) => void;
}) {
  const now = new Date();
  if (availability.canchas.length === 0) {
    return (
      <VaiEmptyState
        icon={<CalendarClock />}
        title="Todavía no hay pistas"
        message="El administrador las da de alta en Configurar pistas, con su precio por hora y cuántos caben."
      />
    );
  }
  return (
    <ul className="grid gap-3" aria-label="Pistas">
      {availability.canchas.map((court) => {
        const spaceBoard = board.get(Number(court.espacio.id)) ?? null;
        const status = laneStatus(court, now, spaceBoard);
        const renewFrom = renewalStart(spaceBoard);
        const free = status.state === 'libre' || status.state === 'reservada';
        return (
          <li key={court.espacio.id}>
            <Card as="article" aria-label={court.espacio.nombre} title={court.espacio.nombre}>
              <p className="text-sm">{laneStateText(status)}</p>
              <p className="text-sm text-ink-muted">
                {court.precio_hora ? `${formatMoney(court.precio_hora)} por hora · ` : ''}
                {capacityLabel(court.capacidad)}
              </p>
              {canRent && free && !availability.cerrado && (
                <VaiButton variant="accent" onClick={() => onRent(court, null)}>
                  Rentar ahora
                </VaiButton>
              )}
              {canRent && status.state === 'en_turno' && renewFrom && (
                <VaiButton variant="secondary" onClick={() => onRent(court, renewFrom)}>
                  Alargar turno
                </VaiButton>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function TodayBookings({
  query,
  canCharge,
  onCharge,
}: {
  query: { data?: StaffBooking[]; isPending: boolean; isError: boolean; error: unknown };
  canCharge: boolean;
  onCharge: (booking: StaffBooking) => void;
}) {
  if (query.isPending) return <LoadingState label="Cargando los turnos…" cards={2} />;
  if (query.isError) return <Feedback tone="error">{errorMessage(query.error)}</Feedback>;
  const list = liveBookings(query.data ?? []);
  if (list.length === 0) {
    return <VaiEmptyState icon={<CalendarClock />} title="Sin turnos hoy" message="Las rentas de hoy, de clientes y de mostrador, aparecen aquí." />;
  }
  return (
    <ul className="grid gap-3" aria-label="Turnos de hoy">
      {list.map((booking) => {
        const who = bookingWho(booking);
        return (
          <li key={booking.id}>
            <Card as="article" aria-label={`${booking.espacio?.nombre ?? 'Pista'} ${clock(booking.inicio)}`}>
              <p className="text-sm font-extrabold text-ink">
                {booking.espacio?.nombre ?? 'Pista'} · {clock(booking.inicio)} a {clock(booking.fin)}
              </p>
              <p className="text-sm">
                {bookingStatusLabel(booking.estado)}
                {booking.monto ? ` · ${formatMoney(booking.monto)}` : ''}
                {who ? ` · ${who}` : ''}
              </p>
              {canCharge && booking.estado === 'pendiente_pago' && booking.monto && (
                <VaiButton variant="accent" onClick={() => onCharge(booking)}>
                  Cobrar en efectivo
                </VaiButton>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function RentLaneDialog({
  token,
  draft,
  availability,
  onClose,
  onReserved,
}: {
  token: string;
  draft: RentDraft;
  availability: CourtAvailabilityDay;
  onClose: () => void;
  onReserved: (created: { id: string; monto: string; inicio: string; fin: string; espacio?: { nombre: string } | null }) => void;
}) {
  const { court, renewalFrom } = draft;
  const renewal = renewalFrom !== null;
  const durations = laneDurations(court, availability);
  const max = maxPlayers(court);
  const [minutes, setMinutes] = useState<number | null>(durations[0] ?? null);
  const [players, setPlayers] = useState(0);
  const [name, setName] = useState('');
  const price = minutes ? rentalPrice(court.precio_hora, minutes) : null;
  const ready = minutes !== null && canRequestRental(players, max, renewal);

  const reserve = useMutation({
    mutationFn: () =>
      api.startCounterRental(token, {
        espacioId: Number(court.espacio.id),
        duracionMin: minutes!,
        inicio: renewalFrom,
        // Al renovar, sin tocar jugadores se heredan los del turno.
        ...(players > 0 ? { jugadores: players } : {}),
        ...(name.trim() ? { nombreCliente: name } : {}),
      }),
    onSuccess: (created) => onReserved(created),
  });

  let buttonText = renewal ? 'Alargar turno' : 'Apartar pista';
  if (!renewal && players === 0) buttonText = 'Anota cuántos juegan';
  else if (price) buttonText = `${renewal ? 'Alargar' : 'Apartar'} · ${formatMoney(price)}`;

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${renewal ? 'Alargar turno de' : 'Rentar'} ${court.espacio.nombre}`}
      description={renewal ? `Empieza a las ${clock(renewalFrom)}, al terminar el turno actual.` : 'Empieza ahora. El horario queda apartado unos minutos mientras cobras.'}
    >
      <div className="grid gap-4">
        {durations.length === 0 ? (
          <Feedback tone="error">Esta pista no tiene duraciones para rentar. Revisa la configuración de reservas.</Feedback>
        ) : (
          <ChipRow label="Duración">
            {durations.map((value) => (
              <Chip key={value} selected={minutes === value} onClick={() => setMinutes(value)}>
                {renewal ? '+' : ''}{durationLabel(value)}
              </Chip>
            ))}
          </ChipRow>
        )}
        <div role="group" aria-label="Jugadores" className="flex items-center gap-3">
          <VaiButton variant="secondary" aria-label="Quitar un jugador" disabled={players === 0} onClick={() => setPlayers((value) => stepPlayers(value, -1, max))}>
            <Minus aria-hidden="true" className="size-4" />
          </VaiButton>
          <output aria-live="polite" className="min-w-28 text-center font-extrabold">
            {renewal && players === 0 ? 'Los del turno' : playersLabel(players)}
          </output>
          <VaiButton variant="secondary" aria-label="Agregar un jugador" disabled={players >= max} onClick={() => setPlayers((value) => stepPlayers(value, 1, max))}>
            <Plus aria-hidden="true" className="size-4" />
          </VaiButton>
        </div>
        <p className="text-sm text-ink-muted">{capacityLabel(court.capacidad)}.</p>
        {!renewal && (
          <Field label="A nombre de (opcional)" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        )}
        {reserve.isError && <Feedback tone="error">{bowlingErrorMessage(reserve.error)}</Feedback>}
        <VaiButton variant="accent" block disabled={!ready} loading={reserve.isPending} onClick={() => reserve.mutate()}>
          {buttonText}
        </VaiButton>
      </div>
    </Modal>
  );
}

function ChargeDialog({
  token,
  charge,
  onClose,
  onPaid,
}: {
  token: string;
  charge: Charge;
  onClose: () => void;
  onPaid: (text: string) => Promise<void>;
}) {
  const [received, setReceived] = useState('');
  const change = rentalChange(received, charge.amount);
  const pay = useMutation({
    mutationFn: () => api.payCounterRental(token, charge.id, normalizeMoneyInput(received)),
    onSuccess: async (result) => {
      const changeText = result.cobro && result.cobro.cambio !== '0.00' ? ` Cambio: ${formatMoney(result.cobro.cambio)}.` : '';
      await onPaid(`Pista rentada hasta ${clock(result.reserva.fin)}.${changeText}`);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (change !== null) pay.mutate();
  }

  return (
    <Modal open onOpenChange={(open) => !open && !pay.isPending && onClose()} title={charge.title} description={`Total ${formatMoney(charge.amount)}. Solo efectivo.`}>
      <form className="grid gap-4" onSubmit={submit}>
        <Field
          label="Efectivo recibido"
          inputMode="decimal"
          autoComplete="off"
          value={received}
          onChange={(event) => setReceived(event.target.value)}
          onBlur={() => setReceived((value) => normalizeMoneyInput(value))}
          hint={change !== null ? `Cambio: ${formatMoney(change)}` : 'Debe cubrir el total.'}
        />
        {pay.isError && <Feedback tone="error">{bowlingErrorMessage(pay.error)}</Feedback>}
        <VaiButton type="submit" variant="accent" block disabled={change === null} loading={pay.isPending}>
          Cobrar {formatMoney(charge.amount)} en efectivo
        </VaiButton>
        <VaiButton variant="quiet" block disabled={pay.isPending} onClick={onClose}>
          {charge.release ? 'No cobrar y soltar la pista' : 'Cerrar'}
        </VaiButton>
      </form>
    </Modal>
  );
}

function LanesConfig({ token, storeId, onChanged }: { token: string; storeId: string; onChanged: () => Promise<void> }) {
  const keys = bowlingKeys(storeId);
  const queryClient = useQueryClient();
  const lanes = useQuery({ queryKey: keys.lanes, enabled: Boolean(token), queryFn: () => api.listManagedSpaces(token) });
  const [editing, setEditing] = useState<ManagedSpace | null>(null);
  const [batch, setBatch] = useState<LaneBatchDraft>(DEFAULT_LANE_BATCH);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchKey, setBatchKey] = useState(createIdempotencyKey);
  const [notice, setNotice] = useState<string | null>(null);

  // Otra cosa escrita es otra petición: lleva llave nueva. Reintentar lo mismo reutiliza la llave.
  function updateBatch(patch: Partial<LaneBatchDraft>) {
    setBatch((current) => ({ ...current, ...patch }));
    setBatchKey(createIdempotencyKey());
  }

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: keys.lanes });
    await onChanged();
  }

  const createBatch = useMutation({
    mutationFn: (input: Parameters<typeof api.createSpaceBatch>[1]) => api.createSpaceBatch(token, input, batchKey),
    onSuccess: async (result) => {
      setBatchKey(createIdempotencyKey());
      const skipped = result.omitidos.length ? ` Ya existían: ${result.omitidos.join(', ')}.` : '';
      setNotice(`${result.creados === 1 ? 'Se creó 1 pista' : `Se crearon ${result.creados} pistas`}. Ponles precio por hora para rentarlas.${skipped}`);
      await reload();
    },
  });

  function submitBatch(event: FormEvent) {
    event.preventDefault();
    const parsed = laneBatchInput(batch);
    if (!parsed.ok) {
      setBatchError(parsed.error);
      return;
    }
    setBatchError(null);
    createBatch.mutate(parsed.input);
  }

  const list = lanesOf(lanes.data ?? []);
  const count = laneBatchCount(batch);

  return (
    <div className="grid gap-4">
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <Card title="Tus pistas" description="Cada pista se renta por hora. La capacidad es el tope de jugadores al rentarla.">
        {lanes.isPending && <LoadingState label="Cargando pistas…" cards={2} />}
        {lanes.isError && <Feedback tone="error">{errorMessage(lanes.error)}</Feedback>}
        {lanes.isSuccess && list.length === 0 && <p className="text-sm">Todavía no hay pistas. Créalas abajo.</p>}
        {list.length > 0 && (
          <ul className="grid gap-2" aria-label="Pistas del negocio">
            {list.map((lane) => (
              <li key={lane.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold text-ink">{lane.nombre}</p>
                  <p className="text-sm">{laneDetail(lane)}</p>
                </div>
                <VaiButton variant="secondary" aria-label={`Editar ${lane.nombre}`} onClick={() => setEditing(lane)}>
                  Editar
                </VaiButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Crear pistas" description="Se crean numeradas, por ejemplo Pista 1 a Pista 6.">
        <form className="grid gap-3" onSubmit={submitBatch} aria-label="Crear pistas">
          <Field label="Nombre" value={batch.prefix} maxLength={70} onChange={(event) => updateBatch({ prefix: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde" inputMode="numeric" value={batch.from} onChange={(event) => updateBatch({ from: event.target.value })} />
            <Field label="Hasta" inputMode="numeric" value={batch.to} onChange={(event) => updateBatch({ to: event.target.value })} />
          </div>
          <Field
            label="Jugadores por pista"
            inputMode="numeric"
            value={batch.capacity}
            hint={`De 1 a ${MAX_CAPACITY}. Vacío: hasta 30.`}
            onChange={(event) => updateBatch({ capacity: event.target.value })}
          />
          {batchError && <Feedback tone="error">{batchError}</Feedback>}
          {createBatch.isError && <Feedback tone="error">{errorMessage(createBatch.error)}</Feedback>}
          <VaiButton type="submit" variant="accent" loading={createBatch.isPending}>
            {count > 0 ? `Crear ${count === 1 ? '1 pista' : `${count} pistas`}` : 'Crear pistas'}
          </VaiButton>
        </form>
      </Card>

      {editing && (
        <EditLaneDialog
          token={token}
          lane={editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            setNotice(`${saved.nombre} guardada.`);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function EditLaneDialog({
  token,
  lane,
  onClose,
  onSaved,
}: {
  token: string;
  lane: ManagedSpace;
  onClose: () => void;
  onSaved: (saved: ManagedSpace) => Promise<void>;
}) {
  const [price, setPrice] = useState(lane.precio_hora ?? '');
  const [capacity, setCapacity] = useState(lane.capacidad ? String(lane.capacidad) : '');
  const [active, setActive] = useState(lane.activo);
  const parsedPrice = parseHourlyPrice(price);
  const parsedCapacity = parseCapacity(capacity);
  const save = useMutation({
    mutationFn: () => {
      const input: Parameters<typeof api.updateSpace>[2] = {};
      if (parsedPrice !== (lane.precio_hora ?? null)) input.precio_hora = parsedPrice ?? null;
      if (parsedCapacity !== (lane.capacidad ?? null)) input.capacidad = parsedCapacity ?? null;
      if (active !== lane.activo) input.activo = active;
      return api.updateSpace(token, lane.id, input);
    },
    onSuccess: (saved) => onSaved(saved),
  });
  const unchanged =
    parsedPrice === (lane.precio_hora ?? null) && parsedCapacity === (lane.capacidad ?? null) && active === lane.activo;
  const invalid = parsedPrice === undefined || parsedCapacity === undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!invalid && !unchanged) save.mutate();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={`Editar ${lane.nombre}`}>
      <form className="grid gap-3" onSubmit={submit}>
        <Field
          label="Precio por hora"
          inputMode="decimal"
          value={price}
          error={parsedPrice === undefined ? 'Escribe un monto mayor a 0, como 300.' : undefined}
          hint={parsedPrice === null ? 'Sin precio, la pista no se renta.' : 'Se cobra por hora de turno.'}
          onChange={(event) => setPrice(event.target.value)}
        />
        <Field
          label="Jugadores por pista"
          inputMode="numeric"
          value={capacity}
          error={parsedCapacity === undefined ? `De 1 a ${MAX_CAPACITY} jugadores.` : undefined}
          hint={parsedCapacity === null ? 'Vacío: hasta 30 jugadores.' : undefined}
          onChange={(event) => setCapacity(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Pista encendida (se puede rentar)
        </label>
        {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
        <VaiButton type="submit" variant="accent" disabled={invalid || unchanged} loading={save.isPending}>
          Guardar
        </VaiButton>
      </form>
    </Modal>
  );
}
