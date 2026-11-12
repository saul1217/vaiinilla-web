import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, ClipboardList, ConciergeBell, Hotel, UtensilsCrossed } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { SegmentedControl } from '../components/segmented-control';
import { Feedback, Field } from '../components/ui';
import { Card, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import {
  DEFAULT_LATE_CHECKOUT,
  DEFAULT_ROOM_BATCH,
  HOTEL_SLOW_REQUEST_MINUTES,
  batchCount,
  batchInput,
  batchNotice,
  batchProblem,
  clockInput,
  createLabel,
  departuresDetail,
  hotelKeys,
  kitchenLabel,
  kitchenNow,
  occupancy,
  oldestRequestMinutes,
  ordersLabel,
  priceInput,
  roomDetail,
  roomQrLines,
  sameSettings,
  settingsInput,
  settingsProblem,
  sortRooms,
  type RoomBatchDraft,
} from '../lib/hotel-admin';
import { createIdempotencyKey } from '../lib/idempotency';
import { formatMoney } from '../lib/money';
import type { HotelSettings, HotelSummary } from '../types/api';

export type HotelAdminSection = 'resumen' | 'habitaciones' | 'ajustes';

const SECTIONS: readonly { value: HotelAdminSection; label: string; path: string; title: string; description: string }[] = [
  { value: 'resumen', label: 'Resumen', path: '/app/hotel', title: 'Hotel', description: 'Ocupación, room service, solicitudes y salidas de hoy.' },
  { value: 'habitaciones', label: 'Habitaciones', path: '/app/hotel/habitaciones', title: 'Habitaciones', description: 'Crea habitaciones en lote, cada una con su QR.' },
  { value: 'ajustes', label: 'Ajustes', path: '/app/hotel/ajustes', title: 'Ajustes del hotel', description: 'Room service, salida y lo que pueden pedir los huéspedes.' },
];

const loadMessage = (error: unknown, fallback: string) =>
  error instanceof VaiinillaApiError && error.status === 403 ? 'No tienes permiso para ver esta parte del hotel.' : `${fallback}: ${errorMessage(error)}`;

export function HotelAdminPage({ section }: { section: HotelAdminSection }) {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const storeId = tenant.context.establecimiento_id;
  // Remontar al cambiar de negocio o membresía descarta borradores de la sesión anterior.
  return <HotelAdminScreen key={`${storeId}:${tenant.context.membresia_id}`} token={tenant.token} storeId={storeId} section={section} />;
}

function HotelAdminScreen({ token, storeId, section }: { token: string; storeId: string; section: HotelAdminSection }) {
  const history = useHistory();
  const keys = hotelKeys(storeId);
  const settings = useQuery({ queryKey: keys.settings, enabled: !!token, queryFn: () => api.hotelSettings(token) });
  const current = SECTIONS.find((item) => item.value === section) ?? SECTIONS[0]!;

  let body: ReactNode;
  if (settings.isLoading) body = <LoadingState label="Cargando tu hotel…" cards={2} />;
  else if (settings.isError) {
    body = <Feedback tone="error">
      {loadMessage(settings.error, 'No se pudo cargar la configuración del hotel')}{' '}
      <VaiButton variant="secondary" onClick={() => void settings.refetch()}>Reintentar</VaiButton>
    </Feedback>;
  } else if (!settings.data?.activo) {
    body = <VaiEmptyState icon={<Hotel />} title="Este negocio no tiene hotel"
      message="El modo hotel lo activa la plataforma. Cuando esté activo, aquí verás el resumen, las habitaciones y los ajustes."
      action={<Link className="vai-button vai-button--secondary" to="/app">Volver al inicio</Link>} />;
  } else if (section === 'resumen') body = <HotelSummarySection token={token} storeId={storeId} />;
  else if (section === 'habitaciones') body = <HotelRoomsSection token={token} storeId={storeId} />;
  else body = <HotelSettingsSection token={token} storeId={storeId} saved={settings.data} />;

  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow="Administración · Hotel" title={current.title} description={current.description} />
    {settings.data?.activo && <SegmentedControl legend="Secciones del hotel" value={section} options={SECTIONS}
      onChange={(value) => history.push(SECTIONS.find((item) => item.value === value)!.path)} />}
    {body}
  </main>;
}

// region Resumen

function HotelSummarySection({ token, storeId }: { token: string; storeId: string }) {
  const summary = useQuery({ queryKey: hotelKeys(storeId).summary, enabled: !!token, queryFn: () => api.hotelSummary(token) });
  if (summary.isLoading) return <LoadingState label="Cargando el resumen del hotel…" cards={4} />;
  if (summary.isError || !summary.data) {
    return <Feedback tone="error">
      {loadMessage(summary.error, 'No se pudo cargar el hotel')}{' '}
      <VaiButton variant="secondary" onClick={() => void summary.refetch()}>Reintentar</VaiButton>
    </Feedback>;
  }
  return <HotelSummaryView summary={summary.data} />;
}

export function HotelSummaryView({ summary }: { summary: HotelSummary }) {
  const oldest = oldestRequestMinutes(summary);
  const slow = (oldest ?? 0) > HOTEL_SLOW_REQUEST_MINUTES;
  const requestsNote = summary.solicitudes.abiertas === 0 ? 'Al corriente' : oldest !== null ? `La más vieja lleva ${oldest} min` : '';
  const percent = Math.round(occupancy(summary) * 100);
  return <>
    <section className="analytics-kpi-grid" aria-label="Hotel hoy">
      <article className="analytics-kpi">
        <span className="analytics-kpi__icon"><BedDouble aria-hidden="true" /></span>
        <p>Ocupación</p>
        <strong>{summary.habitaciones.ocupadas} de {summary.habitaciones.total}</strong>
        <div role="meter" aria-label="Ocupación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
          style={{ gridColumn: '1 / -1', height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--color-ink)' }} />
        </div>
      </article>
      <article className="analytics-kpi">
        <span className="analytics-kpi__icon"><ConciergeBell aria-hidden="true" /></span>
        <p>Room service hoy</p>
        <strong>{summary.room_service.ventas_hoy ? formatMoney(summary.room_service.ventas_hoy) : '—'}</strong>
        <small>Cargo a habitación</small>
      </article>
      <article className="analytics-kpi">
        <span className="analytics-kpi__icon"><UtensilsCrossed aria-hidden="true" /></span>
        <p>Pedidos a cuartos</p>
        <strong>{summary.room_service.pedidos_hoy}</strong>
        <small>{kitchenNow(summary.room_service.en_cocina_ahora)}</small>
      </article>
      <article className="analytics-kpi">
        <span className="analytics-kpi__icon"><ClipboardList aria-hidden="true" /></span>
        <p>Solicitudes abiertas</p>
        <strong>{summary.solicitudes.abiertas}</strong>
        {requestsNote && <small style={slow ? { color: 'var(--vai-coral-text)', fontWeight: 700 } : undefined}>{requestsNote}</small>}
      </article>
    </section>
    <Card title="Lo más pedido" description="De room service">
      {summary.lo_mas_pedido.length === 0
        ? <p>Todavía no hay pedidos a las habitaciones.</p>
        : <ul className="grid gap-2">{summary.lo_mas_pedido.map((item) => <li key={item.producto} className="flex justify-between gap-3">
          <span className="font-semibold">{item.producto}</span><span>{ordersLabel(item.cantidad)}</span>
        </li>)}</ul>}
    </Card>
    <Card title="Salidas hoy" description={departuresDetail(summary)}>
      <p className="text-2xl font-black" aria-label={`${summary.salidas_hoy.length} salidas hoy`}>{summary.salidas_hoy.length}</p>
    </Card>
  </>;
}

// endregion

// region Habitaciones

function HotelRoomsSection({ token, storeId }: { token: string; storeId: string }) {
  const client = useQueryClient();
  const keys = hotelKeys(storeId);
  const rooms = useQuery({ queryKey: keys.rooms, enabled: !!token, queryFn: () => api.hotelRooms(token) });
  const [draft, setDraft] = useState<RoomBatchDraft>(DEFAULT_ROOM_BATCH);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  // Un reintento del mismo lote usa la misma llave para que el servidor no lo cree dos veces.
  const retry = useRef<{ body: string; key: string } | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const input = batchInput(draft);
      const body = JSON.stringify(input);
      if (retry.current?.body !== body) retry.current = { body, key: createIdempotencyKey() };
      return api.createHotelRooms(token, input, retry.current.key);
    },
    onSuccess: async (result) => {
      retry.current = null;
      setNotice({ tone: 'success', text: batchNotice(result) });
      await client.invalidateQueries({ queryKey: keys.rooms });
      void client.invalidateQueries({ queryKey: keys.summary });
    },
    onError: (error) => setNotice({ tone: 'error', text: `No se pudieron crear las habitaciones: ${errorMessage(error)}` }),
  });

  const count = batchCount(draft);
  const problem = batchProblem(draft);
  const set = (patch: Partial<RoomBatchDraft>) => setDraft((old) => ({ ...old, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (problem) return setNotice({ tone: 'error', text: problem });
    if (!create.isPending) create.mutate();
  };
  const list = rooms.data ? sortRooms(rooms.data) : null;
  const qrLines = list ? roomQrLines(list) : '';
  const copyQr = async () => {
    try {
      await navigator.clipboard.writeText(qrLines);
      setNotice({ tone: 'success', text: 'Copiamos los enlaces QR de todas las habitaciones.' });
    } catch {
      setNotice({ tone: 'error', text: 'No se pudieron copiar los enlaces QR.' });
    }
  };

  return <>
    <Card title="Crear en lote">
      <form className="grid gap-3" onSubmit={submit} aria-label="Crear habitaciones en lote">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Prefijo" value={draft.prefix} maxLength={70} onChange={(event) => set({ prefix: event.target.value })} disabled={create.isPending} />
          <Field label="Desde" inputMode="numeric" value={draft.from} onChange={(event) => set({ from: event.target.value.replace(/\D/g, '').slice(0, 5) })} disabled={create.isPending} />
          <Field label="Hasta" inputMode="numeric" value={draft.to} onChange={(event) => set({ to: event.target.value.replace(/\D/g, '').slice(0, 5) })} disabled={create.isPending} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Piso" inputMode="numeric" value={draft.floor} onChange={(event) => set({ floor: event.target.value.replace(/\D/g, '').slice(0, 3) })} disabled={create.isPending} />
          <Field label="Categoría" placeholder="Doble, suite…" maxLength={30} value={draft.category} onChange={(event) => set({ category: event.target.value })} disabled={create.isPending} />
        </div>
        <div><VaiButton variant="accent" type="submit" loading={create.isPending} disabled={count === 0}>{createLabel(count)}</VaiButton></div>
      </form>
    </Card>
    {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
    <Card title="Habitaciones" aria-busy={rooms.isLoading}>
      {rooms.isLoading ? <LoadingState label="Cargando habitaciones…" cards={2} />
        : rooms.isError ? <Feedback tone="error">
          {loadMessage(rooms.error, 'No se pudieron cargar las habitaciones')}{' '}
          <VaiButton variant="secondary" onClick={() => void rooms.refetch()}>Reintentar</VaiButton>
        </Feedback>
        : !list || list.length === 0 ? <VaiEmptyState icon={<BedDouble />} title="Sin habitaciones" message="Todavía no hay habitaciones. Crea la primera arriba." />
        : <>
          <ul className="grid gap-2" aria-label="Lista de habitaciones">{list.map((room) => <li key={room.id} className="flex items-center justify-between gap-3">
            <span><strong>{room.nombre}</strong><br /><small>{roomDetail(room)}</small></span>
            {room.qr_url ? <a className="vai-button vai-button--quiet" href={room.qr_url} target="_blank" rel="noreferrer" aria-label={`QR de ${room.nombre}`}>QR</a> : <span aria-hidden="true">QR</span>}
          </li>)}</ul>
          <div className="mt-3"><VaiButton variant="secondary" disabled={!qrLines} onClick={() => void copyQr()}>Copiar QR de todas</VaiButton></div>
        </>}
    </Card>
  </>;
}

// endregion

// region Ajustes

function Toggle({ label, detail, checked, disabled, onChange }: { label: string; detail: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-3 py-2">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span><span className="font-semibold">{label}</span><br /><small>{detail}</small></span>
  </label>;
}

export function HotelSettingsSection({ token, storeId, saved }: { token: string; storeId: string; saved: HotelSettings }) {
  const client = useQueryClient();
  const [config, setConfig] = useState<HotelSettings>(saved);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const save = useMutation({
    mutationFn: (value: HotelSettings) => api.saveHotelSettings(token, settingsInput(value)),
    onSuccess: (result) => {
      client.setQueryData(hotelKeys(storeId).settings, result);
      setConfig(result);
      setNotice({ tone: 'success', text: 'Cambios guardados' });
    },
    onError: (error) => setNotice({ tone: 'error', text: `No se pudieron guardar los cambios: ${errorMessage(error)}` }),
  });
  const disabled = save.isPending;
  const set = (patch: Partial<HotelSettings>) => { setConfig((old) => ({ ...old, ...patch })); setNotice(null); };
  const problem = settingsProblem(config);
  const changed = !sameSettings(config, saved);
  const lateOn = config.salida_tardia_hora !== null;

  return <form className="grid gap-4" aria-label="Ajustes del hotel" onSubmit={(event) => { event.preventDefault(); if (changed && !problem) save.mutate(config); }}>
    <Card tone="hero" title="Plantilla: Hotel con room service"
      description="Los espacios se llaman habitaciones. Los pedidos van al cuarto y los cargos se juntan en la cuenta del huésped." />
    <Card title="Room service">
      <Toggle label="Cargar a la habitación" detail="El huésped paga todo al salir" checked={config.cargo_habitacion_activo} disabled={disabled} onChange={(value) => set({ cargo_habitacion_activo: value })} />
      <Toggle label="Pago con tarjeta al pedir" detail="Opcional para quien lo prefiera" checked={config.tarjeta_al_pedir} disabled={disabled} onChange={(value) => set({ tarjeta_al_pedir: value })} />
      <p className="mt-2 font-semibold">Horario de cocina <small>· {kitchenLabel(config)}</small></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cocina desde" placeholder="07:00" inputMode="numeric" value={config.cocina_desde ?? ''} disabled={disabled} onChange={(event) => set({ cocina_desde: clockInput(event.target.value) || null })} />
        <Field label="Cocina hasta" placeholder="23:00" inputMode="numeric" value={config.cocina_hasta ?? ''} disabled={disabled} onChange={(event) => set({ cocina_hasta: clockInput(event.target.value) || null })} />
      </div>
    </Card>
    <Card title="Salida">
      <Field label="Hora de salida" hint="Después se pide salida tardía" placeholder="12:00" inputMode="numeric" value={config.hora_checkout ?? ''} disabled={disabled} onChange={(event) => set({ hora_checkout: clockInput(event.target.value) || null })} />
      <Toggle label="Salida tardía" detail={lateOn ? `Hasta las ${config.salida_tardia_hora} · el precio lo pones tú` : 'No se ofrece'} checked={lateOn} disabled={disabled}
        onChange={(on) => set(on ? { salida_tardia_hora: config.salida_tardia_hora ?? DEFAULT_LATE_CHECKOUT } : { salida_tardia_hora: null })} />
      {lateOn && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Salida tardía hasta" placeholder="15:00" inputMode="numeric" value={config.salida_tardia_hora ?? ''} disabled={disabled} onChange={(event) => set({ salida_tardia_hora: clockInput(event.target.value) })} />
        <Field label="Precio de la salida tardía" hint="Por solicitud aprobada; vacío es sin precio" placeholder="0.00" inputMode="decimal" value={config.salida_tardia_precio ?? ''} disabled={disabled} onChange={(event) => set({ salida_tardia_precio: priceInput(event.target.value) || null })} />
      </div>}
    </Card>
    <Card title="Huéspedes">
      <Toggle label="Pedir al hotel" detail="Toallas, limpieza y cargadores" checked={config.solicitudes_activas} disabled={disabled} onChange={(value) => set({ solicitudes_activas: value })} />
      <Toggle label="Sin molestar" detail="Avisa al personal de limpieza" checked={config.no_molestar_activo} disabled={disabled} onChange={(value) => set({ no_molestar_activo: value })} />
    </Card>
    {changed && problem && <Feedback tone="error">{problem}</Feedback>}
    {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
    <div><VaiButton variant="accent" type="submit" loading={save.isPending} disabled={!changed || !!problem}>Guardar cambios</VaiButton></div>
  </form>;
}

// endregion
