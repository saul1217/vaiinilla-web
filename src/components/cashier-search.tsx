// «¿Cuál es el tuyo?» (Doop N05): Caja busca un pedido de su fila por folio, nombre,
// matrícula o mesa, y lo abre en el ticket, donde ya están cobrar y entregar.
import { Search } from 'lucide-react';
import { useState } from 'react';
import { AppSheet } from './app-sheet';
import { CompactOrderRow } from './compact-order-row';
import { OrderStatusBadge } from './status-badge';
import { Button } from './ui';
import { Chip, ChipRow } from './vai';
import { CASHIER_SEARCH_FILTERS, cashierOrderSearch, type CashierSearchFilter } from '../lib/cashier-search';
import type { OrderDetail } from '../types/api';

const MAX_RESULTS = 30;

export function CashierSearch({
  open,
  onOpenChange,
  orders,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderDetail[];
  onPick: (order: OrderDetail) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CashierSearchFilter>('todos');
  const results = cashierOrderSearch(orders, query, filter);
  const clean = query.trim();

  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery('');
          setFilter('todos');
        }
      }}
      title="¿Cuál es el tuyo?"
      description="El cliente dice «vengo por el de Diego» y lo encuentras sin bajar por toda la fila."
    >
      <div className="cashier-search">
        <label className="cashier-search__field">
          <Search aria-hidden="true" />
          <span className="sr-only">Folio, nombre, matrícula o mesa</span>
          <input
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Diego, 11, Mesa 4…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ChipRow label="Qué pedidos">
          {CASHIER_SEARCH_FILTERS.map(([value, label]) => (
            <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
              {label}
            </Chip>
          ))}
        </ChipRow>
        <p className="sr-only" role="status">
          {results.length === 1 ? '1 pedido' : `${results.length} pedidos`}
        </p>
        {results.length === 0 ? (
          <p className="cashier-search__empty">
            {clean ? `Ningún pedido de la fila coincide con «${clean}».` : 'No hay pedidos aquí.'}
          </p>
        ) : (
          <ul className="cashier-search__results" aria-label="Pedidos encontrados">
            {results.slice(0, MAX_RESULTS).map((order) => (
              <CompactOrderRow
                key={order.id}
                title={`#${order.folio}`}
                summary={[order.usuario?.nombre, order.usuario?.matricula].filter(Boolean).join(' · ') || undefined}
                meta={order.destino === 'en_espacio' ? (order.espacio?.nombre ?? 'En espacio') : 'Para llevar'}
                status={<OrderStatusBadge status={order.estado} />}
                action={
                  <Button variant="secondary" onClick={() => onPick(order)} aria-label={`Abrir pedido ${order.folio}`}>
                    Abrir
                  </Button>
                }
              />
            ))}
          </ul>
        )}
        {results.length > MAX_RESULTS && (
          <p className="cashier-search__empty">Hay más coincidencias: escribe un poco más para acotar.</p>
        )}
      </div>
    </AppSheet>
  );
}
