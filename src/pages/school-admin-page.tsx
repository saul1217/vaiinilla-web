import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Moon, School } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { SegmentedControl } from '../components/segmented-control';
import { Feedback, Field, Modal } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { createIdempotencyKey } from '../lib/idempotency';
import { formatMoney } from '../lib/money';
import {
  MAX_DAYS_AHEAD,
  MIN_REJECTION_REASON,
  MIN_SEARCH_LENGTH,
  REASON_MAX,
  addDays,
  byStudent,
  canResolve,
  canSaveRoster,
  clockInput,
  closeDayMessage,
  closeDayTitle,
  closure,
  closureSummary,
  dayMenu,
  daysLabel,
  groupsLine,
  isRefund,
  isWeekend,
  knownStudentRequests,
  longLabel,
  parseRoster,
  personName,
  problemText,
  reasonOk,
  rejectGuardianMessage,
  requestFacts,
  reservedLabel,
  resolvedText,
  rosterSavedNotice,
  rulesDraft,
  rulesInput,
  rulesProblem,
  sameIds,
  sameRules,
  saveMenuLabel,
  schoolErrorMessage,
  schoolKeys,
  schoolToday,
  stripDates,
  studentName,
  studentRequestConfirmMessage,
  studentRequestConfirmTitle,
  studentRequestWarning,
  studentRequestWhat,
  studentTitle,
  studentsLabel,
  weekdayShort,
  type SchoolRulesDraft,
} from '../lib/school-admin';
import type {
  BusinessSettings,
  SchoolGuardianRequest,
  SchoolGuardianship,
  SchoolMenuDays,
  SchoolRosterStudent,
  SchoolSettingsInput,
  SchoolStudentRequest,
} from '../types/api';

export type SchoolAdminSection = 'ajustes' | 'dias' | 'padron' | 'tutores' | 'devoluciones';

const SECTIONS: readonly { value: SchoolAdminSection; label: string; path: string; title: string; description: string }[] = [
  { value: 'ajustes', label: 'Ajustes', path: '/app/escuela', title: 'Escuela', description: 'Quién se une, cuánto se recarga y hasta cuándo se aparta comida.' },
  { value: 'dias', label: 'Cada día', path: '/app/escuela/dias', title: 'Cada día', description: 'Lo que se vende, lo que ya apartaron y los días sin servicio.' },
  { value: 'padron', label: 'Padrón', path: '/app/escuela/padron', title: 'Padrón de alumnos', description: 'La lista de alumnos que los tutores pueden dar de alta.' },
  { value: 'tutores', label: 'Tutores', path: '/app/escuela/tutores', title: 'Tutores', description: 'Quién espera a la escuela y quién cuida a cada alumno.' },
  { value: 'devoluciones', label: 'Devoluciones', path: '/app/escuela/devoluciones', title: 'Devoluciones y bajas', description: 'Lo que piden los tutores cuando su hijo se va o quiere su saldo.' },
];

type Notice = { tone: 'success' | 'error'; text: string } | null;
type SetNotice = (notice: Notice) => void;

/**
 * Cada cambio lleva una `Idempotency-Key`; un reintento del mismo cambio reusa la suya
 * (el backend la libera si la operación falló), como pendingKeys en Android.
 */
function useRetryKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    take(signature: string): string {
      let key = keys.current.get(signature);
      if (!key) {
        key = createIdempotencyKey();
        keys.current.set(signature, key);
      }
      return key;
    },
    done(signature: string) {
      keys.current.delete(signature);
    },
  };
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Feedback tone="error">{message}{' '}<VaiButton variant="secondary" onClick={onRetry}>Reintentar</VaiButton></Feedback>;
}

/** Confirmación dentro de la tarjeta, junto a lo que se confirma (InlineConfirm de Android). */
function InlineConfirm({ title, message, confirmLabel, destructive = false, disabled, confirmDisabled = false, onCancel, onConfirm, children }: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  disabled: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return <div className="grid gap-2 rounded-2xl p-3" style={{ background: 'var(--vai-paper-2)' }} role="group" aria-label={title}>
    <p className="font-black">{title}</p>
    <p>{message}</p>
    {children}
    <div className="flex flex-wrap gap-2">
      <VaiButton variant={destructive ? 'coral' : 'primary'} disabled={disabled || confirmDisabled} onClick={onConfirm}>{confirmLabel}</VaiButton>
      <VaiButton variant="secondary" disabled={disabled} onClick={onCancel}>No</VaiButton>
    </div>
  </div>;
}

export function SchoolAdminPage({ section }: { section: SchoolAdminSection }) {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const storeId = tenant.context.establecimiento_id;
  // Remontar al cambiar de negocio o membresía descarta borradores y llaves de la sesión anterior.
  return <SchoolAdminScreen key={`${storeId}:${tenant.context.membresia_id}`} token={tenant.token} storeId={storeId} section={section} />;
}

function SchoolAdminScreen({ token, storeId, section }: { token: string; storeId: string; section: SchoolAdminSection }) {
  const history = useHistory();
  const keys = schoolKeys(storeId);
  const settings = useQuery({ queryKey: keys.settings, enabled: !!token, queryFn: () => api.businessSettings(token) });
  const [notice, setNotice] = useState<Notice>(null);
  const retryKeys = useRetryKeys();
  const current = SECTIONS.find((item) => item.value === section) ?? SECTIONS[0]!;
  const isSchool = settings.data?.modo_escuela === true;

  // Como en Android, el aviso se va solo después de un rato.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  let body: ReactNode;
  if (settings.isLoading) body = <LoadingState label="Cargando la escuela…" cards={2} />;
  else if (settings.isError || !settings.data) {
    body = <Retry message={schoolErrorMessage(settings.error, 'No pudimos cargar la escuela.')} onRetry={() => void settings.refetch()} />;
  } else if (!isSchool) {
    body = <VaiEmptyState icon={<School />} title="Este negocio no es escuela"
      message="El modo escuela se prende en Flujo de mi tienda desde la app. Cuando esté activo, aquí verás el código, el padrón, los tutores y cada día."
      action={<Link className="vai-button vai-button--secondary" to="/app">Volver al inicio</Link>} />;
  } else {
    const shared = { token, storeId, setNotice, retryKeys };
    if (section === 'ajustes') body = <SettingsSection {...shared} settings={settings.data} />;
    else if (section === 'dias') body = <DaysSection {...shared} />;
    else if (section === 'padron') body = <RosterSection {...shared} />;
    else if (section === 'tutores') body = <GuardiansSection {...shared} settings={settings.data} />;
    else body = <StudentRequestsSection {...shared} />;
  }

  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow="Administración · Escuela" title={current.title} description={current.description} />
    {isSchool && <SegmentedControl legend="Secciones de la escuela" value={section} options={SECTIONS}
      onChange={(value) => { setNotice(null); history.push(SECTIONS.find((item) => item.value === value)!.path); }} />}
    {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}
    {body}
  </main>;
}

interface SectionProps {
  token: string;
  storeId: string;
  setNotice: SetNotice;
  retryKeys: ReturnType<typeof useRetryKeys>;
}

/** Un cambio de la escuela: llave por firma, aviso al terminar y el texto de Android si falla. */
function useSchoolMutation<V, R>({ retryKeys, setNotice, signature, run, fallback, success, onSuccess, onError }: {
  retryKeys: SectionProps['retryKeys'];
  setNotice: SetNotice;
  signature: (value: V) => string;
  run: (value: V, key: string) => Promise<R>;
  fallback: string;
  success?: (result: R, value: V) => string | null;
  onSuccess?: (result: R, value: V) => void;
  onError?: (value: V) => void;
}) {
  return useMutation({
    mutationFn: (value: V) => run(value, retryKeys.take(signature(value))),
    onSuccess: (result, value) => {
      retryKeys.done(signature(value));
      const text = success?.(result, value);
      if (text) setNotice({ tone: 'success', text });
      onSuccess?.(result, value);
    },
    onError: (error, value) => {
      setNotice({ tone: 'error', text: schoolErrorMessage(error, fallback) });
      onError?.(value);
    },
  });
}

// region Ajustes

interface SettingsChange {
  input: SchoolSettingsInput;
  success: string;
  fallback: string;
}

function useSaveSettings({ token, storeId, setNotice, retryKeys }: SectionProps, onDone?: () => void) {
  const client = useQueryClient();
  return useSchoolMutation<SettingsChange, BusinessSettings>({
    retryKeys, setNotice,
    signature: (change) => `ajustes:${JSON.stringify(change.input)}`,
    run: (change, key) => api.saveSchoolSettings(token, change.input, key),
    fallback: 'No se guardó.',
    success: (_, change) => change.success,
    onSuccess: (result) => {
      client.setQueryData(schoolKeys(storeId).settings, result);
      onDone?.();
    },
  });
}

function SettingsSection(props: SectionProps & { settings: BusinessSettings }) {
  return <>
    <JoinCodeCard {...props} />
    <RulesCard {...props} />
  </>;
}

/** El código que la escuela reparte para que los tutores y alumnos entren. */
function JoinCodeCard(props: SectionProps & { settings: BusinessSettings }) {
  const { settings } = props;
  const save = useSaveSettings(props);
  const [confirmsRegenerate, setConfirmsRegenerate] = useState(false);
  const busy = save.isPending;
  const requiresCode = settings.union_requiere_codigo === true;
  const code = settings.codigo_union?.trim() || null;
  return <Card title="Unirse a la escuela">
    <p className="font-bold" aria-hidden="true">¿Quién puede entrar?</p>
    <SegmentedControl legend="¿Quién puede entrar?" disabled={busy}
      value={requiresCode ? 'codigo' : 'qr'}
      options={[{ value: 'qr', label: 'Cualquiera con el QR' }, { value: 'codigo', label: 'Solo con el código' }] as const}
      onChange={(value) => {
        const next = value === 'codigo';
        if (next !== requiresCode) save.mutate({ input: { union_requiere_codigo: next }, success: 'Guardado', fallback: 'No se guardó.' });
      }} />
    {code ? <>
      <p className="text-3xl font-black tracking-[0.3em]" aria-label={`Código para unirse: ${code.split('').join(' ')}`}>{code}</p>
      <p>Los tutores lo escriben para agregar a sus hijos. Repártelo en la circular. Al cambiarlo, el anterior deja de servir; quien ya entró se queda.</p>
      {confirmsRegenerate
        ? <InlineConfirm title="¿Cambiar el código?" message="El código de ahora deja de servir para entrar." confirmLabel="Cambiar" disabled={busy}
          onCancel={() => setConfirmsRegenerate(false)}
          onConfirm={() => { setConfirmsRegenerate(false); save.mutate({ input: { codigo_union: 'generar' }, success: 'Código nuevo listo', fallback: 'No se guardó.' }); }} />
        : <div className="flex flex-wrap gap-2">
          <VaiButton variant="secondary" disabled={busy} onClick={() => setConfirmsRegenerate(true)}>Cambiar código</VaiButton>
          {/* Sin código no se puede exigir: el servidor generaría otro. */}
          {!requiresCode && <VaiButton variant="coral" disabled={busy}
            onClick={() => save.mutate({ input: { codigo_union: null, union_requiere_codigo: false }, success: 'Ya no hay código para unirse', fallback: 'No se quitó el código.' })}>Quitar código</VaiButton>}
        </div>}
    </> : <>
      <p>Sin código, entra cualquiera que tenga el QR de la escuela.</p>
      <div><VaiButton variant="secondary" disabled={busy} loading={busy}
        onClick={() => save.mutate({ input: { codigo_union: 'generar' }, success: 'Código nuevo listo', fallback: 'No se guardó.' })}>Crear código</VaiButton></div>
    </>}
  </Card>;
}

/** Recarga con tarjeta y reglas para apartar: se editan juntas y se guardan con un botón. */
export function RulesCard(props: SectionProps & { settings: BusinessSettings }) {
  const saved = rulesDraft(props.settings);
  const [draft, setDraft] = useState<SchoolRulesDraft | null>(null);
  const save = useSaveSettings(props, () => setDraft(null));
  const current = draft ?? saved;
  const problem = rulesProblem(current);
  const changed = draft !== null && !sameRules(draft, saved);
  const busy = save.isPending;
  const edit = (patch: Partial<SchoolRulesDraft>) => setDraft((old) => ({ ...(old ?? saved), ...patch }));
  return <form className="grid gap-4" aria-label="Reglas de la escuela" onSubmit={(event) => {
    event.preventDefault();
    if (changed && !problem) save.mutate({ input: rulesInput(current), success: 'Guardado', fallback: 'No se guardó.' });
  }}>
    <Card title="Recarga con tarjeta">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mínimo" placeholder="50" inputMode="decimal" maxLength={10} value={current.reloadMinimum} disabled={busy} onChange={(event) => edit({ reloadMinimum: event.target.value })} />
        <Field label="Máximo" placeholder="2000" inputMode="decimal" maxLength={10} value={current.reloadMaximum} disabled={busy} onChange={(event) => edit({ reloadMaximum: event.target.value })} />
      </div>
    </Card>
    <Card title="Apartar comida">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="font-bold">{daysLabel(current.daysAhead)}</p>
          <small>Con 0, solo se pide para hoy.</small>
        </div>
        <VaiButton variant="secondary" aria-label="Un día menos" disabled={busy || current.daysAhead <= 0} onClick={() => edit({ daysAhead: Math.max(0, current.daysAhead - 1) })}>−</VaiButton>
        <strong aria-live="polite" aria-label={`${current.daysAhead} días antes`}>{current.daysAhead}</strong>
        <VaiButton variant="secondary" aria-label="Un día más" disabled={busy || current.daysAhead >= MAX_DAYS_AHEAD} onClick={() => edit({ daysAhead: Math.min(MAX_DAYS_AHEAD, current.daysAhead + 1) })}>+</VaiButton>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pedir hasta" hint="Del mismo día" placeholder="Todo el día" inputMode="numeric" value={current.orderCutoff} disabled={busy} onChange={(event) => edit({ orderCutoff: clockInput(event.target.value) })} />
        <Field label="Cancelar hasta" hint="El saldo regresa" placeholder="Hasta que empiece" inputMode="numeric" value={current.cancelCutoff} disabled={busy} onChange={(event) => edit({ cancelCutoff: clockInput(event.target.value) })} />
      </div>
    </Card>
    {draft !== null && problem && <Feedback tone="error">{problem}</Feedback>}
    <div><VaiButton variant="accent" type="submit" loading={busy} disabled={!changed || !!problem}>Guardar</VaiButton></div>
  </form>;
}

// endregion

// region Cada día

/** Primero pide el "hoy" de la escuela y luego los 15 días de la tira con esas fechas. */
async function loadMenu(token: string): Promise<SchoolMenuDays> {
  const first = await api.schoolMenuDays(token);
  const today = schoolToday(first);
  return api.schoolMenuDays(token, { desde: today, hasta: addDays(today, MAX_DAYS_AHEAD) });
}

function DaysSection(props: SectionProps) {
  const { token, storeId } = props;
  const keys = schoolKeys(storeId);
  const menu = useQuery({ queryKey: keys.menu, enabled: !!token, queryFn: () => loadMenu(token) });
  const catalog = useQuery({ queryKey: keys.catalog, enabled: !!token, queryFn: () => api.catalog(token) });
  const [selected, setSelected] = useState<string | null>(null);

  if (menu.isLoading) return <LoadingState label="Cargando los días…" cards={2} />;
  if (menu.isError || !menu.data) {
    return <Retry message={schoolErrorMessage(menu.error, 'No pudimos cargar el menú de los días. Revisa tu red.')} onRetry={() => void menu.refetch()} />;
  }
  const today = schoolToday(menu.data);
  const dates = stripDates(today);
  const date = selected && dates.includes(selected) ? selected : today;
  const reason = closure(menu.data, date);
  const products = catalog.data?.productos.filter((product) => product.disponible) ?? null;

  return <Card title="Cada día" description="Sin elegir productos, se vende todo el menú.">
    <ChipRow label="Días" scroll>
      {dates.map((day) => {
        const closed = closure(menu.data, day) !== null;
        const hasMenu = dayMenu(menu.data, day).length > 0;
        const label = longLabel(day, today) + (closed ? ', sin servicio' : hasMenu ? ', con menú' : '');
        return <Chip key={day} selected={day === date} aria-label={label} onClick={() => setSelected(day)}
          style={isWeekend(day) || closed ? { opacity: day === date ? 1 : 0.7 } : undefined}>
          <span className="grid text-center leading-tight">
            <small>{day === today ? 'Hoy' : weekdayShort(day)}</small>
            <strong style={closed ? { textDecoration: 'line-through' } : undefined}>{Number(day.slice(8, 10))}</strong>
            <span aria-hidden="true">{hasMenu && !closed ? '•' : ' '}</span>
          </span>
        </Chip>;
      })}
    </ChipRow>
    {reason !== null
      ? <ClosedDay {...props} date={date} reason={reason} />
      : <>
        <ReservedSummary token={token} storeId={storeId} date={date} />
        {catalog.isError
          ? <Retry message={schoolErrorMessage(catalog.error, 'No pudimos cargar el menú.')} onRetry={() => void catalog.refetch()} />
          : <MenuEditor key={date} {...props} date={date} today={today} saved={dayMenu(menu.data, date)} products={products} />}
      </>}
  </Card>;
}

function ClosedDay(props: SectionProps & { date: string; reason: string }) {
  const client = useQueryClient();
  const reopen = useSchoolMutation<string, void>({
    ...props,
    signature: (date) => `abrir:${date}`,
    run: (date, key) => api.reopenSchoolDay(props.token, date, key),
    fallback: 'No se abrió el día.',
    success: () => 'Ese día vuelve a haber servicio',
    onSuccess: () => void client.invalidateQueries({ queryKey: schoolKeys(props.storeId).menu }),
  });
  return <div className="grid gap-2 py-2">
    <p className="flex items-center gap-2 font-black"><Moon aria-hidden="true" className="size-4" />Sin servicio</p>
    <p>{props.reason}</p>
    <small>Nadie puede apartar este día.</small>
    <div><VaiButton variant="secondary" loading={reopen.isPending} onClick={() => reopen.mutate(props.date)}>Volver a abrir</VaiButton></div>
  </div>;
}

function ReservedSummary({ token, storeId, date }: { token: string; storeId: string; date: string }) {
  const reserved = useQuery({ queryKey: schoolKeys(storeId).reserved(date), enabled: !!token, queryFn: () => api.schoolReservedDay(token, date) });
  if (!reserved.data) return <p role="status">Viendo lo apartado…</p>;
  return <div className="grid gap-1 py-1">
    <p className="font-bold">{reservedLabel(reserved.data.pedidos)}</p>
    {reserved.data.productos.length > 0 && <ul className="grid gap-1" aria-label="Lo apartado">
      {reserved.data.productos.map((line) => <li key={line.producto_id} className="flex justify-between gap-3">
        <span className="font-semibold">{line.nombre}</span><strong>{line.cantidad}</strong>
      </li>)}
    </ul>}
  </div>;
}

function MenuEditor(props: SectionProps & { date: string; today: string; saved: number[]; products: { id: number; nombre: string; precio_digital: string }[] | null }) {
  const { token, storeId, date, today, saved, products, setNotice } = props;
  const client = useQueryClient();
  const keys = schoolKeys(storeId);
  const [picked, setPicked] = useState<number[] | null>(null);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  const current = picked ?? saved;
  const orders = client.getQueryData<{ pedidos: number }>(keys.reserved(date))?.pedidos ?? 0;

  const saveMenu = useSchoolMutation<number[], void>({
    ...props,
    signature: (ids) => `menu:${date}:${[...ids].sort((a, b) => a - b).join(',')}`,
    run: (ids, key) => api.saveSchoolMenuDay(token, date, [...ids].sort((a, b) => a - b), key),
    fallback: 'No se guardó el menú del día.',
    success: (_, ids) => ids.length === 0 ? 'Ese día se vende todo el menú' : 'Menú del día guardado',
    onSuccess: () => { setPicked(null); void client.invalidateQueries({ queryKey: keys.menu }); },
  });
  const closeDay = useSchoolMutation<string, Awaited<ReturnType<typeof api.closeSchoolDay>>>({
    ...props,
    signature: (typed) => `cerrar:${date}:${typed}`,
    run: (typed, key) => api.closeSchoolDay(token, date, typed, key),
    fallback: 'No se cerró el día.',
    onSuccess: (result) => {
      setNotice({ tone: 'success', text: closureSummary(result) });
      setClosing(false);
      void client.invalidateQueries({ queryKey: keys.menu });
      void client.invalidateQueries({ queryKey: keys.reserved(date) });
    },
  });
  const busy = saveMenu.isPending || closeDay.isPending;

  return <>
    {products === null
      ? <p role="status">Cargando el menú…</p>
      : products.length === 0
        ? <p>No hay productos disponibles en el menú.</p>
        : <fieldset className="grid gap-1" disabled={busy}>
          <legend className="sr-only">Productos que se venden {longLabel(date, today).toLowerCase()}</legend>
          {products.map((product) => {
            const on = current.includes(product.id);
            return <label key={product.id} className="flex items-center gap-3 py-2">
              <input type="checkbox" checked={on} onChange={() => setPicked(on ? current.filter((id) => id !== product.id) : [...current, product.id])} />
              <span className="flex-1 font-semibold">{product.nombre}</span>
              <small>{formatMoney(product.precio_digital)}</small>
            </label>;
          })}
        </fieldset>}
    <div>
      <VaiButton variant="accent" loading={saveMenu.isPending} disabled={busy || picked === null || sameIds(picked, saved)}
        onClick={() => saveMenu.mutate(current)}>{saveMenuLabel(current.length)}</VaiButton>
    </div>
    {/* Discreto a propósito: cerrar un día cancela lo apartado. */}
    <div><VaiButton variant="quiet" disabled={busy} onClick={() => { setReason(''); setClosing(true); }}>Cerrar este día: no hay servicio</VaiButton></div>
    <Modal open={closing} onOpenChange={(open) => { if (!open && !closeDay.isPending) setClosing(false); }}
      title={closeDayTitle(date, today)} description={closeDayMessage(orders)}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (reasonOk(reason)) closeDay.mutate(reason.trim()); }}>
        <Field label="Motivo" placeholder="Por qué no hay servicio" maxLength={REASON_MAX} value={reason} disabled={closeDay.isPending} onChange={(event) => setReason(event.target.value)} />
        <div className="flex flex-wrap gap-2">
          <VaiButton variant="coral" type="submit" loading={closeDay.isPending} disabled={!reasonOk(reason)}>Cerrar el día</VaiButton>
          <VaiButton variant="secondary" disabled={closeDay.isPending} onClick={() => setClosing(false)}>No</VaiButton>
        </div>
      </form>
    </Modal>
  </>;
}

// endregion

// region Padrón

function RosterSection(props: SectionProps) {
  const { token, storeId } = props;
  const client = useQueryClient();
  const keys = schoolKeys(storeId);
  const roster = useQuery({ queryKey: keys.roster, enabled: !!token, queryFn: () => api.schoolRoster(token) });
  const [pasting, setPasting] = useState(false);
  const [confirmsRemove, setConfirmsRemove] = useState(false);
  const save = useSchoolMutation<SchoolRosterStudent[], { total: number }>({
    ...props,
    signature: (students) => `padron:${JSON.stringify(students)}`,
    run: (students, key) => api.saveSchoolRoster(token, students, key),
    fallback: 'No se guardó el padrón.',
    success: (_, students) => rosterSavedNotice(students.length),
    onSuccess: (_, students) => {
      client.setQueryData(keys.roster, { total: students.length, alumnos: students });
      setPasting(false);
      setConfirmsRemove(false);
    },
  });

  if (roster.isLoading) return <LoadingState label="Cargando el padrón…" cards={1} />;
  if (roster.isError || !roster.data) {
    return <Retry message={schoolErrorMessage(roster.error, 'No pudimos traer el padrón.')} onRetry={() => void roster.refetch()} />;
  }
  const students = roster.data.alumnos;
  const busy = save.isPending;
  return <Card title="Padrón de alumnos">
    {students.length === 0 ? <>
      <p>Sin padrón, cualquier tutor con el código puede dar de alta la matrícula que escriba. Pega la lista de tus alumnos para que solo entren ellos.</p>
      <div><VaiButton variant="secondary" disabled={busy} onClick={() => setPasting(true)}>Pegar lista</VaiButton></div>
    </> : <>
      <p className="text-2xl font-black">{studentsLabel(students.length)}</p>
      {groupsLine(students) && <p>{groupsLine(students)}</p>}
      <p>Los tutores solo dan de alta matrículas de esta lista, y el grupo sale de aquí.</p>
      {confirmsRemove
        ? <InlineConfirm title="¿Quitar el padrón?" destructive disabled={busy} confirmLabel="Quitar"
          message="Cualquier tutor con el código podrá dar de alta la matrícula que escriba. Los hijos ya dados de alta se quedan."
          onCancel={() => setConfirmsRemove(false)} onConfirm={() => save.mutate([])} />
        : <div className="flex flex-wrap gap-2">
          <VaiButton variant="secondary" disabled={busy} onClick={() => setPasting(true)}>Cambiar lista</VaiButton>
          <VaiButton variant="coral" disabled={busy} onClick={() => setConfirmsRemove(true)}>Quitar padrón</VaiButton>
        </div>}
    </>}
    <Modal open={pasting} onOpenChange={(open) => { if (!open && !busy) setPasting(false); }} title="Pegar lista" size="large"
      description={'Copia de tu hoja de cálculo las columnas matrícula, nombre y grupo, y pégalas aquí: una fila por alumno.'
        + (students.length > 0 ? ` Reemplaza la lista de ahora (${students.length}).` : '')}>
      {pasting && <RosterPaste busy={busy} onSave={(list) => save.mutate(list)} />}
    </Modal>
  </Card>;
}

export function RosterPaste({ busy, onSave }: { busy: boolean; onSave: (students: SchoolRosterStudent[]) => void }) {
  const [text, setText] = useState('');
  const result = parseRoster(text);
  return <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (canSaveRoster(result)) onSave(result.students); }}>
    <label className="field">
      <span className="field__label">Alumnos</span>
      <textarea className="field__control min-h-40 resize-y" placeholder="A-001, Ana López, 3°B" value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
    </label>
    {(result.students.length > 0 || result.problems.length > 0) && <div className="grid gap-1" aria-live="polite">
      <p className="font-bold">{result.students.length === 1 ? 'Se leyó 1 alumno' : `Se leyeron ${result.students.length} alumnos`}</p>
      {result.problems.slice(0, 3).map((problem) => <p key={`${problem.line}-${problem.reason}`} style={{ color: 'var(--vai-coral-text)' }}>{problemText(problem)}</p>)}
      {result.problems.length > 3 && <p style={{ color: 'var(--vai-coral-text)' }}>y {result.problems.length - 3} líneas más con problema</p>}
    </div>}
    <div><VaiButton variant="accent" type="submit" loading={busy} disabled={!canSaveRoster(result)}>Guardar padrón</VaiButton></div>
  </form>;
}

// endregion

// region Tutores

function GuardiansSection(props: SectionProps & { settings: BusinessSettings }) {
  return <>
    <GuardianRequestsCard {...props} />
    <GuardianshipsCard {...props} />
  </>;
}

function GuardianRequestsCard(props: SectionProps & { settings: BusinessSettings }) {
  const { token, storeId, settings } = props;
  const client = useQueryClient();
  const keys = schoolKeys(storeId);
  const requests = useQuery({ queryKey: keys.guardianRequests, enabled: !!token, queryFn: () => api.schoolGuardianRequests(token) });
  // El padrón solo se nombra si la escuela tiene uno.
  const roster = useQuery({ queryKey: keys.roster, enabled: !!token, queryFn: () => api.schoolRoster(token) });
  const hasRoster = (roster.data?.alumnos.length ?? 0) > 0;
  const approval = useSaveSettings(props);
  const needsApproval = settings.tutores_requieren_aprobacion !== false;
  const [rejecting, setRejecting] = useState<string | null>(null);
  const review = useSchoolMutation<{ request: SchoolGuardianRequest; approve: boolean }, void>({
    ...props,
    signature: ({ request, approve }) => `revisar:${request.tutela_id}:${approve}`,
    run: ({ request, approve }, key) => api.reviewSchoolGuardianRequest(token, request.tutela_id, approve, key),
    fallback: 'No se guardó la decisión.',
    success: (_, { request, approve }) => approve ? `${personName(request.tutor)} ya cuida a ${studentName(request.alumno)}` : 'Solicitud rechazada',
    onSuccess: (_, { request }) => {
      setRejecting(null);
      client.setQueryData<SchoolGuardianRequest[]>(keys.guardianRequests, (old) => old?.filter((row) => row.tutela_id !== request.tutela_id));
    },
    onError: () => void requests.refetch(),
  });
  const busy = review.isPending || approval.isPending;

  return <Card title="Tutores">
    <p className="font-bold" aria-hidden="true">¿Quién decide quién cuida a cada alumno?</p>
    <SegmentedControl legend="¿Quién decide quién cuida a cada alumno?" disabled={busy}
      value={needsApproval ? 'escuela' : 'solos'}
      options={[{ value: 'escuela', label: 'La escuela aprueba' }, { value: 'solos', label: 'Entran solos' }] as const}
      onChange={(value) => {
        const next = value === 'escuela';
        if (next !== needsApproval) approval.mutate({ input: { tutores_requieren_aprobacion: next }, success: 'Guardado', fallback: 'No se guardó.' });
      }} />
    {requests.isLoading ? <p role="status">Cargando solicitudes…</p>
      : requests.isError || !requests.data ? <Retry message={schoolErrorMessage(requests.error, 'No pudimos traer las solicitudes de tutores.')} onRetry={() => void requests.refetch()} />
      : requests.data.length === 0 ? <p>{needsApproval
        ? 'Nadie espera. Cuando un tutor agregue a su hijo, aparece aquí para que lo apruebes.'
        : 'Los tutores que agregan a su hijo lo ven y le recargan de inmediato, sin pasar por aquí.'}</p>
      : <ul className="grid gap-3" aria-label="Solicitudes de tutores">{requests.data.map((request) => <li key={request.tutela_id} className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0">
        <p className="font-black">{studentTitle(request.alumno)}</p>
        <p>Lo pide {personName(request.tutor)}{request.tutor.email ? ` · ${request.tutor.email}` : ''}</p>
        <small style={hasRoster && !request.en_padron ? { color: 'var(--vai-coral-text)', fontWeight: 700 } : undefined}>{requestFacts(request, hasRoster)}</small>
        {rejecting === request.tutela_id
          ? <InlineConfirm title={`¿Rechazar a ${personName(request.tutor)}?`} message={rejectGuardianMessage(request)} confirmLabel="Rechazar" destructive disabled={busy}
            onCancel={() => setRejecting(null)} onConfirm={() => review.mutate({ request, approve: false })} />
          : <div className="flex flex-wrap gap-2">
            <VaiButton variant="primary" disabled={busy} onClick={() => review.mutate({ request, approve: true })}>Aprobar</VaiButton>
            <VaiButton variant="coral" disabled={busy} onClick={() => setRejecting(request.tutela_id)}>Rechazar</VaiButton>
          </div>}
      </li>)}</ul>}
  </Card>;
}

/** Espera a que deje de escribir para no buscar letra por letra (350 ms, como Android). */
function useDebounced(value: string, ms = 350): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function GuardianshipsCard(props: SectionProps) {
  const { token, storeId } = props;
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim());
  const enabled = !!token && search.length >= MIN_SEARCH_LENGTH;
  // La clave lleva el texto: una respuesta lenta de una búsqueda vieja no pisa la de ahora.
  const found = useQuery({
    queryKey: schoolKeys(storeId).guardianships(search),
    enabled,
    queryFn: ({ signal }) => api.searchSchoolGuardianships(token, search, signal),
  });
  // "q<id>" = confirmar quitar; "p<id>" = confirmar que ponga los controles.
  const [confirming, setConfirming] = useState<string | null>(null);
  const refresh = () => {
    setConfirming(null);
    void client.invalidateQueries({ queryKey: schoolKeys(storeId).guardianships(search) });
  };
  const remove = useSchoolMutation<SchoolGuardianship, void>({
    ...props,
    signature: (row) => `quitar-tutor:${row.tutela_id}`,
    run: (row, key) => api.removeSchoolGuardianship(token, row.tutela_id, key),
    fallback: 'No se quitó.',
    success: (_, row) => `${personName(row.tutor)} ya no cuida a ${studentName(row.alumno)}`,
    onSuccess: refresh,
  });
  const principal = useSchoolMutation<SchoolGuardianship, void>({
    ...props,
    signature: (row) => `principal:${row.tutela_id}`,
    run: (row, key) => api.makeSchoolGuardianPrincipal(token, row.tutela_id, key),
    fallback: 'No se cambió.',
    success: (_, row) => `Ahora ${personName(row.tutor)} pone los controles de ${studentName(row.alumno)}`,
    onSuccess: refresh,
  });
  const busy = remove.isPending || principal.isPending;
  const students = found.data ? byStudent(found.data) : null;

  return <Card title="Quién cuida a cada alumno">
    <Field label="Alumno" placeholder="Nombre o matrícula" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    {!enabled || query.trim().length < MIN_SEARCH_LENGTH ? <p>Escribe al menos dos letras del nombre o la matrícula.</p>
      : found.isLoading ? <p role="status">Buscando…</p>
      : found.isError ? <Retry message={schoolErrorMessage(found.error, 'No pudimos buscar.')} onRetry={() => void found.refetch()} />
      : !students || students.length === 0 ? <p>Nadie cuida a un alumno con ese nombre o matrícula.</p>
      : <ul className="grid gap-3" aria-label="Alumnos encontrados">{students.map((rows) => <li key={rows[0]!.alumno.usuario_id ?? rows[0]!.tutela_id} className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
        <p className="font-black">{studentTitle(rows[0]!.alumno)}</p>
        {rows.map((row) => <div key={row.tutela_id} className="grid gap-1">
          <p><span className="font-semibold">{personName(row.tutor)}</span>{row.tutor.email ? <small> · {row.tutor.email}</small> : null}
            {row.principal && <span className="ml-2 rounded-full px-2 text-xs font-bold" style={{ background: 'var(--vai-lime)' }}>Pone los controles</span>}</p>
          {confirming === `q${row.tutela_id}`
            ? <InlineConfirm title={`¿Quitar a ${personName(row.tutor)}?`} confirmLabel="Quitar" destructive disabled={busy}
              message={row.principal
                ? `Deja de ver a ${studentName(row.alumno)}. Si tiene otro tutor, ese pasa a poner los controles.`
                : `Deja de ver a ${studentName(row.alumno)}, de recargarle y de apartarle comida.`}
              onCancel={() => setConfirming(null)} onConfirm={() => remove.mutate(row)} />
            : confirming === `p${row.tutela_id}`
              ? <InlineConfirm title={`¿${personName(row.tutor)} pone los controles?`} confirmLabel="Sí, que los ponga" disabled={busy}
                message={`Decidirá el límite, los bloqueos y las alergias de ${studentName(row.alumno)}. Los demás tutores siguen viéndolo.`}
                onCancel={() => setConfirming(null)} onConfirm={() => principal.mutate(row)} />
              : <div className="flex flex-wrap gap-2">
                {rows.length > 1 && !row.principal && <VaiButton variant="secondary" disabled={busy} onClick={() => setConfirming(`p${row.tutela_id}`)}>Que ponga los controles</VaiButton>}
                <VaiButton variant="coral" disabled={busy} onClick={() => setConfirming(`q${row.tutela_id}`)}>Quitar</VaiButton>
              </div>}
        </div>)}
      </li>)}</ul>}
  </Card>;
}

// endregion

// region Devoluciones y bajas

function StudentRequestsSection(props: SectionProps) {
  const { token, storeId } = props;
  const client = useQueryClient();
  const keys = schoolKeys(storeId);
  const requests = useQuery({ queryKey: keys.studentRequests, enabled: !!token, queryFn: () => api.schoolStudentRequests(token) });
  // "r<id>" = confirmar resolver; "x<id>" = rechazar con motivo.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const drop = (request: SchoolStudentRequest) => {
    setConfirming(null);
    client.setQueryData<SchoolStudentRequest[]>(keys.studentRequests, (old) => old?.filter((row) => row.id !== request.id));
  };
  const resolve = useSchoolMutation<SchoolStudentRequest, void>({
    ...props,
    signature: (request) => `solicitud:${request.id}:resolver`,
    run: (request, key) => api.resolveSchoolStudentRequest(token, request.id, key),
    fallback: 'No se guardó.',
    success: (_, request) => resolvedText(request),
    onSuccess: (_, request) => drop(request),
    onError: () => void requests.refetch(),
  });
  const reject = useSchoolMutation<{ request: SchoolStudentRequest; reason: string }, void>({
    ...props,
    signature: ({ request, reason: typed }) => `solicitud:${request.id}:rechazar:${typed}`,
    run: ({ request, reason: typed }, key) => api.rejectSchoolStudentRequest(token, request.id, typed, key),
    fallback: 'No se guardó.',
    success: (_, { request }) => `Le avisamos a ${personName(request.tutor)}`,
    onSuccess: (_, { request }) => drop(request),
    onError: () => void requests.refetch(),
  });
  const busy = resolve.isPending || reject.isPending;

  if (requests.isLoading) return <LoadingState label="Cargando solicitudes…" cards={1} />;
  if (requests.isError || !requests.data) {
    return <Retry message={schoolErrorMessage(requests.error, 'No pudimos traer las devoluciones y bajas.')} onRetry={() => void requests.refetch()} />;
  }
  const rows = knownStudentRequests(requests.data);
  return <Card title="Devoluciones y bajas">
    {rows.length === 0
      ? <p>Nadie ha pedido nada. Si un tutor pide que le devuelvan el saldo de su hijo o que borren sus datos, aparece aquí.</p>
      : <ul className="grid gap-3" aria-label="Devoluciones y bajas">{rows.map((request) => {
        const warning = studentRequestWarning(request);
        const refund = isRefund(request);
        return <li key={request.id} className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0">
          <p className="font-black">{[studentName(request.alumno), request.alumno.matricula ? `Matrícula ${request.alumno.matricula}` : null, request.alumno.grupo].filter(Boolean).join(' · ')}</p>
          <p>Lo pide {personName(request.tutor)}{request.tutor.email ? ` · ${request.tutor.email}` : ''}</p>
          <p className="font-bold" style={{ color: refund ? undefined : 'var(--vai-coral-text)' }}>{studentRequestWhat(request)}</p>
          {request.nota?.trim() && <p><em>“{request.nota.trim()}”</em></p>}
          {warning && <small style={{ color: 'var(--vai-coral-text)', fontWeight: 700 }}>{warning}</small>}
          {confirming === `r${request.id}`
            ? <InlineConfirm title={studentRequestConfirmTitle(request)} message={studentRequestConfirmMessage(request)} destructive={!refund} disabled={busy}
              confirmLabel={refund ? 'Sí, ya se lo entregué' : 'Dar de baja'}
              onCancel={() => setConfirming(null)} onConfirm={() => resolve.mutate(request)} />
            : confirming === `x${request.id}`
              ? <InlineConfirm title="¿Por qué no procede?" message={`${personName(request.tutor)} lo verá en la ficha de ${studentName(request.alumno)}.`}
                confirmLabel="Rechazar" destructive disabled={busy} confirmDisabled={reason.trim().length < MIN_REJECTION_REASON}
                onCancel={() => setConfirming(null)} onConfirm={() => reject.mutate({ request, reason: reason.trim() })}>
                <Field label="Motivo" placeholder={`Se lo decimos a ${personName(request.tutor)}`} maxLength={300} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
              </InlineConfirm>
              : <div className="flex flex-wrap gap-2">
                <VaiButton variant="primary" disabled={busy || !canResolve(request)} onClick={() => setConfirming(`r${request.id}`)}>{refund ? 'Ya se lo entregué' : 'Dar de baja'}</VaiButton>
                <VaiButton variant="coral" disabled={busy} onClick={() => { setReason(''); setConfirming(`x${request.id}`); }}>Rechazar</VaiButton>
              </div>}
        </li>;
      })}</ul>}
  </Card>;
}

// endregion
