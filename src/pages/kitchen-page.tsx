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
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KitchenOrderCard } from '../components/kitchen-order-card';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { Button, Feedback, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { useOperationalHeartbeat } from '../hooks/use-operational-heartbeat';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { kitchenOrderUnits, minutesSince } from '../lib/kitchen';
import type { OrderDetail, OrderStatus } from '../types/api';

type KitchenTargetStatus = Extract<OrderStatus, 'preparando' | 'listo'>;
type OrderPage = { orders: OrderDetail[]; cursor: string | null };

export function KitchenPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const now = useKitchenClock();
  const heartbeat = useOperationalHeartbeat({ token, scopeId, role });
  const ordersQueryKey = ['orders', 'kitchen', scopeId] as const;

  const orders = useInfiniteQuery({
    queryKey: ordersQueryKey,
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(token) && role === 'cocina',
    queryFn: ({ pageParam }) => api.listOrders(token, {
      estado: ['cobrado', 'preparando', 'listo'],
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

  const allOrders = useMemo(
    () => [...(orders.data?.pages.flatMap((page) => page.orders) ?? [])]
      .sort((first, second) => Date.parse(first.creado_en) - Date.parse(second.creado_en)),
    [orders.data],
  );
  const pending = useMemo(
    () => allOrders.filter((order) => order.estado === 'cobrado'),
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
    <div className="page-stack kitchen-page">
      <PageHeader
        eyebrow="Operación de Cocina"
        title="Comandas de Cocina"
        description="Lo importante aparece primero: cantidades, opciones, indicaciones, destino y tiempo transcurrido de cada pedido."
      />

      <section className="kitchen-overview" aria-labelledby="kitchen-overview-title">
        <header className="kitchen-overview__header">
          <div>
            <p className="eyebrow">Carga actual</p>
            <h2 id="kitchen-overview-title">
              {allOrders.length} {allOrders.length === 1 ? 'comanda activa' : 'comandas activas'}
            </h2>
            <p>
              {orders.dataUpdatedAt
                ? `Actualizado ${formatClockTime(orders.dataUpdatedAt)}`
                : 'Conectando con el establecimiento…'}
            </p>
          </div>
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
        </header>

        <dl className="kitchen-metrics">
          <KitchenMetric
            tone="pending"
            label="Pendientes"
            value={String(pending.length)}
            detail="Por comenzar"
            icon={<TimerReset aria-hidden="true" />}
          />
          <KitchenMetric
            tone="preparing"
            label="Preparando"
            value={String(preparing.length)}
            detail="En elaboración"
            icon={<Flame aria-hidden="true" />}
          />
          <KitchenMetric
            tone="units"
            label="Piezas activas"
            value={String(activeUnits)}
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
      </section>

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
      ) : (
        <section className="kitchen-board-grid" aria-label="Pedidos de Cocina">
          <KitchenColumn
            id="pending"
            title="Pendientes"
            description="Más antiguos primero"
            count={pending.length}
            icon={<TimerReset aria-hidden="true" />}
          >
            {pending.length ? pending.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                stage="pending"
                now={now}
                action={(
                  <Button
                    className="kitchen-ticket__button"
                    loading={changingOrderId === order.id}
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ order, target: 'preparando' })}
                  >
                    <Flame aria-hidden="true" /> Comenzar preparación
                  </Button>
                )}
              />
            )) : (
              <KitchenEmptyState
                icon={<TimerReset aria-hidden="true" />}
                title="Sin pedidos pendientes"
                description="Las nuevas comandas aparecerán aquí automáticamente después del cobro."
              />
            )}
          </KitchenColumn>

          <KitchenColumn
            id="preparing"
            title="En preparación"
            description="Pedidos que se están elaborando"
            count={preparing.length}
            icon={<Flame aria-hidden="true" />}
          >
            {preparing.length ? preparing.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                stage="preparing"
                now={now}
                action={(
                  <Button
                    className="kitchen-ticket__button"
                    loading={changingOrderId === order.id}
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ order, target: 'listo' })}
                  >
                    <CheckCircle2 aria-hidden="true" /> Marcar como listo
                  </Button>
                )}
              />
            )) : (
              <KitchenEmptyState
                icon={<Flame aria-hidden="true" />}
                title="Nada en preparación"
                description="Inicia una comanda pendiente para moverla a esta columna."
              />
            )}
          </KitchenColumn>

          <KitchenColumn
            id="ready"
            title="Listos"
            description="Esperando entrega o servicio"
            count={ready.length}
            icon={<CheckCircle2 aria-hidden="true" />}
          >
            {ready.length ? ready.map((order) => (
              <KitchenOrderCard key={order.id} order={order} stage="ready" now={now} />
            )) : (
              <KitchenEmptyState
                icon={<CheckCircle2 aria-hidden="true" />}
                title="Sin pedidos listos"
                description="Los pedidos terminados permanecerán aquí hasta que se entreguen."
              />
            )}
          </KitchenColumn>
        </section>
      )}

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

function KitchenColumn({
  id,
  title,
  description,
  count,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`queue-column queue-column--${id}`} aria-labelledby={`kitchen-${id}`}>
      <header className="queue-column__header">
        <span className="queue-column__icon">{icon}</span>
        <div>
          <h2 id={`kitchen-${id}`}>{title}</h2>
          <p>{description}</p>
        </div>
        <strong aria-label={`${count} pedidos`}>{count}</strong>
      </header>
      <div className="queue-column__list">{children}</div>
    </section>
  );
}

function KitchenEmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="kitchen-empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
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
