import { useInfiniteQuery } from '@tanstack/react-query';
import { Eye, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { OrderCard, OrderDetailContent } from '../components/order-card';
import { Button, EmptyState, Feedback, Modal, PageHeader } from '../components/ui';
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
    <div className="page-stack">
      <PageHeader
        eyebrow="Administración"
        title="Pedidos e historial"
        description="Consulta el detalle y el estado real de cada pedido. Cobros y entregas se realizan únicamente desde una cuenta de Caja."
      />

      {orders.isError && (
        <Feedback tone="error">No se pudieron consultar los pedidos. {errorMessage(orders.error)}</Feedback>
      )}

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

      <section className="orders-section" aria-label="Pedidos">
        {orders.isPending ? (
          <div className="orders-loading" role="status">Consultando pedidos…</div>
        ) : rows.length ? (
          <>
            <div className="order-grid">
              {rows.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  actions={
                    <Button variant="secondary" onClick={() => setSelected(order)}>
                      <Eye aria-hidden="true" className="size-4" /> Ver detalle
                    </Button>
                  }
                />
              ))}
            </div>
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
        ) : (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title="No hay pedidos en este grupo"
            description="Los pedidos aparecerán aquí en cuanto el backend registre actividad para este establecimiento."
          />
        )}
      </section>

      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        title={selected ? `Pedido ${selected.folio}` : 'Detalle del pedido'}
        description="Información operativa registrada por el backend."
      >
        {selected && <OrderDetailContent order={selected} />}
      </Modal>
    </div>
  );
}
