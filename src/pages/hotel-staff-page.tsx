import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, ConciergeBell, Hotel } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { AppSheet } from '../components/app-sheet';
import { Feedback, Field } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { hotelKeys } from '../lib/hotel-admin';
import {
  CHARGE_CATEGORIES,
  CHECKOUT_METHODS,
  HOUSEKEEPING_REFRESH_MS,
  MAX_CHARGE_CONCEPT,
  MAX_NIGHTS,
  MIN_NIGHTS,
  RECEPTION_REFRESH_MS,
  ROOMS_FILTERS,
  ROOM_TONE_LABEL,
  RetryKeys,
  addDays,
  checkoutBreakdown,
  chargeCategoryLabel,
  floorShown,
  freeRooms,
  hotelDateRange,
  hotelMoney,
  hotelMoneyShort,
  hotelRoomNumber,
  hotelStaffKeys,
  localToday,
  matchesFilter,
  nextFloor,
  nightsLabel,
  parseAmount,
  receptionSections,
  requestSubtitle,
  requestTitle,
  roomFloors,
  roomTone,
  sortRequests,
  staffErrorMessage,
  stayCodeLabel,
  visibleRooms,
  type CheckoutMethod,
  type RoomTone,
  type RoomsFilter,
} from '../lib/hotel-staff';
import type { HotelChargeCategory, HotelCheckInInput, HotelRequest, HotelRoom, HotelStay } from '../types/api';

export type HotelStaffSection = 'recepcion' | 'ama-de-llaves';

type Notice = { tone: 'success' | 'error'; text: string } | null;

const loadMessage = (error: unknown, fallback: string) =>
  error instanceof VaiinillaApiError && error.status === 403 ? 'Tu rol no tiene permiso para ver esta parte del hotel.' : `${fallback}: ${errorMessage(error)}`;

/**
 * Operación diaria del hotel (paridad con vaiinilla-android ui/hotel/staff): Recepción (llegadas y
 * salidas, check-in, cargos y check-out) para Caja y Administración, y el tablero del ama de llaves
 * (limpieza y solicitudes de huéspedes) para Mesero y Administración.
 */
export function HotelStaffPage({ section }: { section: HotelStaffSection }) {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const storeId = tenant.context.establecimiento_id;
  // Remontar al cambiar de negocio o membresía descarta lo que quedó a medias de la sesión anterior.
  return <HotelStaffScreen key={`${storeId}:${tenant.context.membresia_id}`} token={tenant.token} storeId={storeId} section={section} />;
}

function HotelStaffScreen({ token, storeId, section }: { token: string; storeId: string; section: HotelStaffSection }) {
  const settings = useQuery({ queryKey: hotelKeys(storeId).settings, enabled: !!token, queryFn: () => api.hotelSettings(token) });
  const reception = section === 'recepcion';

  let body: ReactNode;
  if (settings.isLoading) body = <LoadingState label="Cargando tu hotel…" cards={2} />;
  else if (settings.isError) {
    body = <Feedback tone="error">
      {loadMessage(settings.error, 'No se pudo cargar el hotel')}{' '}
      <VaiButton variant="secondary" onClick={() => void settings.refetch()}>Reintentar</VaiButton>
    </Feedback>;
  } else if (!settings.data?.activo) {
    body = <VaiEmptyState icon={<Hotel />} title="Este negocio no tiene hotel"
      message="El modo hotel lo activa la plataforma. Cuando esté activo, aquí verás la operación del día."
      action={<Link className="vai-button vai-button--secondary" to="/app">Volver al inicio</Link>} />;
  } else body = reception ? <ReceptionSection token={token} storeId={storeId} /> : <HousekeepingSection token={token} storeId={storeId} />;

  return <main className="page-stack admin-screen admin-overview">
    {body}
  </main>;
}

// region Recepción

type ReceptionPane = { kind: 'overview' } | { kind: 'checkin' } | { kind: 'checkout'; stayId: string };

function ReceptionSection({ token, storeId }: { token: string; storeId: string }) {
  const client = useQueryClient();
  const keys = hotelStaffKeys(storeId);
  const stays = useQuery({ queryKey: keys.stays, enabled: !!token, queryFn: () => api.hotelStays(token), refetchInterval: RECEPTION_REFRESH_MS });
  const rooms = useQuery({ queryKey: keys.rooms, enabled: !!token, queryFn: () => api.hotelRooms(token), refetchInterval: RECEPTION_REFRESH_MS });
  const [pane, setPane] = useState<ReceptionPane>({ kind: 'overview' });
  const [chargeFor, setChargeFor] = useState<HotelStay | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [retry] = useState(() => new RetryKeys());

  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: keys.stays }), client.invalidateQueries({ queryKey: keys.rooms })]);
  };

  const change = useMutation({
    mutationFn: ({ stay, action }: { stay: HotelStay; action: 'arrival' | 'cancel' }) => {
      const key = retry.keyFor(action, stay.id, stay.version);
      return action === 'arrival'
        ? api.hotelConfirmArrival(token, stay.id, stay.version, key)
        : api.hotelCancelStay(token, stay.id, stay.version, key);
    },
    onSettled: (_data, error, { stay, action }) => {
      retry.settle(error ?? null, action, stay.id, stay.version);
      void refresh();
    },
    onSuccess: (result, { action }) => setNotice({ tone: 'success', text: action === 'arrival' ? `${result.huesped} ya está en casa.` : 'Reserva cancelada.' }),
    onError: (error, { action }) => setNotice({ tone: 'error', text: staffErrorMessage(error, action === 'arrival' ? 'No se pudo registrar la llegada.' : 'No se pudo cancelar la reserva.') }),
  });

  const open = (next: ReceptionPane) => { setNotice(null); setPane(next); };
  const back = () => { setPane({ kind: 'overview' }); };
  const today = stays.data?.hoy ?? localToday();

  if (pane.kind === 'checkin') {
    return <CheckInPane token={token} rooms={rooms.data ? freeRooms(rooms.data) : []} roomsLoading={rooms.isLoading} today={today} retry={retry}
      onDone={() => { void refresh(); back(); }} onBack={back} onCreated={() => void refresh()} />;
  }
  if (pane.kind === 'checkout') {
    return <CheckoutPane token={token} storeId={storeId} stayId={pane.stayId} retry={retry} onBack={back}
      onDone={(stay) => { void refresh(); setNotice({ tone: 'success', text: `Cuenta de ${stay.huesped} cerrada.` }); back(); }} />;
  }

  const list = stays.data?.estancias ?? [];
  const { leavingToday, staying, arriving } = receptionSections(list, today);
  const busy = change.isPending;
  const rowProps = {
    busy,
    onCheckout: (stay: HotelStay) => open({ kind: 'checkout', stayId: stay.id }),
    onCharge: (stay: HotelStay) => { setNotice(null); setChargeFor(stay); },
    onArrive: (stay: HotelStay) => { if (!busy) change.mutate({ stay, action: 'arrival' }); },
    onCancel: (stay: HotelStay) => { if (!busy) change.mutate({ stay, action: 'cancel' }); },
  };

  return <>
    <AppPageHeader eyebrow="Recepción" title="Llegadas y salidas" description="Check-in, cargos a la habitación y cierre de la cuenta."
      action={<VaiButton variant="accent" onClick={() => open({ kind: 'checkin' })}>Nuevo check-in</VaiButton>} />
    {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
    {stays.isLoading ? <LoadingState label="Cargando huéspedes…" cards={3} />
      : stays.isError && !stays.data ? <Feedback tone="error">
        {loadMessage(stays.error, 'No se pudo actualizar')}{' '}
        <VaiButton variant="secondary" onClick={() => void stays.refetch()}>Reintentar</VaiButton>
      </Feedback>
      : <>
        {stays.isError && <Feedback tone="error">{staffErrorMessage(stays.error, 'No se pudo actualizar.')}</Feedback>}
        <StaySection label="Salen hoy" stays={leavingToday} {...rowProps} />
        <StaySection label="En casa" stays={staying} {...rowProps} />
        <StaySection label="Por llegar" stays={arriving} {...rowProps} />
        {leavingToday.length + staying.length + arriving.length === 0 &&
          <VaiEmptyState icon={<ConciergeBell />} title="Sin huéspedes" message="No hay huéspedes por ahora." />}
      </>}
    {chargeFor && <ChargeSheet token={token} stay={chargeFor} retry={retry} onClose={() => setChargeFor(null)}
      onSaved={(text) => { setChargeFor(null); setNotice({ tone: 'success', text }); void refresh(); }} />}
  </>;
}

interface StayRowActions {
  busy: boolean;
  onCheckout: (stay: HotelStay) => void;
  onCharge: (stay: HotelStay) => void;
  onArrive: (stay: HotelStay) => void;
  onCancel: (stay: HotelStay) => void;
}

function StaySection({ label, stays, ...actions }: { label: string; stays: HotelStay[] } & StayRowActions) {
  if (stays.length === 0) return null;
  return <Card title={`${label} · ${stays.length}`} aria-label={label}>
    <ul className="grid gap-3">
      {stays.map((stay) => <StayRow key={stay.id} stay={stay} {...actions} />)}
    </ul>
  </Card>;
}

function StayRow({ stay, busy, onCheckout, onCharge, onArrive, onCancel }: { stay: HotelStay } & StayRowActions) {
  const detail = [stay.espacio_nombre, hotelDateRange(stay.entrada, stay.salida) || null].filter(Boolean).join(' · ');
  return <li className="flex flex-wrap items-center justify-between gap-3">
    <span><strong>{stay.huesped}</strong><br /><small>{detail}</small></span>
    {stay.estado === 'en_casa' && <span className="flex gap-2">
      <VaiButton variant="secondary" onClick={() => onCharge(stay)} aria-label={`Cargo a ${stay.huesped}`}>Cargo</VaiButton>
      <VaiButton onClick={() => onCheckout(stay)} aria-label={`Check-out de ${stay.huesped}`}>Check-out</VaiButton>
    </span>}
    {stay.estado === 'reservada' && <span className="flex gap-2">
      <VaiButton variant="secondary" disabled={busy} onClick={() => onCancel(stay)} aria-label={`Cancelar la reserva de ${stay.huesped}`}>Cancelar</VaiButton>
      <VaiButton disabled={busy} onClick={() => onArrive(stay)} aria-label={`${stay.huesped} llegó`}>Llegó</VaiButton>
    </span>}
  </li>;
}

function CheckInPane({ token, rooms, roomsLoading, today, retry, onCreated, onDone, onBack }: {
  token: string;
  rooms: HotelRoom[];
  roomsLoading: boolean;
  today: string;
  retry: RetryKeys;
  onCreated: () => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [rate, setRate] = useState('');
  const [nights, setNights] = useState(1);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [created, setCreated] = useState<HotelStay | null>(null);
  const chosen = rooms.find((room) => room.id === roomId) ?? null;
  const parsedRate = parseAmount(rate);
  const ready = name.trim() !== '' && chosen !== null && parsedRate !== null;

  const checkIn = useMutation({
    mutationFn: (input: HotelCheckInInput) => api.hotelCheckIn(token, input, retry.keyFor('check-in', input)),
    onSettled: (_data, error, input) => retry.settle(error ?? null, 'check-in', input),
    onSuccess: (stay) => { setCreated(stay); onCreated(); },
  });

  if (created) {
    return <>
      <AppPageHeader eyebrow="Recepción · Check-in" title={`Listo, ${created.huesped}`} />
      <Card title="Código de estancia">
        <p className="text-5xl font-black tracking-tight" aria-label={`Código de estancia ${created.codigo ?? ''}`}>{stayCodeLabel(created.codigo)}</p>
        <p className="mt-2">Díselo al huésped: lo escribe en la app al escanear el QR de {created.espacio_nombre || 'su habitación'}.</p>
      </Card>
      <div><VaiButton variant="accent" onClick={onDone}>Listo</VaiButton></div>
    </>;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || checkIn.isPending) return;
    checkIn.mutate({
      espacio_id: chosen.id,
      huesped_nombre: name.trim(),
      ...(contact.trim() ? { contacto: contact.trim() } : {}),
      noches: nights,
      tarifa_noche: parsedRate,
    });
  };

  return <>
    <AppPageHeader eyebrow="Recepción" title="Nuevo check-in"
      action={<VaiButton variant="secondary" onClick={onBack} disabled={checkIn.isPending}>Volver</VaiButton>} />
    <form className="grid gap-4" aria-label="Nuevo check-in" onSubmit={submit}>
      <Card title="Huésped">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" placeholder="Laura Ramos" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={checkIn.isPending} />
          <Field label="Teléfono o correo (opcional)" maxLength={120} value={contact} onChange={(event) => setContact(event.target.value)} disabled={checkIn.isPending} />
        </div>
      </Card>
      <Card title="Habitación libre">
        {roomsLoading ? <LoadingState label="Buscando habitaciones…" cards={1} />
          : rooms.length === 0 ? <p>No hay habitaciones libres.</p>
          : <ChipRow label="Habitación libre" scroll>
            {rooms.map((room) => <Chip key={room.id} selected={room.id === roomId} onClick={() => setRoomId(room.id)}
              aria-label={room.nombre} disabled={checkIn.isPending}>{hotelRoomNumber(room.nombre)}</Chip>)}
          </ChipRow>}
      </Card>
      <Card title="Noches y tarifa">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold" aria-live="polite">{nightsLabel(nights)} · sale el {hotelDateRange(addDays(today, nights), null)}</p>
          <span className="flex gap-2">
            <VaiButton variant="secondary" aria-label="Una noche menos" disabled={nights <= MIN_NIGHTS || checkIn.isPending} onClick={() => setNights((value) => Math.max(MIN_NIGHTS, value - 1))}>−</VaiButton>
            <VaiButton variant="secondary" aria-label="Una noche más" disabled={nights >= MAX_NIGHTS || checkIn.isPending} onClick={() => setNights((value) => Math.min(MAX_NIGHTS, value + 1))}>+</VaiButton>
          </span>
        </div>
        <Field label="Tarifa por noche" hint="La pone el hotel; la app no trae precios." placeholder="1650" inputMode="decimal" value={rate}
          error={rate.trim() !== '' && parsedRate === null ? 'Escribe un importe mayor a cero, con hasta dos decimales.' : undefined}
          onChange={(event) => setRate(event.target.value)} disabled={checkIn.isPending} />
      </Card>
      {checkIn.isError && <Feedback tone="error">{staffErrorMessage(checkIn.error, 'No se pudo hacer el check-in.')}</Feedback>}
      <div><VaiButton variant="accent" type="submit" loading={checkIn.isPending} disabled={!ready}>{checkIn.isPending ? 'Registrando…' : 'Registrar llegada'}</VaiButton></div>
    </form>
  </>;
}

function ChargeSheet({ token, stay, retry, onClose, onSaved }: {
  token: string;
  stay: HotelStay;
  retry: RetryKeys;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [category, setCategory] = useState<HotelChargeCategory>('minibar');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const parsed = parseAmount(amount);
  const label = concept.trim() || chargeCategoryLabel(category);

  const save = useMutation({
    mutationFn: (input: { concepto: string; monto: string; categoria: HotelChargeCategory }) =>
      api.hotelAddCharge(token, stay.id, input, retry.keyFor('charge', stay.id, input)),
    onSettled: (_data, error, input) => retry.settle(error ?? null, 'charge', stay.id, input),
    onSuccess: (_result, input) => onSaved(`Se agregó ${input.concepto} por ${hotelMoney(input.monto)} a la cuenta de ${stay.huesped}.`),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed && !save.isPending) save.mutate({ concepto: label, monto: parsed, categoria: category });
  };

  return <AppSheet open onOpenChange={(value) => { if (!value && !save.isPending) onClose(); }}
    title="Cargo a la habitación" description={`${stay.espacio_nombre || 'Habitación'} · ${stay.huesped}`}>
    <form className="grid gap-3" aria-label="Cargo a la habitación" onSubmit={submit}>
      <ChipRow label="Categoría del cargo" scroll>
        {CHARGE_CATEGORIES.map((option) => <Chip key={option.value} selected={option.value === category}
          onClick={() => setCategory(option.value)} disabled={save.isPending}>{option.label}</Chip>)}
      </ChipRow>
      <Field label="Concepto" placeholder={chargeCategoryLabel(category)} maxLength={MAX_CHARGE_CONCEPT} value={concept}
        onChange={(event) => setConcept(event.target.value)} disabled={save.isPending} />
      <Field label="Importe" placeholder="90.00" inputMode="decimal" value={amount}
        error={amount.trim() !== '' && parsed === null ? 'Escribe un importe mayor a cero, con hasta dos decimales.' : undefined}
        onChange={(event) => setAmount(event.target.value)} disabled={save.isPending} />
      {save.isError && <Feedback tone="error">{staffErrorMessage(save.error, 'No se pudo agregar el cargo.')}</Feedback>}
      <VaiButton variant="accent" type="submit" loading={save.isPending} disabled={!parsed}>{save.isPending ? 'Agregando…' : 'Agregar a la cuenta'}</VaiButton>
    </form>
  </AppSheet>;
}

function CheckoutPane({ token, storeId, stayId, retry, onBack, onDone }: {
  token: string;
  storeId: string;
  stayId: string;
  retry: RetryKeys;
  onBack: () => void;
  onDone: (stay: HotelStay) => void;
}) {
  const detail = useQuery({ queryKey: hotelStaffKeys(storeId).stay(stayId), enabled: !!token, queryFn: () => api.hotelStay(token, stayId), staleTime: 0 });
  const [method, setMethod] = useState<CheckoutMethod>('tarjeta');

  const close = useMutation({
    mutationFn: ({ stay, total }: { stay: HotelStay; total: string }) => {
      // Se manda el total que recepción tiene a la vista: si la cuenta cambió, el servidor responde ACCOUNT_TOTAL_CHANGED.
      const input = { metodo_pago: method, total_esperado: total, version_esperada: stay.version };
      return api.hotelCheckout(token, stay.id, input, retry.keyFor('checkout', stay.id, input));
    },
    onSettled: (_data, error, { stay, total }) =>
      retry.settle(error ?? null, 'checkout', stay.id, { metodo_pago: method, total_esperado: total, version_esperada: stay.version }),
    onSuccess: (result) => onDone(result),
    onError: (error) => {
      if (error instanceof VaiinillaApiError && ['ACCOUNT_TOTAL_CHANGED', 'STAY_VERSION_CONFLICT'].includes(error.code)) void detail.refetch();
    },
  });

  const header = (title: string, description?: string) => <AppPageHeader eyebrow="Recepción · Check-out" title={title} description={description}
    action={<VaiButton variant="secondary" onClick={onBack} disabled={close.isPending}>Volver</VaiButton>} />;

  if (detail.isLoading) return <>{header('Cuenta')}<LoadingState label="Abriendo la cuenta…" cards={2} /></>;
  if (detail.isError || !detail.data) {
    return <>{header('Cuenta')}<Feedback tone="error">
      {staffErrorMessage(detail.error, 'No se pudo abrir la cuenta.')}{' '}
      <VaiButton variant="secondary" onClick={() => void detail.refetch()}>Reintentar</VaiButton>
    </Feedback></>;
  }

  const stay = detail.data;
  const bill = checkoutBreakdown(stay);
  const nights = nightsLabel(bill.nights);
  const subtitle = [stay.espacio_nombre, hotelDateRange(stay.entrada, stay.salida) || null, nights].filter(Boolean).join(' · ');
  const closable = stay.estado === 'en_casa';

  return <>
    {header(stay.huesped, subtitle)}
    <Card title="Estancia">
      <p className="flex justify-between gap-3"><span>{nights} × {hotelMoneyShort(bill.rate)}</span><strong>{hotelMoney(bill.stayAmount)}</strong></p>
    </Card>
    <Card title="Cargos a la habitación">
      <ul className="grid gap-2" aria-label="Cargos a la habitación">
        {bill.roomServiceCount > 0 && <li className="flex justify-between gap-3"><span>Room service ({bill.roomServiceCount})</span><strong>{hotelMoney(bill.roomServiceTotal)}</strong></li>}
        {bill.charges.map((line) => <li key={line.label} className="flex justify-between gap-3"><span>{line.label}</span><strong>{hotelMoney(line.amount)}</strong></li>)}
        {bill.roomServiceCount === 0 && bill.charges.length === 0 && <li className="text-muted">Sin cargos extra</li>}
      </ul>
    </Card>
    <div className="flex items-end justify-between gap-3">
      <span className="font-bold">Total a cobrar</span>
      <strong className="text-4xl font-black" aria-label={`Total a cobrar ${hotelMoney(bill.total)}`}>{hotelMoney(bill.total)}</strong>
    </div>
    <ChipRow label="Forma de pago">
      {CHECKOUT_METHODS.map((option) => <Chip key={option.value} selected={option.value === method}
        onClick={() => setMethod(option.value)} disabled={close.isPending || !closable}>{option.label}</Chip>)}
    </ChipRow>
    {!closable && <Feedback tone="info">Esta estancia ya no está en casa: no hay cuenta que cerrar.</Feedback>}
    {close.isError && <Feedback tone="error">{staffErrorMessage(close.error, 'No se pudo cerrar la cuenta.')}</Feedback>}
    <div><VaiButton variant="accent" loading={close.isPending} disabled={!closable || detail.isFetching}
      onClick={() => { if (!close.isPending) close.mutate({ stay, total: bill.total }); }}>{close.isPending ? 'Cerrando…' : 'Cerrar cuenta'}</VaiButton></div>
  </>;
}

// endregion

// region Ama de llaves

const TONE_STYLE: Record<RoomTone, { background: string; color: string }> = {
  ocupada: { background: 'rgba(77, 137, 230, 0.16)', color: '#2f6fd1' },
  por_limpiar: { background: 'rgba(240, 170, 60, 0.18)', color: '#a86400' },
  lista: { background: 'rgba(185, 216, 109, 0.22)', color: '#4f6f12' },
  no_molestar: { background: 'rgba(241, 91, 85, 0.16)', color: '#c23a35' },
};

function HousekeepingSection({ token, storeId }: { token: string; storeId: string }) {
  const client = useQueryClient();
  const keys = hotelStaffKeys(storeId);
  const rooms = useQuery({ queryKey: keys.rooms, enabled: !!token, queryFn: () => api.hotelRooms(token), refetchInterval: HOUSEKEEPING_REFRESH_MS });
  const requests = useQuery({ queryKey: keys.requests, enabled: !!token, queryFn: () => api.hotelRequests(token), refetchInterval: HOUSEKEEPING_REFRESH_MS });
  const [filter, setFilter] = useState<RoomsFilter>('todas');
  const [floor, setFloor] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [retry] = useState(() => new RetryKeys());

  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.rooms });
    void client.invalidateQueries({ queryKey: keys.requests });
  };

  const transition = useMutation({
    mutationFn: ({ request, action }: { request: HotelRequest; action: 'tomar' | 'resolver' }) =>
      api.hotelRequestTransition(token, request.id, action, request.version, retry.keyFor('transition', request.id, action, request.version)),
    onSettled: (_data, error, { request, action }) => { retry.settle(error ?? null, 'transition', request.id, action, request.version); refresh(); },
    onSuccess: () => setNotice(null),
    onError: (error) => setNotice({ tone: 'error', text: staffErrorMessage(error, 'No se pudo guardar.') }),
  });

  const cleaning = useMutation({
    mutationFn: ({ room, next }: { room: HotelRoom; next: 'lista' | 'por_limpiar' }) =>
      api.hotelSetCleaning(token, room.id, next, retry.keyFor('cleaning', room.id, next)),
    onSettled: (_data, error, { room, next }) => { retry.settle(error ?? null, 'cleaning', room.id, next); refresh(); },
    onSuccess: () => setNotice(null),
    onError: (error) => setNotice({ tone: 'error', text: staffErrorMessage(error, 'No se pudo guardar.') }),
  });

  const busy = transition.isPending || cleaning.isPending;
  const busyRequest = transition.isPending ? transition.variables?.request.id : null;
  const list = rooms.data ?? [];
  const shown = floorShown(list, floor);
  const floors = roomFloors(list);
  const visible = visibleRooms(list, filter, shown);
  const openRequests = sortRequests(requests.data ?? []);

  /** Una habitación vacía alterna entre lista y por limpiar; la ocupada no se toca desde aquí. */
  const toggle = (room: HotelRoom) => {
    if (room.ocupada || busy) return;
    cleaning.mutate({ room, next: room.limpieza === 'por_limpiar' ? 'lista' : 'por_limpiar' });
  };

  return <>
    <AppPageHeader eyebrow={shown !== null ? `Ama de llaves · Piso ${shown}` : 'Ama de llaves'} title="Habitaciones"
      description="Toca una habitación vacía para marcarla lista o por limpiar."
      action={floors.length > 1 ? <VaiButton variant="secondary" onClick={() => setFloor(nextFloor(list, floor))}
        aria-label={`Piso ${shown}, cambiar al siguiente`}>Piso {shown} · siguiente</VaiButton> : undefined} />
    <ChipRow label="Filtrar habitaciones" scroll>
      {ROOMS_FILTERS.map((option) => <Chip key={option.value} selected={filter === option.value} onClick={() => setFilter(option.value)}>
        {option.label} {list.filter((room) => matchesFilter(option.value, room)).length}
      </Chip>)}
    </ChipRow>
    {rooms.isLoading ? <LoadingState label="Buscando habitaciones…" cards={2} />
      : rooms.isError && !rooms.data ? <Feedback tone="error">
        {loadMessage(rooms.error, 'No se pudo actualizar')}{' '}
        <VaiButton variant="secondary" onClick={() => void rooms.refetch()}>Reintentar</VaiButton>
      </Feedback>
      : visible.length === 0 ? <VaiEmptyState icon={<BedDouble />} title="Sin habitaciones" message="No hay habitaciones con ese filtro." />
      : <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Tablero de habitaciones">
        {visible.map((room) => {
          const tone = roomTone(room);
          const style = TONE_STYLE[tone];
          return <li key={room.id}>
            <button type="button" className="w-full rounded-2xl px-3 py-2 text-left disabled:cursor-not-allowed"
              style={{ background: style.background, minHeight: 74 }} disabled={room.ocupada || busy} onClick={() => toggle(room)}
              aria-label={`${room.nombre}: ${ROOM_TONE_LABEL[tone].toLowerCase()}${room.ocupada ? '' : room.limpieza === 'por_limpiar' ? ', marcar lista' : ', marcar por limpiar'}`}>
              <span className="block text-lg font-black">{hotelRoomNumber(room.nombre)}</span>
              <span className="mt-1 block text-xs font-extrabold" style={{ color: style.color }}>{ROOM_TONE_LABEL[tone]}</span>
            </button>
          </li>;
        })}
      </ul>}
    {rooms.isError && rooms.data && <Feedback tone="error">{staffErrorMessage(rooms.error, 'No se pudo actualizar.')}</Feedback>}
    {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
    <Card title="Solicitudes de huéspedes">
      {requests.isLoading ? <LoadingState label="Cargando solicitudes…" cards={1} />
        : requests.isError && !requests.data ? <Feedback tone="error">
          {loadMessage(requests.error, 'No se pudieron cargar las solicitudes')}{' '}
          <VaiButton variant="secondary" onClick={() => void requests.refetch()}>Reintentar</VaiButton>
        </Feedback>
        : openRequests.length === 0 ? <p>Nadie ha pedido nada por ahora.</p>
        : <ul className="grid gap-3" aria-label="Solicitudes abiertas">
          {openRequests.map((request) => {
            const taken = request.estado === 'tomada';
            const title = requestTitle(request);
            return <li key={request.id} className="flex items-center justify-between gap-3">
              <span><strong>{title}</strong><br /><small>{requestSubtitle(request)}</small></span>
              <VaiButton loading={busyRequest === request.id} disabled={busy}
                aria-label={`${taken ? 'Listo' : 'Tomar'}: ${title}`}
                onClick={() => transition.mutate({ request, action: taken ? 'resolver' : 'tomar' })}>{taken ? 'Listo' : 'Tomar'}</VaiButton>
            </li>;
          })}
        </ul>}
    </Card>
  </>;
}

// endregion
