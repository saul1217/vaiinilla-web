import { AppPageHeader } from '../components/app-page-header';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Flame,
  RefreshCw,
  TimerReset,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KitchenWorkView } from '../components/kitchen-work-view';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { RejectOrderDialog, type RejectTarget } from '../components/reject-order-dialog';
import { itemRejectionNotice } from '../lib/rejection-notice';
import { Button, Feedback } from '../components/ui';
import { useSessions } from '../context/session-context';
import { useStaffTheme } from '../lib/staff-ui';
import { useOperationalHeartbeat } from '../hooks/use-operational-heartbeat';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { kitchenOrderUnits, minutesSince } from '../lib/kitchen';
import type { ItemRejectionResult, OrderDetail, OrderStatus } from '../types/api';

type KitchenTargetStatus = Extract<OrderStatus, 'preparando' | 'listo'>;
type OrderPage = { orders: OrderDetail[]; cursor: string | null };

/** Mínimo que pide el backend para el motivo de un rechazo. */
/** Lo que dura la salida de una tarjeta rechazada (ver .kitchen-ticket--leaving). */
const LEAVE_MS = 560;

export function KitchenPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OrderDetail | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const now = useKitchenClock();
  const heartbeat = useOperationalHeartbeat({ token, scopeId, role });
  useStaffTheme();
  const ordersQueryKey = ['orders', 'kitchen', scopeId] as const;

  const orders = useInfiniteQuery({
    queryKey: ordersQueryKey,
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(token) && role === 'cocina',
    queryFn: ({ pageParam }) => api.listOrders(token, {
      estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'],
      cursor: pageParam,
      limit: 50,
    }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  const transition = useMutation({
    mutationFn: ({ order, target }: { order: OrderDetail; target: KitchenTargetStatus }) =>
      api.transitionOrder(token, order.id, target, order.version),
    onMutate: () => {
      setNotice(null);
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData<InfiniteData<OrderPage, string | undefined>>(
        ordersQueryKey,
        (current) => current ? ({
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            orders: page.orders.map((order) => (
              order.id === updatedOrder.id ? updatedOrder : order
            )),
          })),
        }) : current,
      );
      setNotice(
        updatedOrder.estado === 'preparando'
          ? `Pedido ${updatedOrder.folio} enviado a preparación.`
          : `Pedido ${updatedOrder.folio} marcado como listo.`,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ordersQueryKey });
    },
  });

  // Cocina rechaza lo que no puede preparar (el pedido o un artículo); el cliente ve el motivo.
  async function onRejected(order: OrderDetail, target: RejectTarget, result: ItemRejectionResult | null) {
    setRejecting(null);
    if (target.kind === 'item') {
      setNotice(itemRejectionNotice(order, target.name, result));
      await queryClient.invalidateQueries({ queryKey: ordersQueryKey });
      await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
      return;
    }
    setNotice(`Pedido ${order.folio} rechazado. El cliente verá el motivo.`);
    // La tarjeta se encoge antes de que la lista recargada la quite.
    setLeavingId(order.id);
    await new Promise((resolve) => window.setTimeout(resolve, LEAVE_MS));
    await queryClient.invalidateQueries({ queryKey: ordersQueryKey });
    setLeavingId(null);
  }

  function beginReject(order: OrderDetail) {
    setRejecting(order);
  }

  const rejectButton = (order: OrderDetail) => (
    <Button
      className="kitchen-ticket__button"
      variant="ghost"
      disabled={transition.isPending}
      onClick={() => beginReject(order)}
    >
      <XCircle aria-hidden="true" /> No se puede preparar
    </Button>
  );

  const allOrders = useMemo(
    () => [...(orders.data?.pages.flatMap((page) => page.orders) ?? [])]
      .sort((first, second) => Date.parse(first.creado_en) - Date.parse(second.creado_en)),
    [orders.data],
  );
  const pending = useMemo(
    () => allOrders.filter((order) => order.estado === 'por_cobrar' || order.estado === 'cobrado'),
    [allOrders],
  );
  const preparing = useMemo(
    () => allOrders.filter((order) => order.estado === 'preparando'),
    [allOrders],
  );
  const ready = useMemo(
    () => allOrders.filter((order) => order.estado === 'listo'),
    [allOrders],
  );
  const activeUnits = useMemo(
    () => [...pending, ...preparing].reduce((total, order) => total + kitchenOrderUnits(order), 0),
    [pending, preparing],
  );
  const longestWait = pending.length
    ? Math.max(...pending.map((order) => minutesSince(order.creado_en, now)))
    : null;
  const changingOrderId = transition.isPending ? transition.variables?.order.id : null;
  const isRefreshing = orders.isFetching && !orders.isFetchingNextPage && !orders.isPending;

  return (
    <div className="page-stack kitchen-page staff-page">
      <AppPageHeader eyebrow={`Cocina${tenant ? ` · ${tenant.access.establecimiento.nombre}` : ''}`} title="Cocina" connected={heartbeat.isSuccess} />

      <div className="kitchen-overview__controls">
        <span
          className={`live-indicator ${heartbeat.isSuccess ? 'live-indicator--online' : ''}`}
          role="status"
        >
          <span /> {heartbeat.isSuccess ? 'Cocina en línea' : 'Conectando Cocina'}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="kitchen-refresh"
          disabled={orders.isPending || isRefreshing}
          aria-label="Actualizar comandas ahora"
          aria-busy={isRefreshing}
          onClick={() => void orders.refetch()}
        >
          <RefreshCw aria-hidden="true" className={isRefreshing ? 'kitchen-refresh__icon--active' : ''} />
          {isRefreshing ? 'Actualizando' : 'Actualizar'}
        </Button>
      </div>

      <details className="kitchen-overview">
        <summary id="kitchen-overview-title">Carga actual · {!orders.data ? (orders.isError ? 'Sin datos disponibles' : 'Cargando…') : `${allOrders.length} ${allOrders.length === 1 ? 'comanda activa' : 'comandas activas'}`}</summary>
        <header className="kitchen-overview__header">
          <div>
            <p className="eyebrow">Carga actual</p>
            <h2>
              {orders.data ? allOrders.length : '—'} {allOrders.length === 1 ? 'comanda activa' : 'comandas activas'}
            </h2>
            <p>
              {orders.dataUpdatedAt
                ? `Actualizado ${formatClockTime(orders.dataUpdatedAt)}`
                : 'Conectando con el establecimiento…'}
            </p>
          </div>
        </header>

        <dl className="kitchen-metrics">
          <KitchenMetric
            tone="pending"
            label="Pendientes"
            value={!orders.data ? '—' : String(pending.length)}
            detail="Por comenzar"
            icon={<TimerReset aria-hidden="true" />}
          />
          <KitchenMetric
            tone="preparing"
            label="Preparando"
            value={!orders.data ? '—' : String(preparing.length)}
            detail="En elaboración"
            icon={<Flame aria-hidden="true" />}
          />
          <KitchenMetric
            tone="units"
            label="Piezas activas"
            value={!orders.data ? '—' : String(activeUnits)}
            detail="Pendientes y preparando"
            icon={<UtensilsCrossed aria-hidden="true" />}
          />
          <KitchenMetric
            tone="wait"
            label="Mayor espera"
            value={longestWait === null ? '—' : formatMetricDuration(longestWait)}
            detail="Entre las pendientes"
            icon={<Activity aria-hidden="true" />}
          />
        </dl>
      </details>

      <p className="sr-only" aria-live="polite">
        {pending.length} pendientes, {preparing.length} en preparación y {ready.length} listos.
      </p>

      {heartbeat.isError && (
        <Feedback tone="error">
          Cocina perdió su conexión operativa. Revisa internet; intentaremos reconectar automáticamente.
        </Feedback>
      )}
      {orders.isError && (
        <Feedback tone="error">
          No se pudieron actualizar las comandas. {errorMessage(orders.error)} Usa el botón Actualizar para reintentar.
        </Feedback>
      )}
      {transition.isError && (
        <Feedback tone="error">{errorMessage(transition.error)}</Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}

      {orders.isPending ? (
        <KitchenBoardSkeleton />
      ) : orders.data ? (
        <KitchenWorkView
          pending={pending} preparing={preparing} ready={ready} now={now}
          leavingId={leavingId}
          actions={(order, stage) => stage === 'ready' ? null : <>
            <Button className="kitchen-ticket__button"
              loading={changingOrderId === order.id} disabled={transition.isPending}
              onClick={() => transition.mutate({ order, target: stage === 'pending' ? 'preparando' : 'listo' })}>
              {stage === 'pending' ? <><Flame aria-hidden="true" /> Comenzar preparación</> : <><CheckCircle2 aria-hidden="true" /> Marcar como listo</>}
            </Button>
            {rejectButton(order)}
          </>}
          startAll={<Button className="kitchen-ticket__button" variant="secondary"
            loading={transition.isPending} disabled={transition.isPending}
            onClick={() => pending.forEach((order) => transition.mutate({ order, target: 'preparando' }))}>
            <Flame aria-hidden="true" /> Poner todo en preparación
          </Button>}
        />
      ) : null}

      <details className="kitchen-system-details">
        <summary>
          <span>
            <Activity aria-hidden="true" />
            <span>
              <strong>Estado operativo del establecimiento</strong>
              <small>Consulta Caja, dispositivos y recepción de pedidos.</small>
            </span>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="kitchen-system-details__content">
          <OperationalStatusPanel />
        </div>
      </details>

      <RejectOrderDialog
        token={token}
        order={rejecting}
        allowWholeOrder
        itemFilter={(item) => item.estacion_preparacion === 'cocina'}
        onClose={() => setRejecting(null)}
        onRejected={onRejected}
      />

      {orders.hasNextPage && (
        <div className="orders-footer">
          <Button
            variant="secondary"
            loading={orders.isFetchingNextPage}
            onClick={() => void orders.fetchNextPage()}
          >
            Cargar más comandas
          </Button>
        </div>
      )}
    </div>
  );
}

function KitchenMetric({
  tone,
  label,
  value,
  detail,
  icon,
}: {
  tone: 'pending' | 'preparing' | 'units' | 'wait';
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className={`kitchen-metric kitchen-metric--${tone}`}>
      <span className="kitchen-metric__icon">{icon}</span>
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function KitchenBoardSkeleton() {
  return (
    <div className="kitchen-board-skeleton" role="status">
      <span className="sr-only">Preparando el tablero de Cocina…</span>
      {[0, 1, 2].map((column) => (
        <div key={column}>
          <span className="skeleton-line skeleton-line--wide" />
          <span className="skeleton-line" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line--wide" />
        </div>
      ))}
    </div>
  );
}

function useKitchenClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function formatClockTime(value: number): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatMetricDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}
