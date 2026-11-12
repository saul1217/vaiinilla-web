import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, HandCoins, MapPin, Phone, Truck } from 'lucide-react';
import { useRef, useState } from 'react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback, Field, Modal } from '../components/ui';
import { Card, Chip, ChipRow, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { formatMoney } from '../lib/money';
import {
  AGENDA_REFRESH_MS,
  ActionKeys,
  REASON_MAX,
  acceptDeadlineLabel,
  actionBody,
  actionErrorMessage,
  agendaRange,
  amountDue,
  buildBoard,
  cleanCode,
  customerLabel,
  dayLabel,
  deliveryLine,
  doneMessage,
  firstName,
  homeOrderStep,
  isCodeLocked,
  isHomeDelivery,
  itemsLabel,
  mapsUrl,
  ordersCountLabel,
  paidDeposit,
  phoneHref,
  reasonIsValid,
  repartoKeys,
  stateLabel,
  type CollectMethod,
  type HomeOrderAction,
} from '../lib/reparto';
import type { HomeAgendaDay, HomeOrder } from '../types/api';

export function RepartoPage() {
  const { tenant } = useSessions();
  if (!tenant) return null;
  const { establecimiento_id: storeId, membresia_id: membershipId, rol } = tenant.context;
  // Remontar al cambiar de negocio o membresía descarta el pedido abierto y las llaves de la sesión anterior.
  return <RepartoScreen key={`${storeId}:${membershipId}`} token={tenant.token} role={rol} storeId={storeId} />;
}

function RepartoScreen({ token, role, storeId }: { token: string; role: string; storeId: string }) {
  const queryClient = useQueryClient();
  const [range] = useState(() => agendaRange());
  const queryKey = repartoKeys(storeId).agenda(range.from, range.to);
  const agenda = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: ({ signal }) => api.homeAgenda(token, range.from, range.to, signal),
    refetchInterval: AGENDA_REFRESH_MS,
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ message: string; locked: boolean } | null>(null);
  const keys = useRef(new ActionKeys());
  const sending = useRef(false);

  // Lo que respondió una acción entra a la agenda sin esperar la siguiente lectura.
  const replaceOrder = (updated: HomeOrder) => {
    queryClient.setQueryData<HomeAgendaDay[]>(queryKey, (days) => days?.map((day) => ({
      ...day,
      pedidos: day.pedidos.map((order) => (order.id === updated.id ? updated : order)),
    })));
  };

  const runOne = async (order: HomeOrder, action: HomeOrderAction): Promise<HomeOrder | null> => {
    const key = keys.current.keyFor(order.id, action);
    try {
      const result = action.type === 'cancelaciones'
        ? (await api.cancelHomeOrder(token, order.id, actionBody(action), key), null)
        : await api.homeOrderAction(token, order.id, action.type, actionBody(action), key);
      keys.current.settle(order.id, action);
      if (result) replaceOrder(result);
      return result;
    } catch (error) {
      keys.current.settle(order.id, action, error);
      throw error;
    }
  };

  const mutation = useMutation({
    // «Entregar y cobrar» son dos llamadas: si la segunda falla, el pedido queda en «Me deben».
    mutationFn: async ({ order, actions }: { order: HomeOrder; actions: HomeOrderAction[] }) => {
      let current = order;
      for (const action of actions) {
        current = (await runOne(current, action)) ?? current;
      }
      return actions[actions.length - 1]!;
    },
    onSuccess: (last, { actions }) => {
      setActionError(null);
      setNotice(actions.length > 1 ? 'Entregado y cobrado.' : doneMessage(last));
      if (last.type === 'rechazar' || last.type === 'cancelaciones') setOpenId(null);
    },
    onError: (error) => {
      setNotice(null);
      setActionError({ message: actionErrorMessage(error, role), locked: isCodeLocked(error) });
    },
    onSettled: () => {
      sending.current = false;
      void queryClient.invalidateQueries({ queryKey: repartoKeys(storeId).all });
    },
  });

  const run = (order: HomeOrder, actions: HomeOrderAction[]) => {
    if (sending.current) return;
    sending.current = true;
    setActionError(null);
    mutation.mutate({ order, actions });
  };

  const open = (order: HomeOrder) => {
    setOpenId(order.id);
    setActionError(null);
  };

  const board = agenda.data ? buildBoard(agenda.data, range.today) : null;
  const openOrder = openId && agenda.data
    ? agenda.data.flatMap((day) => day.pedidos).find((order) => order.id === openId) ?? null
    : null;

  return <main className="page-stack admin-screen admin-overview">
    <AppPageHeader eyebrow={role === 'admin' ? 'Administración · Reparto' : 'Caja · Reparto'} title="Reparto y encargos"
      description="Los pedidos a domicilio y los encargos para otro día: acepta, manda, entrega con el código del cliente y anota lo que te pagaron en la puerta." />

    {notice && !openOrder && <Feedback tone="success">{notice}</Feedback>}

    {agenda.isLoading && <LoadingState label="Cargando la agenda…" cards={3} />}
    {agenda.isError && !agenda.data && <Feedback tone="error">
      No se pudo cargar la agenda: {errorMessage(agenda.error)}{' '}
      <VaiButton variant="secondary" onClick={() => void agenda.refetch()}>Reintentar</VaiButton>
    </Feedback>}

    {board && <>
      {board.awaiting.length > 0 && <Card title={`Por aceptar · ${board.awaiting.length}`}
        description="Los encargos y pedidos a domicilio nuevos esperan aquí tu sí.">
        <ul className="grid gap-2" aria-label="Por aceptar">
          {board.awaiting.map((order) => <li key={order.id}>
            <AgendaRow order={order} today={range.today} amount={order.total} detail={acceptDeadlineLabel(order)} onOpen={open} />
          </li>)}
        </ul>
      </Card>}

      {board.owed.length > 0 && <Card title="Me deben" description="Entregados que falta cobrar. Toca uno para anotar cómo te pagó.">
        <p className="text-2xl font-black" aria-label="Total que te deben">{formatMoney(board.owedTotal)}</p>
        <ul className="mt-2 grid gap-2" aria-label="Me deben">
          {board.owed.map((order) => <li key={order.id}>
            <AgendaRow order={order} today={range.today} amount={amountDue(order) ?? order.total} onOpen={open} />
          </li>)}
        </ul>
      </Card>}

      <h2 className="text-lg font-bold">Lo que entregas cada día</h2>
      {board.days.length === 0
        ? <VaiEmptyState icon={<CalendarDays />} title="Sin entregas pendientes"
          message="Cuando alguien te pida a domicilio o para otro día, sale aquí en ese día." />
        : board.days.map((day) => <Card key={day.fecha} title={`${dayLabel(day.fecha, range.today)} · ${ordersCountLabel(day.pedidos.length)}`}>
          <ul className="grid gap-2" aria-label={`Pedidos de ${dayLabel(day.fecha, range.today)}`}>
            {day.pedidos.map((order) => <li key={order.id}>
              <AgendaRow order={order} today={range.today} amount={order.total} onOpen={open} />
            </li>)}
          </ul>
        </Card>)}
    </>}

    {/* Al cambiar de paso (otra pestaña o la lectura de cada 15 s) el panel se remonta y la pregunta del motivo se cierra. */}
    <Modal open={Boolean(openOrder)} onOpenChange={(next) => { if (!next) { setOpenId(null); setActionError(null); } }}
      presentation="responsive-sheet" size="large"
      title={openOrder ? `#${openOrder.folio} · ${stateLabel(openOrder)}` : 'Pedido'}
      description={openOrder ? [isHomeDelivery(openOrder) ? 'A domicilio' : 'Encargo', deliveryLine(openOrder, range.today)].filter(Boolean).join(' · ') : undefined}>
      {openOrder && <OrderPanel key={`${openOrder.id}:${homeOrderStep(openOrder) ?? openOrder.estado}`} order={openOrder} role={role} busy={mutation.isPending}
        notice={notice} error={actionError} onRun={(actions) => run(openOrder, actions)} />}
    </Modal>
  </main>;
}

function AgendaRow({ order, today, amount, detail, onOpen }: {
  order: HomeOrder;
  today: string;
  amount: string;
  detail?: string | null;
  onOpen: (order: HomeOrder) => void;
}) {
  const who = order.usuario?.nombre?.trim() || order.entrega?.direccion;
  const line = [stateLabel(order), deliveryLine(order, today), detail].filter(Boolean).join(' · ');
  return <button type="button" className="vai-card flex w-full items-center justify-between gap-3 text-left" onClick={() => onOpen(order)}>
    <span className="grid gap-1">
      <span className="font-semibold">{[`#${order.folio}`, who].filter(Boolean).join(' · ')}</span>
      <small>{line}</small>
    </span>
    <strong>{formatMoney(amount)}</strong>
  </button>;
}

function OrderPanel({ order, role, busy, notice, error, onRun }: {
  order: HomeOrder;
  role: string;
  busy: boolean;
  notice: string | null;
  error: { message: string; locked: boolean } | null;
  onRun: (actions: HomeOrderAction[]) => void;
}) {
  const step = homeOrderStep(order);
  const due = amountDue(order);
  const deposit = paidDeposit(order);
  const delivery = order.entrega ?? null;
  const tel = phoneHref(delivery?.telefono);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<CollectMethod>('efectivo');
  const [asking, setAsking] = useState<'rechazar' | 'cancelar' | null>(null);
  const [reason, setReason] = useState('');

  const name = firstName(order);
  const items = itemsLabel(order);
  const note = order.notas_cocina?.trim() || order.items.find((item) => item.notas?.trim())?.notas?.trim();

  return <div className="grid gap-4">
    {notice && <Feedback tone="success">{notice}</Feedback>}
    {error && <Feedback tone="error">
      {error.message}
      {error.locked && role === 'admin' && step === 'entregar' && <div className="mt-3">
        <VaiButton variant="secondary" loading={busy}
          onClick={() => onRun([{ type: 'entregar-domicilio', codigo: null, entregaManual: true }])}>Entregar sin código</VaiButton>
      </div>}
    </Feedback>}

    <Card title={customerLabel(order)}>
      {delivery && <div className="grid gap-1">
        <p className="flex items-start gap-2"><MapPin aria-hidden="true" className="mt-1 size-4 shrink-0" /><span>{delivery.direccion}</span></p>
        {delivery.referencia && <small>{delivery.referencia}</small>}
        <div className="mt-2 flex flex-wrap gap-2">
          <a className="vai-button vai-button--secondary" href={mapsUrl(delivery)} target="_blank" rel="noopener noreferrer">Abrir en Mapas</a>
          {tel && <a className="vai-button vai-button--secondary" href={tel}><Phone aria-hidden="true" className="size-4" /> Llamar</a>}
        </div>
      </div>}
      {items && <p className="mt-3 font-semibold">{items}</p>}
      {note && <small>Nota: «{note}»</small>}
      <dl className="mt-3 grid gap-1">
        {order.costo_envio && isHomeDelivery(order) && <Row label="Envío" value={formatMoney(order.costo_envio)} />}
        {deposit && <Row label="Anticipo pagado" value={formatMoney(deposit)} />}
        {order.repartidor_nombre && <Row label="Lo lleva" value={order.repartidor_nombre} />}
        {order.cobrado_al_entregar && <Row label="Cobrado al entregar" value={order.cobrado_al_entregar.metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'} />}
        <Row label="Total" value={formatMoney(order.total)} />
        {due && <Row label="Por cobrar al entregar" value={formatMoney(due)} strong />}
      </dl>
    </Card>

    {order.estado === 'por_cobrar' && <Feedback tone="info">Aceptado: le toca pagar a {name} con tarjeta. Cuando pague, podrás mandarlo.</Feedback>}

    {asking
      ? <Card title={asking === 'rechazar' ? '¿Rechazar el encargo?' : '¿Cancelar el pedido?'}
        description={asking === 'rechazar'
          ? `A ${name} se le devuelve lo que pagó y le llega el motivo.`
          : `A ${name} le llega el motivo. Lo que ya pagó se le devuelve.`}>
        <Field label="Motivo" maxLength={REASON_MAX} autoComplete="off" value={reason} disabled={busy}
          onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX))}
          hint="Al menos 3 letras." />
        <div className="mt-3 flex flex-wrap gap-2">
          <VaiButton variant="secondary" disabled={busy} onClick={() => { setAsking(null); setReason(''); }}>Volver</VaiButton>
          <VaiButton variant="coral" loading={busy} disabled={!reasonIsValid(reason) || busy} onClick={() => onRun([asking === 'rechazar'
            ? { type: 'rechazar', motivo: reason }
            : { type: 'cancelaciones', motivo: reason, versionEsperada: order.version }])}>
            {asking === 'rechazar' ? 'Rechazar' : 'Cancelar pedido'}
          </VaiButton>
        </div>
      </Card>
      : <StepActions step={step} due={due} name={name} busy={busy} code={code} method={method}
        onCode={setCode} onMethod={setMethod} onAsk={setAsking} onRun={onRun} />}
  </div>;
}

function StepActions({ step, due, name, busy, code, method, onCode, onMethod, onAsk, onRun }: {
  step: ReturnType<typeof homeOrderStep>;
  due: string | null;
  name: string;
  busy: boolean;
  code: string;
  method: CollectMethod;
  onCode: (code: string) => void;
  onMethod: (method: CollectMethod) => void;
  onAsk: (kind: 'rechazar' | 'cancelar') => void;
  onRun: (actions: HomeOrderAction[]) => void;
}) {
  if (!step) return null;
  const methods = due && (step === 'entregar' || step === 'cobrar')
    ? <ChipRow label="Cómo te pagó">
      <Chip selected={method === 'efectivo'} onClick={() => onMethod('efectivo')}>Efectivo</Chip>
      <Chip selected={method === 'transferencia'} onClick={() => onMethod('transferencia')}>Transferencia</Chip>
    </ChipRow>
    : null;

  return <Card>
    {step === 'decidir' && <div className="flex flex-wrap gap-2">
      <VaiButton variant="secondary" disabled={busy} onClick={() => onAsk('rechazar')}>Rechazar</VaiButton>
      <VaiButton variant="accent" loading={busy} onClick={() => onRun([{ type: 'aceptar' }])}>Aceptar encargo</VaiButton>
    </div>}

    {step === 'mandar' && <div className="grid gap-2">
      <VaiButton variant="accent" block loading={busy} onClick={() => onRun([{ type: 'en-camino' }])}>
        <Truck aria-hidden="true" className="size-4" /> Salió a entregar
      </VaiButton>
      <small>Al cliente le llega su código para recibirlo.</small>
    </div>}

    {step === 'entregar' && <div className="grid gap-3">
      <Field label="Código del cliente" inputMode="numeric" autoComplete="off" placeholder="0000" maxLength={4} value={code}
        disabled={busy} onChange={(event) => onCode(cleanCode(event.target.value))}
        hint={`Pídele a ${name} los 4 dígitos que ve en su app.`} />
      {methods}
      <VaiButton variant="accent" block loading={busy} disabled={code.length !== 4 || busy}
        onClick={() => onRun(due
          ? [{ type: 'entregar-domicilio', codigo: code }, { type: 'cobrar-entrega', metodo: method }]
          : [{ type: 'entregar-domicilio', codigo: code }])}>
        {due ? `Entregar y cobrar ${formatMoney(due)}` : 'Entregado'}
      </VaiButton>
    </div>}

    {step === 'cobrar' && due && <div className="grid gap-3">
      <small>Anota cómo te pagó al recibir.</small>
      {methods}
      <VaiButton variant="accent" block loading={busy} onClick={() => onRun([{ type: 'cobrar-entrega', metodo: method }])}>
        <HandCoins aria-hidden="true" className="size-4" /> Ya me pagó {formatMoney(due)}
      </VaiButton>
    </div>}

    {(step === 'mandar' || step === 'entregar') && <div className="mt-3">
      <VaiButton variant="quiet" disabled={busy} onClick={() => onAsk('cancelar')}>Cancelar pedido</VaiButton>
    </div>}
  </Card>;
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex justify-between gap-3">
    <dt>{label}</dt>
    <dd className={strong ? 'font-black' : 'font-semibold'}>{value}</dd>
  </div>;
}
