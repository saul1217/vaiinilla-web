// Tablero de Mesero: cada mesa a la vista, más urgente primero (llamando → pedido listo →
// activa → libre). Sondea cada 5 s. Al tocar una mesa se abre su detalle con las acciones
// Voy / Atendida / Entregar. Contrato: docs/mesero-backend.md.
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell, CheckCircle2, ScanLine, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Feedback, Modal } from './ui';
import { OrderStatusBadge } from './status-badge';
import { QrTokenField } from './qr-token-field';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
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

function stateOf(table: BoardTable): TableState {
  if (table.llamada) return 'call';
  if (table.pedidos.some((order) => order.estado === 'listo')) return 'ready';
  if (table.pedidos.length > 0) return 'active';
  return 'free';
}

function since(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function WaiterBoard({ token }: { token: string }) {
  const client = useMemo(() => createWaiterClient(() => Promise.resolve(token)), [token]);
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<number | null>(null);
  const [delivering, setDelivering] = useState<BoardOrder | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  const transition = useMutation({
    mutationFn: ({ call, target }: { call: TableCall; target: 'en_camino' | 'atendida' }) => client.transitionCall(call, target),
    onSuccess: async (_, variables) => {
      setNotice(variables.target === 'en_camino' ? `Vas a ${variables.call.espacio.nombre}.` : `${variables.call.espacio.nombre} atendida.`);
      if (variables.target === 'atendida') setOpenId(null);
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
    onError: (error) => setNotice(errorMessage(error)),
  });

  const deliverMutation = useMutation({
    mutationFn: ({ order, qr }: { order: BoardOrder; qr: string }) => api.deliverOrder(token, order.id, order.version, qr),
    onSuccess: async (updated) => {
      setNotice(`Pedido ${updated.folio} entregado.`);
      setDelivering(null);
      setQrToken('');
      await queryClient.invalidateQueries({ queryKey: ['mesero-board'] });
    },
  });

  const tables = useMemo(() => {
    const list = [...(board.data?.tables ?? [])];
    list.sort((a, b) => {
      const rank = STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)];
      if (rank !== 0) return rank;
      if (a.llamada && b.llamada) return Date.parse(a.llamada.creado_en) - Date.parse(b.llamada.creado_en);
      return a.espacio.nombre.localeCompare(b.espacio.nombre, 'es', { numeric: true });
    });
    return list;
  }, [board.data]);

  const open = tables.find((table) => table.espacio.id === openId) ?? null;
  const calling = tables.filter((table) => stateOf(table) === 'call').length;
  const ready = tables.reduce((sum, table) => sum + table.pedidos.filter((order) => order.estado === 'listo').length, 0);
  const active = tables.filter((table) => table.pedidos.length > 0).length;

  return (
    <section className="mesero-board" aria-labelledby="mesero-board-title">
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

      {board.data && !board.data.callsEnabled && (
        <Feedback tone="info">
          Las llamadas de mesa todavía no están activas en el servidor. Ya ves los pedidos listos y puedes entregarlos.
        </Feedback>
      )}
      {board.isError && <Feedback tone="error">{errorMessage(board.error)}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}

      {board.isPending ? (
        <div className="mesero-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="mesero-tile mesero-tile--skeleton" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<Table2 aria-hidden="true" />}
          title="Sin mesas"
          description="El establecimiento todavía no tiene espacios configurados en Administración."
        />
      ) : (
        <div className="mesero-grid">
          {tables.map((table) => {
            const state = stateOf(table);
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
            <ul className="mesero-orders">
              {open.pedidos.map((order) => (
                <li key={order.id}>
                  <div>
                    <strong>#{order.folio} · {order.cliente?.nombre ?? 'Cliente'}</strong>
                    <p>{order.items_resumen}</p>
                  </div>
                  {order.estado === 'listo' ? (
                    <Button variant="dark" onClick={() => { setDelivering(order); setQrToken(''); }}>
                      <ScanLine aria-hidden="true" className="size-5" /> Entregar
                    </Button>
                  ) : (
                    <OrderStatusBadge status={order.estado} />
                  )}
                </li>
              ))}
              {open.pedidos.length === 0 && <li className="mesero-orders__empty">Sin pedidos en curso.</li>}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(delivering)}
        onOpenChange={(next) => { if (!next) { setDelivering(null); setQrToken(''); } }}
        title={delivering ? `Entregar pedido ${delivering.folio}` : 'Entregar pedido'}
        description="Escanea el QR del cliente. El backend verificará que corresponda exactamente a este pedido."
      >
        {delivering && (
          <div className="transaction-form">
            {deliverMutation.isError && <Feedback tone="error">{errorMessage(deliverMutation.error)}</Feedback>}
            <QrTokenField
              value={qrToken}
              onChange={setQrToken}
              error={!qrToken.trim() && deliverMutation.isError ? 'Captura el token de entrega.' : undefined}
            />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => { setDelivering(null); setQrToken(''); }}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="dark"
                loading={deliverMutation.isPending}
                disabled={!qrToken.trim()}
                onClick={() => deliverMutation.mutate({ order: delivering, qr: qrToken.trim() })}
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
