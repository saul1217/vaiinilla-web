import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Flame, TimerReset } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { OrderCard } from '../components/order-card';
import { Button, EmptyState, Feedback, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { useOperationalHeartbeat } from '../hooks/use-operational-heartbeat';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { OrderDetail, OrderStatus } from '../types/api';

type KitchenTargetStatus = Extract<OrderStatus, 'preparando' | 'listo'>;

export function KitchenPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const heartbeat = useOperationalHeartbeat({ token, scopeId, role });

  const orders = useInfiniteQuery({
    queryKey: ['orders', 'kitchen', scopeId],
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
    onSuccess: (order) => {
      setNotice(
        order.estado === 'preparando'
          ? `Pedido ${order.folio} enviado a preparación.`
          : `Pedido ${order.folio} marcado como listo.`,
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'kitchen', scopeId] });
    },
  });

  const allOrders = useMemo(
    () => orders.data?.pages.flatMap((page) => page.orders) ?? [],
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

  const changingOrderId = transition.isPending ? transition.variables?.order.id : null;

  return (
    <div className="page-stack kitchen-page">
      <PageHeader
        eyebrow="Operación de Cocina"
        title="Tablero de preparación"
        description="Recibe comandas cobradas, prepara únicamente los productos de Cocina y avisa cuando estén listos."
      />

      <OperationalStatusPanel />

      <section className="kitchen-toolbar" aria-label="Estado del tablero de Cocina">
        <div>
          <p className="eyebrow">Comandas activas</p>
          <h2>{allOrders.length} {allOrders.length === 1 ? 'pedido visible' : 'pedidos visibles'}</h2>
          <p>El tablero se actualiza automáticamente cada cinco segundos.</p>
        </div>
        <span className={`live-indicator ${heartbeat.isSuccess ? 'live-indicator--online' : ''}`}>
          <span /> {heartbeat.isSuccess ? 'Cocina en línea' : 'Conectando Cocina'}
        </span>
      </section>

      {heartbeat.isError && (
        <Feedback tone="error">
          Cocina perdió su conexión operativa. Revisa internet; intentaremos reconectar automáticamente.
        </Feedback>
      )}
      {orders.isError && (
        <Feedback tone="error">
          No se pudieron actualizar las comandas. {errorMessage(orders.error)}
        </Feedback>
      )}
      {transition.isError && (
        <Feedback tone="error">{errorMessage(transition.error)}</Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}

      {orders.isPending ? (
        <div className="orders-loading" role="status">Preparando el tablero de Cocina…</div>
      ) : (
        <section className="kitchen-board-grid" aria-label="Pedidos de Cocina">
          <KitchenColumn
            id="pending"
            title="Pendientes"
            description="Pedidos cobrados por iniciar"
            count={pending.length}
            icon={<TimerReset aria-hidden="true" />}
          >
            {pending.length ? pending.map((order) => (
              <KitchenOrder
                key={order.id}
                order={order}
                busy={changingOrderId === order.id}
                disabled={transition.isPending}
                actionLabel="Comenzar preparación"
                actionIcon={<Flame aria-hidden="true" className="size-5" />}
                onAction={() => transition.mutate({ order, target: 'preparando' })}
              />
            )) : (
              <EmptyState
                icon={<TimerReset aria-hidden="true" />}
                title="Sin pedidos pendientes"
                description="Las comandas aparecerán aquí después de que Caja registre el cobro."
              />
            )}
          </KitchenColumn>

          <KitchenColumn
            id="preparing"
            title="En preparación"
            description="Comandas que se están elaborando"
            count={preparing.length}
            icon={<Flame aria-hidden="true" />}
          >
            {preparing.length ? preparing.map((order) => (
              <KitchenOrder
                key={order.id}
                order={order}
                busy={changingOrderId === order.id}
                disabled={transition.isPending}
                actionLabel="Marcar como listo"
                actionIcon={<CheckCircle2 aria-hidden="true" className="size-5" />}
                onAction={() => transition.mutate({ order, target: 'listo' })}
              />
            )) : (
              <EmptyState
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
              <OrderCard
                key={order.id}
                order={order}
                showKitchenNotes
                actions={<span className="kitchen-ready-label">Esperando entrega</span>}
              />
            )) : (
              <EmptyState
                icon={<CheckCircle2 aria-hidden="true" />}
                title="Sin pedidos listos"
                description="Las comandas terminadas permanecerán aquí hasta que se entreguen."
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

function KitchenOrder({
  order,
  busy,
  disabled,
  actionLabel,
  actionIcon,
  onAction,
}: {
  order: OrderDetail;
  busy: boolean;
  disabled: boolean;
  actionLabel: string;
  actionIcon: ReactNode;
  onAction: () => void;
}) {
  return (
    <OrderCard
      order={order}
      showKitchenNotes
      actions={(
        <Button loading={busy} disabled={disabled} onClick={onAction}>
          {actionIcon} {actionLabel}
        </Button>
      )}
    />
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
    <section className="queue-column" aria-labelledby={`kitchen-${id}`}>
      <header className="queue-column__header">
        <span className="queue-column__icon">{icon}</span>
        <div>
          <h3 id={`kitchen-${id}`}>{title}</h3>
          <p>{description}</p>
        </div>
        <strong aria-label={`${count} pedidos`}>{count}</strong>
      </header>
      <div className="queue-column__list">{children}</div>
    </section>
  );
}
