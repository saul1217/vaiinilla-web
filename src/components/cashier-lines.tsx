import { Bell, BellRing, Check, ScanLine, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { OrderDetail, OrderSpace } from '../types/api';
import {
  barItems,
  barQueue,
  canMarkNoShow,
  canRemind,
  hideScannerToday,
  scannerHiddenToday,
  isStaleReady,
  hiddenByLine,
  isLineOrder,
  minutesSinceReady,
  readyNotice,
  stationDone,
} from '../lib/cashier-lines';
import { hasOutstandingCashBalance, isCashierCashOrder, isCashierDeliveryOrder } from '../lib/cashier-queue';
import { formatMoney } from '../lib/money';
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

export type BoardStage = 'cash' | 'prep' | 'ready';

const STAGE_LABEL: Record<BoardStage, string> = { cash: 'Por cobrar', prep: 'Preparando', ready: 'Para recoger' };
const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const placeOf = (order: OrderDetail) =>
  order.destino === 'en_espacio' ? order.espacio?.nombre ?? 'En su lugar' : 'Para llevar';

function waitedText(order: OrderDetail, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(order.creado_en).getTime()) / 60_000));
  const waited = minutes === 0 ? 'recién cobrado' : `lleva ${minutes} min`;
  return stationDone(order, 'cocina') ? `${waited} · cocina ya terminó lo suyo` : waited;
}

/** Los tres montones de una caja, en el orden en que se atiende: cobrar, preparar y entregar. */
function stages(orders: OrderDetail[], barPrepares: boolean) {
  return {
    cash: orders.filter(isCashierCashOrder),
    prep: barPrepares ? barQueue(orders) : [],
    ready: orders.filter(isCashierDeliveryOrder),
  };
}

interface BoardActions {
  now: Date;
  barPrepares: boolean;
  busyId: string | null;
  /** El botón principal de cobrar o entregar, el mismo que tiene el ticket. */
  primary: (order: OrderDetail, stage: 'cash' | 'ready', compact?: boolean) => ReactNode;
  onReady: (order: OrderDetail) => void;
  onOpen: (order: OrderDetail) => void;
  /** «Avisar otra vez» y «No vino» de un pedido listo; sin ellos no se muestran. */
  onRemind?: (order: OrderDetail) => void;
  onNoShow?: (order: OrderDetail) => void;
  remindBusyId?: string | null;
}

function RemindButton({ order, busyId, onRemind, compact }: { order: OrderDetail; busyId?: string | null; onRemind: (order: OrderDetail) => void; compact?: boolean }) {
  return (
    <Button
      variant={compact ? 'ghost' : 'secondary'}
      className={compact ? 'cashier-board__icon' : undefined}
      loading={busyId === order.id}
      disabled={busyId === order.id}
      onClick={() => onRemind(order)}
      aria-label={`Avisar otra vez al cliente del pedido ${order.folio}`}
    >
      <Bell aria-hidden="true" className="size-4" />{compact ? null : ' Avisar otra vez'}
    </Button>
  );
}

function NoShowButton({ order, onNoShow }: { order: OrderDetail; onNoShow: (order: OrderDetail) => void }) {
  return (
    <Button variant="ghost" className="cashier-noshow" onClick={() => onNoShow(order)} aria-label={`No vino por el pedido ${order.folio}`}>
      No vino
    </Button>
  );
}

function ReadyButton({ order, busyId, onReady, compact }: { order: OrderDetail; busyId: string | null; onReady: (order: OrderDetail) => void; compact?: boolean }) {
  return (
    <Button
      variant="secondary"
      className="cashier-bar__ready"
      loading={busyId === order.id}
      disabled={busyId !== null}
      onClick={() => onReady(order)}
      aria-label={`Marcar listo el pedido ${order.folio} y avisar al cliente`}
    >
      <Check aria-hidden="true" className="size-5" /> {compact ? 'Listo' : 'Listo · avisar al cliente'}
    </Button>
  );
}

/**
 * La caja como se diseñó en Doop (canvas `hLxU-hxvMS`). Con una fila elegida, o en un negocio de
 * una sola caja, son tres columnas de tarjetas con su botón principal. Con «Todas» y varias filas,
 * una columna por fila con renglones compactos, para el mostrador de una sola pantalla.
 */
export function CashierBoard({ lines, orders, activeLine, ...actions }: BoardActions & {
  lines: OrderSpace[];
  orders: OrderDetail[];
  activeLine: number | null;
}) {
  if (activeLine === null && lines.length >= 2) return <AllLinesBoard lines={lines} orders={orders} {...actions} />;
  return <LineBoard orders={orders} {...actions} />;
}

function LineBoard({ orders, ...actions }: BoardActions & { orders: OrderDetail[] }) {
  const { cash, prep, ready } = stages(orders, actions.barPrepares);
  const columns: { stage: BoardStage; title: string; list: OrderDetail[]; empty: string }[] = [
    { stage: 'cash', title: 'Por cobrar', list: cash, empty: 'Sin cobros pendientes. Lo demás ya está pagado desde la app.' },
    ...(actions.barPrepares ? [{ stage: 'prep' as const, title: 'La barra prepara', list: prep, empty: 'Nada que preparar por ahora.' }] : []),
    { stage: 'ready', title: 'Listos para entregar', list: ready, empty: 'Sin entregas pendientes.' },
  ];
  return (
    <div className="cashier-stages" data-columns={columns.length}>
      {columns.map((column) => (
        <section key={column.stage} className="cashier-stages__column" data-tone={column.stage} aria-label={column.title}>
          <h3 className="cashier-stages__title">
            {column.title} <span aria-label={`${column.list.length} pedidos`}>{column.list.length}</span>
          </h3>
          {column.list.length === 0 ? (
            <p className="cashier-stages__empty">{column.empty}</p>
          ) : (
            <ul>{column.list.map((order) => <li key={order.id}><OrderCard order={order} stage={column.stage} {...actions} /></li>)}</ul>
          )}
        </section>
      ))}
    </div>
  );
}

function OrderCard({ order, stage, now, busyId, primary, onReady, onOpen, onRemind, onNoShow, remindBusyId }: BoardActions & { order: OrderDetail; stage: BoardStage }) {
  const items = stage === 'prep' ? barItems(order) : order.items;
  const owed = hasOutstandingCashBalance(order) ? formatMoney(order.saldo_pendiente ?? order.total) : null;
  const meta = stage === 'prep'
    ? `${placeOf(order)} · ${waitedText(order, now)}`
    : `${placeOf(order)} · ${timeOf(order.creado_en)} · ${owed ?? (stage === 'cash' ? formatMoney(order.total) : 'pagado')}`;
  return (
    <article className="cashier-card" data-tone={stage}>
      <header className="cashier-card__head">
        <strong className="cashier-card__folio">#{order.folio}</strong>
        <span className="cashier-card__pill">{STAGE_LABEL[stage]}</span>
      </header>
      <p className="cashier-card__customer">{customer(order)}</p>
      <p className="cashier-card__items">{itemsText(items)}</p>
      {stage === 'ready' ? (
        <p className="cashier-card__meta"><ReadyNotice order={order} now={now} /> <span>· {placeOf(order)}</span></p>
      ) : (
        <p className="cashier-card__meta">{meta}</p>
      )}
      <div className="cashier-card__actions">
        {stage === 'prep' ? <ReadyButton order={order} busyId={busyId} onReady={onReady} /> : primary(order, stage)}
        {stage === 'ready' && onRemind && canRemind(order) && <RemindButton order={order} busyId={remindBusyId} onRemind={onRemind} />}
        {stage === 'ready' && onNoShow && canMarkNoShow(order) && <NoShowButton order={order} onNoShow={onNoShow} />}
        {stage !== 'prep' && (
          <Button variant="ghost" onClick={() => onOpen(order)} aria-label={`Ver pedido ${order.folio} de ${customer(order)}`}>
            Ver pedido
          </Button>
        )}
      </div>
    </article>
  );
}

function AllLinesBoard({ lines, orders, ...actions }: BoardActions & { lines: OrderSpace[]; orders: OrderDetail[] }) {
  const unassigned = orders.filter((order) => !isLineOrder(order) || !lines.some((line) => line.id === order.espacio?.id));
  const columns = [
    ...lines.map((line) => ({ key: String(line.id), title: line.nombre, orders: orders.filter((order) => order.espacio?.id === line.id) })),
    ...(unassigned.length ? [{ key: 'sin-fila', title: 'Mesas y para llevar', orders: unassigned }] : []),
  ];
  return (
    <div className="cashier-board">
      {columns.map((column) => {
        const { cash, prep, ready } = stages(column.orders, actions.barPrepares);
        return (
          <section key={column.key} className="cashier-board__column" aria-label={column.title}>
            <header className="cashier-board__head">
              <h3>{column.title}</h3>
              <span className="cashier-board__counts" aria-label={`${cash.length} por cobrar, ${prep.length} preparando, ${ready.length} listos`}>
                <span data-tone="cash">{cash.length}</span>
                {actions.barPrepares && <span data-tone="prep">{prep.length}</span>}
                <span data-tone="ready">{ready.length}</span>
              </span>
            </header>
            {cash.length + prep.length + ready.length === 0 && <p className="cashier-board__empty">Sin pedidos.</p>}
            {cash.length > 0 && <BoardGroup title="Por cobrar" tone="cash">
              {cash.map((order) => <BoardRow key={order.id} order={order} detail={itemsText(order.items)} onOpen={actions.onOpen}>{actions.primary(order, 'cash', true)}</BoardRow>)}
            </BoardGroup>}
            {prep.length > 0 && <BoardGroup title="Preparando" tone="prep">
              {prep.map((order) => (
                <BoardRow key={order.id} order={order} detail={`${itemsText(barItems(order))} · ${waitedText(order, actions.now)}`}>
                  <ReadyButton order={order} busyId={actions.busyId} onReady={actions.onReady} compact />
                </BoardRow>
              ))}
            </BoardGroup>}
            {ready.length > 0 && <BoardGroup title="Listos para recoger" tone="ready">
              {ready.map((order) => (
                <BoardRow key={order.id} order={order} detail={<ReadyNotice order={order} now={actions.now} />} onOpen={actions.onOpen}>
                  {actions.onNoShow && canMarkNoShow(order) && isStaleReady(minutesSinceReady(order, actions.now)) && <NoShowButton order={order} onNoShow={actions.onNoShow} />}
                  {actions.onRemind && canRemind(order) && <RemindButton order={order} busyId={actions.remindBusyId} onRemind={actions.onRemind} compact />}
                  {actions.primary(order, 'ready', true)}
                </BoardRow>
              ))}
            </BoardGroup>}
          </section>
        );
      })}
    </div>
  );
}

function BoardGroup({ title, tone, children }: { title: string; tone: BoardStage; children: ReactNode }) {
  return (
    <div className="cashier-board__group" data-tone={tone}>
      <p className="cashier-board__group-title">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

/** El nombre abre el ticket completo; el botón de al lado hace lo principal sin abrirlo. */
function BoardRow({ order, detail, onOpen, children }: {
  order: OrderDetail;
  detail: ReactNode;
  onOpen?: (order: OrderDetail) => void;
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
      {onOpen ? (
        <button type="button" className="cashier-board__open" onClick={() => onOpen(order)} aria-label={`Ver pedido ${order.folio} de ${customer(order)}`}>
          {content}
        </button>
      ) : (
        <div className="cashier-board__open">{content}</div>
      )}
      <span className="cashier-board__action">{children}</span>
    </li>
  );
}

const SCANNER_SHOW_MS = 30_000;

/**
 * Recordatorio de la pistola: el campo del código llega enfocado al tocar Entregar. Se va solo a
 * los 30 segundos, y con la X ya no sale el resto del día en ese equipo.
 */
export function ScannerBar() {
  const [hidden, setHidden] = useState(() => scannerHiddenToday());
  useEffect(() => {
    if (hidden) return;
    const timer = window.setTimeout(() => setHidden(true), SCANNER_SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [hidden]);
  if (hidden) return null;
  return (
    <div className="cashier-scanner" role="note">
      <span className="cashier-scanner__chip"><ScanLine aria-hidden="true" className="size-5" /> Pistola</span>
      <p>
        <strong>Toca Entregar y dispara al QR del cliente.</strong>{' '}
        <span>El código se lee y la entrega se confirma sola; sin pistola, escanea con la cámara o escríbelo.</span>
      </p>
      <button
        type="button"
        className="cashier-scanner__close"
        onClick={() => { hideScannerToday(); setHidden(true); }}
        aria-label="Cerrar el aviso de la pistola por hoy"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
