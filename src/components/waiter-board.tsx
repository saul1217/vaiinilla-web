// Tablero de Mesero y Caja: cada mesa a la vista, más urgente primero (llamando → pedido
// listo → activa → libre). Sondea cada 5 s. Al tocar una mesa se abre su detalle con las
// acciones Voy / Atendida / Entregar y su cuenta (cobrar, rentar, liberar).
// Contrato: docs/mesero-backend.md.
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell, CheckCircle2, ScanLine, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Feedback, Modal } from './ui';
import { SpaceAccountPanel } from './space-account-panel';
import { spaceStatusLine } from '../lib/space-status';
import { splitSpaceName, type StaffUi } from '../lib/staff-ui';
import { OrderStatusBadge } from './status-badge';
import { alertKeys, newAlerts, type WaiterAlert } from '../lib/waiter-alerts';
import { playAlert, systemNotify, unlockAlertSound } from '../lib/alert-sound';
import { QrTokenField } from './qr-token-field';
import { api } from '../lib/api';
import { deliveryRequiresQr as orderRequiresQr } from '../lib/delivery-policy';
import { errorMessage } from '../lib/api-error';
import type { SpaceAvailability } from '../types/api';
import {
  CALL_REASON_LABEL,
  createWaiterClient,
  type BoardOrder,
  type BoardTable,
  type TableCall,
} from '../lib/mesero-api';

const POLL_MS = 5000;

type TableState = 'call' | 'ready' | 'active' | 'free';

const STATE_RANK: Record<TableState, number> = { call: 0, ready: 1, active: 2, free: 3 };

function stateOf(table: BoardTable, space?: SpaceAvailability): TableState {
  if (table.llamada) return 'call';
  if (table.pedidos.some((order) => order.estado === 'listo')) return 'ready';
  if (table.pedidos.length > 0 || (space && space.estado !== 'libre')) return 'active';
  return 'free';
}

function since(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function WaiterBoard({
  token,
  role,
  variant = 'anterior',
  businessName,
  onAddOrder,
}: {
  token: string;
  role: 'mesero' | 'cajero';
  /** 'nueva' = presentación de las apps (oscura); misma función. */
  variant?: StaffUi;
  businessName?: string;
  onAddOrder?: (spaceId: number) => void;
}) {
  const client = useMemo(() => createWaiterClient(() => Promise.resolve(token)), [token]);
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [delivering, setDelivering] = useState<BoardOrder | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Solo en la presentación nueva, como en las apps: todas o solo las que piden algo.
  const [onlyPending, setOnlyPending] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const board = useQuery({
    queryKey: ['mesero-board'],
    enabled: Boolean(token),
    queryFn: () => client.board(),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const availability = useQuery({
    queryKey: ['space-availability'],
    enabled: Boolean(token),
    queryFn: () => api.spaceAvailability(token),
    refetchInterval: POLL_MS,
  });
  const spaces = useMemo(
    () => new Map((availability.data ?? []).map((space) => [space.espacio.id, space])),
    [availability.data],
  );

  // Un negocio puede dispensar el QR al entregar en el espacio ("Flujo de mi tienda").
  const status = useQuery({
    queryKey: ['operational-status', 'delivery-qr'],
    enabled: Boolean(token),
    queryFn: () => api.operationalStatus(token),
    staleTime: 60_000,
  });
  const deliveryRequiresQr = (order: BoardOrder) => orderRequiresQr(order, status.data?.entrega_requiere_qr);
  const canDeliver = role === 'mesero';

  const transition = useMutation({
    mutationFn: ({ call, target }: { call: TableCall; target: 'en_camino' | 'atendida' }) => client.transitionCall(call, target),
    onSuccess: async (_, variables) => {
      setNotice({
        tone: 'success',
        text: variables.target === 'en_camino' ? `Vas a ${variables.call.espacio.nombre}.` : `${variables.call.espacio.nombre} atendida.`,
      });
      if (variables.target === 'atendida') setOpenId(null);
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
    // Another waiter may have taken or closed the call (409): show why and reload the board.
    onError: async (error) => {
      setNotice({ tone: 'error', text: errorMessage(error) });
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: ({ order, qr }: { order: BoardOrder; qr: string }) => api.deliverOrder(token, order.id, order.version, qr),
    onSuccess: async (updated) => {
      setNotice({ tone: 'success', text: `Pedido ${updated.folio} entregado.` });
      setDelivering(null);
      setQrToken('');
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
    // A version conflict leaves `delivering` stale; the refetched board supplies the new version on retry.
    onError: async (error, variables) => {
      if (!deliveryRequiresQr(variables.order)) setNotice({ tone: 'error', text: errorMessage(error) });
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
  });

  const tables = useMemo(() => {
    const list = [...(board.data?.tables ?? [])];
    list.sort((a, b) => {
      const rank = STATE_RANK[stateOf(a, spaces.get(a.espacio.id))] - STATE_RANK[stateOf(b, spaces.get(b.espacio.id))];
      if (rank !== 0) return rank;
      if (a.llamada && b.llamada) return Date.parse(a.llamada.creado_en) - Date.parse(b.llamada.creado_en);
      return a.espacio.nombre.localeCompare(b.espacio.nombre, 'es', { numeric: true });
    });
    return list;
  }, [board.data, spaces]);

  // Avisos: lo que cambió desde el sondeo anterior. La primera carga solo marca lo visto.
  const seen = useRef<Set<string> | null>(null);
  const [alerts, setAlerts] = useState<WaiterAlert[]>([]);
  const [notifyPermission, setNotifyPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  useEffect(() => {
    if (!board.data || role !== 'mesero') return;
    const current = board.data.tables;
    if (seen.current) {
      const fresh = newAlerts(current, seen.current);
      if (fresh.length) {
        setAlerts((shown) => [...fresh, ...shown].slice(0, 4));
        playAlert();
        fresh.forEach((alert) => systemNotify(alert.title, alert.body));
      }
    }
    seen.current = alertKeys(current);
    // Se va el aviso de lo que ya se entregó o atendió.
    setAlerts((shown) => shown.filter((alert) => seen.current!.has(alert.key)));
  }, [board.data, role]);
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAlertSound);
    return () => window.removeEventListener('pointerdown', unlockAlertSound);
  }, []);

  const latestDelivering = delivering
    ? tables.flatMap((table) => table.pedidos).find((order) => order.id === delivering.id) ?? delivering
    : null;
  const open = tables.find((table) => table.espacio.id === openId) ?? null;
  const calling = tables.filter((table) => stateOf(table) === 'call').length;
  const ready = tables.reduce((sum, table) => sum + table.pedidos.filter((order) => order.estado === 'listo').length, 0);
  const active = tables.filter((table) => stateOf(table, spaces.get(table.espacio.id)) === 'active').length;
  const nueva = variant === 'nueva';
  const shownTables = nueva && onlyPending
    ? tables.filter((table) => {
      const state = stateOf(table, spaces.get(table.espacio.id));
      return state === 'call' || state === 'ready';
    })
    : tables;

  const tileCaption = (table: BoardTable, state: TableState, space?: SpaceAvailability) => {
    const readyOrders = table.pedidos.filter((order) => order.estado === 'listo');
    if (state === 'call' && table.llamada) {
      return `${table.llamada.estado === 'en_camino' ? `Va ${table.llamada.tomada_por?.nombre ?? 'alguien'}` : 'Llamando'} · ${since(table.llamada.creado_en, now)}`;
    }
    if (state === 'ready') return `#${readyOrders.map((order) => order.folio).join(', #')} listo`;
    if (state === 'active') {
      return table.pedidos.length
        ? `${table.pedidos.length} ${table.pedidos.length === 1 ? 'pedido' : 'pedidos'}`
        : space ? spaceStatusLine(space) : 'Ocupada';
    }
    return space ? spaceStatusLine(space) : 'Libre';
  };

  const alertsBlock = (
    <>
      {role === 'mesero' && notifyPermission === 'default' && (
        <button
          type="button"
          className="waiter-alerts__enable"
          onClick={() => {
            unlockAlertSound();
            void Notification.requestPermission().then(setNotifyPermission);
          }}
        >
          <Bell aria-hidden="true" className="size-4" /> Activar avisos de pedidos listos
        </button>
      )}
      {alerts.length > 0 && (
        <div className="waiter-alerts" role="alert">
          {alerts.map((alert) => (
            <button
              key={alert.key}
              type="button"
              className={`waiter-alert waiter-alert--${alert.kind}`}
              onClick={() => {
                setOpenId(alert.spaceId);
                setAlerts((shown) => shown.filter((item) => item.key !== alert.key));
              }}
            >
              {alert.kind === 'ready' ? <CheckCircle2 aria-hidden="true" /> : <Bell aria-hidden="true" />}
              <span>
                <strong>{alert.title}</strong>
                <small title={alert.body}>{alert.body}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const summary = nueva ? (
    <>
      <header className="staff-board-head">
        <div>
          <p className="staff-eyebrow">
            {role === 'mesero' ? 'Mesero' : 'Caja'}{businessName ? ` · ${businessName}` : ''}
          </p>
          <h2 id="mesero-board-title" className="staff-title">Mesas</h2>
        </div>
        <span className={`staff-live ${board.isError ? 'staff-live--off' : ''}`} role="status">
          <span /> {board.isError ? 'Sin conexión' : 'En vivo'}
        </span>
      </header>
      <dl className="staff-stats" role="status">
        <div className={calling ? 'staff-stat staff-stat--call' : 'staff-stat'}>
          <dd>{calling}</dd>
          <dt>llamando</dt>
        </div>
        <div className={ready ? 'staff-stat staff-stat--ready' : 'staff-stat'}>
          <dd>{ready}</dd>
          <dt>{ready === 1 ? 'listo' : 'listos'}</dt>
        </div>
        <div className="staff-stat">
          <dd>{active}</dd>
          <dt>activas</dt>
        </div>
      </dl>
      <div className="staff-segment" role="radiogroup" aria-label="Qué mesas ver" data-value={onlyPending ? 'pending' : 'all'}>
        <span className="staff-segment__indicator" aria-hidden="true" />
        <button type="button" role="radio" aria-checked={!onlyPending} onClick={() => setOnlyPending(false)}>Todas</button>
        <button type="button" role="radio" aria-checked={onlyPending} onClick={() => setOnlyPending(true)}>Por atender</button>
      </div>
    </>
  ) : (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Servicio en mesa</p>
          <h2 id="mesero-board-title">Mesas</h2>
        </div>
        <span className={`live-indicator ${!board.isError ? 'live-indicator--online' : ''}`} role="status">
          <span /> {board.isError ? 'Sin conexión' : 'En vivo'}
        </span>
      </div>

      <dl className="mesero-summary" role="status">
        <div className={calling ? 'mesero-summary__item--call' : 'mesero-summary__item'}>
          <dt>Llamando</dt>
          <dd>{calling}</dd>
        </div>
        <div className={ready ? 'mesero-summary__item--ready' : 'mesero-summary__item'}>
          <dt>{ready === 1 ? 'Listo' : 'Listos'}</dt>
          <dd>{ready}</dd>
        </div>
        <div className="mesero-summary__item">
          <dt>Activas</dt>
          <dd>{active}</dd>
        </div>
      </dl>
    </>
  );

  return (
    <section className={nueva ? 'mesero-board staff-board' : 'mesero-board'} aria-labelledby="mesero-board-title">
      {summary}
      {alertsBlock}

      {board.data && !board.data.callsEnabled && (
        <Feedback tone="info">
          Las llamadas de mesa todavía no están activas en el servidor. Ya ves los pedidos listos y puedes entregarlos.
        </Feedback>
      )}
      {board.isError && <Feedback tone="error">{errorMessage(board.error)}</Feedback>}
      {notice && <Feedback tone={notice.tone}>{notice.text}</Feedback>}

      {board.isPending ? (
        <div className={nueva ? 'staff-tiles' : 'mesero-grid'} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={nueva ? 'staff-tile staff-tile--skeleton' : 'mesero-tile mesero-tile--skeleton'} />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<Table2 aria-hidden="true" />}
          title="Sin mesas"
          description="El establecimiento todavía no tiene espacios configurados en Administración."
        />
      ) : nueva ? (
        shownTables.length === 0 ? (
          <p className="staff-empty">Nadie está llamando y no hay pedidos listos.</p>
        ) : (
          <div className="staff-tiles">
            {shownTables.map((table, index) => {
              const space = spaces.get(table.espacio.id);
              const state = stateOf(table, space);
              const { number, kind } = splitSpaceName(table.espacio.nombre);
              return (
                <button
                  key={table.espacio.id}
                  type="button"
                  className={`staff-tile staff-tile--${state}`}
                  style={{ ['--i' as string]: index }}
                  onClick={() => setOpenId(table.espacio.id)}
                  aria-label={`${table.espacio.nombre}. ${
                    state === 'call' ? 'Llamando' : state === 'ready' ? 'Pedido listo' : state === 'active' ? 'Con pedidos' : 'Libre'
                  }`}
                >
                  <span className="staff-tile__name">
                    {number && <strong>{number}</strong>}
                    <span title={table.espacio.nombre}>{kind || table.espacio.nombre}</span>
                  </span>
                  <small key={tileCaption(table, state, space)}>{tileCaption(table, state, space)}</small>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="mesero-grid">
          {tables.map((table) => {
            const space = spaces.get(table.espacio.id);
            const state = stateOf(table, space);
            const readyOrders = table.pedidos.filter((order) => order.estado === 'listo');
            return (
              <button
                key={table.espacio.id}
                type="button"
                className={`mesero-tile mesero-tile--${state}`}
                onClick={() => setOpenId(table.espacio.id)}
                aria-label={`${table.espacio.nombre}. ${
                  state === 'call' ? 'Llamando' : state === 'ready' ? 'Pedido listo' : state === 'active' ? 'Con pedidos' : 'Libre'
                }`}
              >
                <strong>{table.espacio.nombre}</strong>
                {state === 'call' && table.llamada ? (
                  <small>
                    {table.llamada.estado === 'en_camino' ? `Va ${table.llamada.tomada_por?.nombre ?? 'alguien'}` : 'Llamando'} · {since(table.llamada.creado_en, now)}
                  </small>
                ) : state === 'ready' ? (
                  <small>#{readyOrders.map((order) => order.folio).join(', #')} listo</small>
                ) : state === 'active' ? (
                  <small>{table.pedidos.length} {table.pedidos.length === 1 ? 'pedido' : 'pedidos'}</small>
                ) : space ? (
                  <small key={spaceStatusLine(space)}>{spaceStatusLine(space)}</small>
                ) : (
                  <small>Libre</small>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(open)}
        onOpenChange={(next) => { if (!next) setOpenId(null); }}
        title={open?.espacio.nombre ?? 'Mesa'}
        description={open ? (open.pedidos.length ? `${open.pedidos.length} ${open.pedidos.length === 1 ? 'pedido' : 'pedidos'} en curso` : 'Sin pedidos en curso') : undefined}
      >
        {open && (
          <div className="mesero-sheet">
            {role === 'mesero' && onAddOrder && (
              <Button
                variant="dark"
                onClick={() => {
                  const spaceId = open.espacio.id;
                  setOpenId(null);
                  onAddOrder(spaceId);
                }}
              >
                Nuevo pedido en esta mesa
              </Button>
            )}
            {open.llamada && (
              <div className={`mesero-call mesero-call--${open.llamada.estado}`}>
                <div>
                  <strong>{CALL_REASON_LABEL[open.llamada.motivo]}</strong>
                  <p>
                    {open.llamada.cliente?.nombre ?? 'Cliente'} · hace {since(open.llamada.creado_en, now)}
                    {open.llamada.tomada_por ? ` · va ${open.llamada.tomada_por.nombre}` : ''}
                  </p>
                </div>
                {open.llamada.estado === 'pendiente' ? (
                  <Button loading={transition.isPending} onClick={() => transition.mutate({ call: open.llamada!, target: 'en_camino' })}>
                    <Bell aria-hidden="true" className="size-5" /> Voy
                  </Button>
                ) : (
                  <Button loading={transition.isPending} onClick={() => transition.mutate({ call: open.llamada!, target: 'atendida' })}>
                    <CheckCircle2 aria-hidden="true" className="size-5" /> Atendida
                  </Button>
                )}
              </div>
            )}
            {open.pedidos.length > 0 && (<ul className="mesero-orders">
              {open.pedidos.map((order) => (
                <li key={order.id}>
                  <div>
                    <strong>#{order.folio} · {order.cliente?.nombre ?? 'Cliente'}</strong>
                    <p>{order.items_resumen}</p>
                  </div>
                  {order.estado === 'listo' && canDeliver ? (
                    deliveryRequiresQr(order) ? (
                      <Button variant="dark" onClick={() => { deliverMutation.reset(); setDelivering(order); setQrToken(''); }}>
                        <ScanLine aria-hidden="true" className="size-5" /> Entregar
                      </Button>
                    ) : (
                      <Button
                        variant="dark"
                        loading={deliverMutation.isPending && deliverMutation.variables?.order.id === order.id}
                        disabled={deliverMutation.isPending}
                        onClick={() => deliverMutation.mutate({ order, qr: '' })}
                      >
                        <CheckCircle2 aria-hidden="true" className="size-5" /> Entregar
                      </Button>
                    )
                  ) : (
                    <OrderStatusBadge status={order.estado} pagoPendiente={order.pago_pendiente} />
                  )}
                </li>
              ))}
            </ul>)}
            <SpaceAccountPanel
              token={token}
              spaceId={open.espacio.id}
              availability={spaces.get(open.espacio.id)}
              businessName={businessName}
              canConfirmRefunds={role === 'cajero'}
              onReleased={() => setOpenId(null)}
            />
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(delivering)}
        onOpenChange={(next) => { if (!next) { setDelivering(null); setQrToken(''); } }}
        title={delivering ? `Entregar pedido ${delivering.folio}` : 'Entregar pedido'}
        description={delivering && deliveryRequiresQr(delivering)
          ? 'Escanea el QR del cliente. El sistema verificará que corresponda exactamente a este pedido.'
          : 'Confirma que el pedido corresponde al cliente antes de entregarlo.'}
      >
        {delivering && (
          <div className="transaction-form">
            {deliverMutation.isError && <Feedback tone="error">{errorMessage(deliverMutation.error)}</Feedback>}
            {deliveryRequiresQr(delivering) && (
              <QrTokenField
                value={qrToken}
                onChange={setQrToken}
                error={!qrToken.trim() && deliverMutation.isError ? 'Captura el token de entrega.' : undefined}
              />
            )}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => { setDelivering(null); setQrToken(''); }}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="dark"
                loading={deliverMutation.isPending}
                disabled={deliveryRequiresQr(delivering) && !qrToken.trim()}
                onClick={() => latestDelivering && deliverMutation.mutate({ order: latestDelivering, qr: qrToken.trim() })}
              >
                Confirmar entrega
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
