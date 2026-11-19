import { BellRing, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrderDetail, OrderSpace } from '../types/api';
import {
  barItems,
  barQueue,
  isStaleReady,
  hiddenByLine,
  minutesSinceReady,
  readyNotice,
  stationDone,
} from '../lib/cashier-lines';
import { isCashierCashOrder, isCashierDeliveryOrder } from '../lib/cashier-queue';
import { Chip, ChipRow } from './vai';
import { Button } from './ui';

const itemsText = (items: OrderDetail['items']) =>
  items.map((item) => `${item.cantidad}× ${item.nombre_producto}`).join(' · ');

const customer = (order: OrderDetail) => order.usuario?.nombre?.trim() || 'Mostrador';

/** «Qué fila atiendes»: solo aparece cuando el negocio tiene más de una fila. */
export function CashierLineTabs({ lines, orders, selected, onSelect }: {
  lines: OrderSpace[];
  orders: OrderDetail[];
  selected: number | null;
  onSelect: (lineId: number | null) => void;
}) {
  if (lines.length < 2) return null;
  // El número es lo que nació en esa fila, igual que la columna del tablero. Lo de mesa y para
  // llevar lo ven todas las cajas, así que no se suma a ninguna.
  const count = (lineId: number) => orders.filter((order) => order.espacio?.id === lineId).length;
  const hidden = hiddenByLine(orders, selected);
  return (
    <div className="cashier-lines">
      <ChipRow label="Qué fila atiendes" scroll>
        <Chip selected={selected === null} onClick={() => onSelect(null)}>
          Todas <span className="cashier-lines__count">{orders.length}</span>
        </Chip>
        {lines.map((line) => (
          <Chip key={line.id} selected={selected === line.id} onClick={() => onSelect(line.id)}>
            {line.nombre} <span className="cashier-lines__count">{count(line.id)}</span>
          </Chip>
        ))}
      </ChipRow>
      {hidden > 0 && (
        <p className="cashier-lines__hint">
          {hidden === 1 ? '1 pedido de otra fila no se muestra aquí.' : `${hidden} pedidos de otras filas no se muestran aquí.`}
        </p>
      )}
    </div>
  );
}

function prepMeta(order: OrderDetail, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(order.creado_en).getTime()) / 60_000));
  const waited = minutes === 0 ? 'recién cobrado' : `lleva ${minutes} min`;
  return stationDone(order, 'cocina') ? `${waited} · cocina ya terminó lo suyo` : waited;
}

/** La tira de la barra: lo que Caja prepara y marca listo, sin pasar por cocina. */
export function CashierBarQueue({ orders, now, busyId, onReady }: {
  orders: OrderDetail[];
  now: Date;
  busyId: string | null;
  onReady: (order: OrderDetail) => void;
}) {
  const queue = barQueue(orders);
  return (
    <section className="cashier-bar" aria-labelledby="cashier-bar-title">
      <h3 id="cashier-bar-title">
        La barra prepara <span aria-label={`${queue.length} pedidos`}>{queue.length}</span>
      </h3>
      {queue.length === 0 ? (
        <p>Nada que preparar por ahora.</p>
      ) : (
        <ul>
          {queue.map((order) => (
            <li key={order.id} className="cashier-bar__row">
              <strong className="cashier-bar__folio">#{order.folio}</strong>
              <div className="cashier-bar__body">
                <span className="cashier-bar__customer">{customer(order)}</span>
                <span>{itemsText(barItems(order))}</span>
                <span className="cashier-bar__meta">{prepMeta(order, now)}</span>
              </div>
              <Button
                variant="secondary"
                className="cashier-bar__ready"
                loading={busyId === order.id}
                disabled={busyId !== null}
                onClick={() => onReady(order)}
                aria-label={`Marcar listo el pedido ${order.folio} y avisar al cliente`}
              >
                <Check aria-hidden="true" className="size-5" /> Listo · avisar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Línea de aviso de un pedido listo: cuánto lleva esperando que pase el cliente. */
export function ReadyNotice({ order, now }: { order: OrderDetail; now: Date }) {
  const minutes = minutesSinceReady(order, now);
  const text = readyNotice(minutes);
  if (!text) return null;
  return (
    <span className={`ready-notice${isStaleReady(minutes) ? ' ready-notice--stale' : ''}`}>
      <BellRing aria-hidden="true" className="size-4" /> {text}
    </span>
  );
}

/**
 * Vista para el mostrador de una sola pantalla: una columna por fila, con sus pedidos por
 * cobrar, en preparación y listos. Tocar un pedido lo abre en el ticket, donde están el cobro
 * y la entrega de siempre.
 */
export function CashierLinesBoard({ lines, orders, barPrepares, now, busyId, onPick, onReady }: {
  lines: OrderSpace[];
  orders: OrderDetail[];
  barPrepares: boolean;
  now: Date;
  busyId: string | null;
  onPick: (order: OrderDetail) => void;
  onReady: (order: OrderDetail) => void;
}) {
  const unassigned = orders.filter((order) => order.espacio === null || !lines.some((line) => line.id === order.espacio?.id));
  const columns = [
    ...lines.map((line) => ({ key: String(line.id), title: line.nombre, orders: orders.filter((order) => order.espacio?.id === line.id) })),
    ...(unassigned.length ? [{ key: 'sin-fila', title: 'Mesas y para llevar', orders: unassigned }] : []),
  ];
  return (
    <div className="cashier-board">
      {columns.map((column) => {
        const cash = column.orders.filter(isCashierCashOrder);
        const prep = barPrepares ? barQueue(column.orders) : [];
        const ready = column.orders.filter(isCashierDeliveryOrder);
        return (
          <section key={column.key} className="cashier-board__column" aria-label={column.title}>
            <header className="cashier-board__head">
              <h3>{column.title}</h3>
              <span className="cashier-board__counts" aria-label={`${cash.length} por cobrar, ${prep.length} preparando, ${ready.length} listos`}>
                <span data-tone="cash">{cash.length}</span>
                {barPrepares && <span data-tone="prep">{prep.length}</span>}
                <span data-tone="ready">{ready.length}</span>
              </span>
            </header>
            {cash.length + prep.length + ready.length === 0 && <p className="cashier-board__empty">Sin pedidos.</p>}
            {cash.length > 0 && <BoardGroup title="Por cobrar" tone="cash">
              {cash.map((order) => <BoardRow key={order.id} order={order} detail={itemsText(order.items)} onPick={onPick} />)}
            </BoardGroup>}
            {prep.length > 0 && <BoardGroup title="Preparando" tone="prep">
              {prep.map((order) => (
                <BoardRow key={order.id} order={order} detail={itemsText(barItems(order))}>
                  <Button variant="secondary" className="cashier-bar__ready" loading={busyId === order.id} disabled={busyId !== null} onClick={() => onReady(order)} aria-label={`Marcar listo el pedido ${order.folio} y avisar al cliente`}>
                    Listo
                  </Button>
                </BoardRow>
              ))}
            </BoardGroup>}
            {ready.length > 0 && <BoardGroup title="Listos para recoger" tone="ready">
              {ready.map((order) => (
                <BoardRow key={order.id} order={order} detail={<ReadyNotice order={order} now={now} />} onPick={onPick} />
              ))}
            </BoardGroup>}
          </section>
        );
      })}
    </div>
  );
}

function BoardGroup({ title, tone, children }: { title: string; tone: 'cash' | 'prep' | 'ready'; children: ReactNode }) {
  return (
    <div className="cashier-board__group" data-tone={tone}>
      <p className="cashier-board__group-title">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

/** Sin `onPick` el renglón no se abre en el ticket: lo que se prepara solo se marca listo. */
function BoardRow({ order, detail, onPick, children }: {
  order: OrderDetail;
  detail: ReactNode;
  onPick?: (order: OrderDetail) => void;
  children?: ReactNode;
}) {
  const content = (
    <>
      <strong className="cashier-board__folio">#{order.folio}</strong>
      <span className="cashier-board__text">
        <span className="cashier-board__customer">{customer(order)}</span>
        <span className="cashier-board__detail">{detail}</span>
      </span>
    </>
  );
  return (
    <li className="cashier-board__row">
      {onPick ? (
        <button type="button" className="cashier-board__open" onClick={() => onPick(order)} aria-label={`Abrir el pedido ${order.folio} en el ticket`}>
          {content}
        </button>
      ) : (
        <div className="cashier-board__open">{content}</div>
      )}
      {children}
    </li>
  );
}
