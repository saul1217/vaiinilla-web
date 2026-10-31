import { AppPageHeader } from '../components/app-page-header';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { AdminOrderRow } from '../components/admin-order-row';
import { AdminOrderDetailSheet } from '../components/admin-order-detail-sheet';
import { Button, EmptyState, Feedback } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { OrderDetail, OrderStatus } from '../types/api';

type OrderFilter = 'todos' | 'activos' | 'finalizados' | 'incidencias';

const filters: Array<{ value: OrderFilter; label: string; states?: OrderStatus[] }> = [
  { value: 'todos', label: 'Todos' },
  {
    value: 'activos',
    label: 'Activos',
    states: ['por_cobrar', 'cobrado', 'preparando', 'listo'],
  },
  { value: 'finalizados', label: 'Entregados', states: ['entregado'] },
  {
    value: 'incidencias',
    label: 'Incidencias',
    states: ['cancelado', 'no_recogido', 'expirado'],
  },
];

export function OrdersPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const fallbackFocusRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<OrderFilter>('activos');
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const selectedFilter = filters.find((item) => item.value === filter);

  const orders = useInfiniteQuery({
    queryKey: ['orders', 'admin', scopeId, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.listOrders(token, {
        estado: selectedFilter?.states,
        cursor: pageParam,
        limit: 20,
      }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: Boolean(token),
    refetchInterval: filter === 'activos' ? 10_000 : false,
  });

  const rows = useMemo(
    () => orders.data?.pages.flatMap((page) => page.orders) ?? [],
    [orders.data],
  );

  return (
    <div className="page-stack admin-screen admin-orders" ref={fallbackFocusRef} tabIndex={-1}>
      <AppPageHeader
        eyebrow="Administración"
        title="Pedidos e historial"
      />

      {orders.isError && (
        <Feedback tone="error">No se pudieron consultar los pedidos. {errorMessage(orders.error)}</Feedback>
      )}

      <p role="status">{orders.isPending ? 'Consultando…' : orders.isError && !rows.length ? 'Consulta no disponible' : `${rows.length}${orders.hasNextPage ? '+' : ''} cargados`}</p>
      <div className="filter-bar" role="group" aria-label="Filtrar pedidos por estado">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`filter-chip ${filter === item.value ? 'filter-chip--active' : ''}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="orders-section" aria-label="Pedidos" aria-busy={orders.isFetching}>
        {orders.isPending ? (
          <div className="orders-loading" role="status">Consultando pedidos…<div className="admin-order-skeleton" aria-hidden="true" /><div className="admin-order-skeleton" aria-hidden="true" /><div className="admin-order-skeleton" aria-hidden="true" /></div>
        ) : rows.length ? (
          <>
            <ul className="admin-order-list" aria-label="Pedidos cargados">
              {rows.map((order) => <AdminOrderRow key={order.id} order={order} onSelect={setSelected} />)}
            </ul>
            {orders.hasNextPage && (
              <div className="orders-footer">
                <Button
                  variant="secondary"
                  loading={orders.isFetchingNextPage}
                  onClick={() => void orders.fetchNextPage()}
                >
                  Cargar más pedidos
                </Button>
              </div>
            )}
          </>
        ) : !orders.isError ? (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title="No hay pedidos en este grupo"
            description="Los pedidos aparecerán aquí en cuanto se registre actividad para este establecimiento."
          />
        ) : null}
      </section>

      <AdminOrderDetailSheet order={selected} onClose={() => setSelected(null)} fallbackFocusRef={fallbackFocusRef} />
    </div>
  );
}
