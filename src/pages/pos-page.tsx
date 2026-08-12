import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  ReceiptText,
  ScanLine,
  WalletCards,
} from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { OrderCard, OrderDetailContent } from '../components/order-card';
import { QrTokenField } from '../components/qr-token-field';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { calculateChange, formatMoney } from '../lib/money';
import type { CashPaymentResult, OrderDetail } from '../types/api';

const moneySchema = z.object({
  amount: z.string().regex(/^\d+\.\d{2}$/, 'Usa pesos con dos decimales, por ejemplo 500.00.'),
});

type MoneyForm = z.infer<typeof moneySchema>;

export function PosPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const isCashier = role === 'cajero';
  const canOperateSession = role === 'admin' || isCashier;
  const queryClient = useQueryClient();
  const [deviceId] = useState(getCashierDeviceId);
  const [cashOrder, setCashOrder] = useState<OrderDetail | null>(null);
  const [cashReceipt, setCashReceipt] = useState<CashPaymentResult | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<OrderDetail | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  const session = useQuery({
    queryKey: ['cash-session', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.activeCashSession(token),
    refetchInterval: 15_000,
  });

  const heartbeat = useQuery({
    queryKey: ['cashier-heartbeat', scopeId, deviceId],
    enabled: Boolean(token) && isCashier,
    queryFn: async () => {
      await api.heartbeat(token, deviceId, 'cajero');
      return true;
    },
    refetchInterval: 5_000,
    retry: 1,
  });

  const cashierQueue = useInfiniteQuery({
    queryKey: ['orders', 'cashier-queue', scopeId],
    initialPageParam: undefined as string | undefined,
    enabled: Boolean(token) && isCashier,
    queryFn: ({ pageParam }) => api.listOrders(token, {
      estado: ['por_cobrar', 'listo'],
      cursor: pageParam,
      limit: 50,
    }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    refetchInterval: 5_000,
  });

  async function refreshOperation() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['cash-session'] }),
      queryClient.invalidateQueries({ queryKey: ['orders'] }),
      queryClient.invalidateQueries({ queryKey: ['operational-status'] }),
    ]);
  }

  const openMutation = useMutation({
    mutationFn: ({ amount }: MoneyForm) => api.openCashSession(token, amount),
    onSuccess: refreshOperation,
  });
  const closeMutation = useMutation({
    mutationFn: ({ amount }: MoneyForm) => {
      if (!session.data) throw new Error('No existe una sesión abierta.');
      return api.closeCashSession(token, session.data.id, amount);
    },
    onSuccess: refreshOperation,
  });
  const collectMutation = useMutation({
    mutationFn: ({ order, amount }: { order: OrderDetail; amount: string }) =>
      api.collectCash(token, order.id, amount, order.version),
    onSuccess: async (result) => {
      setCashReceipt(result);
      setCashOrder(null);
      cashForm.reset({ amount: '' });
      await refreshOperation();
    },
  });
  const deliveryMutation = useMutation({
    mutationFn: ({ order, pickupToken }: { order: OrderDetail; pickupToken: string }) =>
      api.deliverOrder(token, order.id, order.version, pickupToken),
    onSuccess: async (order) => {
      setDeliveryNotice(`Pedido ${order.folio} entregado correctamente.`);
      setDeliveryOrder(null);
      setQrToken('');
      await refreshOperation();
    },
  });

  const openForm = useForm<MoneyForm>({
    resolver: zodResolver(moneySchema),
    defaultValues: { amount: '500.00' },
  });
  const closeForm = useForm<MoneyForm>({
    resolver: zodResolver(moneySchema),
    defaultValues: { amount: '' },
  });
  const cashForm = useForm<MoneyForm>({
    resolver: zodResolver(moneySchema),
    defaultValues: { amount: '' },
  });

  const receivedAmount = cashForm.watch('amount');
  const change = cashOrder ? calculateChange(receivedAmount, cashOrder.total) : null;
  const active = session.data;
  const queuedOrders = useMemo(
    () => cashierQueue.data?.pages.flatMap((page) => page.orders) ?? [],
    [cashierQueue.data],
  );
  const cashOrders = useMemo(
    () => queuedOrders.filter((order) => order.estado === 'por_cobrar'),
    [queuedOrders],
  );
  const readyOrders = useMemo(
    () => queuedOrders.filter(
      (order) => order.estado === 'listo' && order.destino === 'para_llevar',
    ),
    [queuedOrders],
  );
  const updateQrToken = useCallback((value: string) => setQrToken(value), []);

  function beginCash(order: OrderDetail) {
    collectMutation.reset();
    setCashReceipt(null);
    setCashOrder(order);
    cashForm.reset({ amount: '' });
  }

  function beginDelivery(order: OrderDetail) {
    deliveryMutation.reset();
    setDeliveryNotice(null);
    setQrToken('');
    setDeliveryOrder(order);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operación POS"
        title={isCashier ? 'Caja y entrega de pedidos' : 'Sesión de Caja'}
        description={
          isCashier
            ? 'Cobra pedidos en efectivo, entrega pedidos para llevar mediante su QR y mantén la Caja en línea.'
            : 'Consulta, abre o cierra la sesión operativa del establecimiento.'
        }
      />

      <OperationalStatusPanel />

      {session.isError && <Feedback tone="error">{errorMessage(session.error)}</Feedback>}
      {openMutation.isError && <Feedback tone="error">{errorMessage(openMutation.error)}</Feedback>}
      {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
      {openMutation.isSuccess && <Feedback tone="success">La sesión de Caja quedó abierta.</Feedback>}
      {closeMutation.isSuccess && <Feedback tone="success">La sesión de Caja quedó cerrada.</Feedback>}
      {cashReceipt && (
        <Feedback tone="success">
          Cobro registrado. Cambio para el cliente: <strong>{formatMoney(cashReceipt.cambio)}</strong>.
        </Feedback>
      )}
      {deliveryNotice && <Feedback tone="success">{deliveryNotice}</Feedback>}
      {heartbeat.isError && (
        <Feedback tone="error">
          Esta Caja perdió su conexión operativa. Revisa internet; intentaremos reconectar automáticamente.
        </Feedback>
      )}

      <section className={`cash-hero ${active ? 'cash-hero--open' : ''}`}>
        <div className="cash-hero__icon"><WalletCards aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">Estado actual</p>
          <h2>{session.isPending ? 'Consultando…' : active ? 'Caja abierta' : 'Caja cerrada'}</h2>
          <p>
            {active
              ? `Abierta ${formatDate(active.abierta_en)} con $${active.monto_inicial} MXN.`
              : 'El establecimiento no recibe pedidos mientras no exista una sesión abierta.'}
          </p>
        </div>
        <span className={`cash-state ${active ? 'cash-state--open' : ''}`}>
          <span /> {active ? 'Operando' : 'Sin operar'}
        </span>
      </section>

      {active && (
        <section className="stats-grid" aria-label="Datos de la sesión de Caja">
          <article className="stat-card">
            <span className="stat-card__icon"><CalendarDays aria-hidden="true" /></span>
            <div><p>Fecha operativa</p><strong className="text-xl">{active.fecha_operativa}</strong></div>
          </article>
          <article className="stat-card">
            <span className="stat-card__icon"><CircleDollarSign aria-hidden="true" /></span>
            <div><p>Monto inicial</p><strong className="text-xl">${active.monto_inicial}</strong></div>
          </article>
          <article className="stat-card">
            <span className="stat-card__icon"><Clock3 aria-hidden="true" /></span>
            <div><p>Tipo de apertura</p><strong className="text-xl">{active.cierre_automatico ? 'Automática' : 'Manual'}</strong></div>
          </article>
        </section>
      )}

      {!canOperateSession ? (
        <section className="operation-card operation-card--readonly">
          <LockKeyhole aria-hidden="true" className="size-7 text-muted" />
          <div>
            <h2>Acceso de solo consulta</h2>
            <p>Tu rol puede consultar la sesión activa, pero solo Caja o Administración pueden abrirla o cerrarla.</p>
          </div>
        </section>
      ) : active ? (
        <section className="operation-card">
          <div>
            <p className="eyebrow">Cierre manual</p>
            <h2>Cerrar sesión de Caja</h2>
            <p>Al cerrar, el backend expira los pedidos en efectivo que sigan por cobrar y registra el movimiento.</p>
          </div>
          <form
            className="operation-form"
            onSubmit={(event) => void closeForm.handleSubmit((data) => closeMutation.mutate(data))(event)}
          >
            <Field
              label="Monto final (MXN)"
              inputMode="decimal"
              placeholder="725.50"
              error={closeForm.formState.errors.amount?.message}
              {...closeForm.register('amount')}
            />
            <Button type="submit" variant="dark" loading={closeMutation.isPending}>Cerrar Caja</Button>
          </form>
        </section>
      ) : (
        <section className="operation-card">
          <div>
            <p className="eyebrow">Apertura</p>
            <h2>Abrir sesión de Caja</h2>
            <p>Confirma el fondo inicial. La operación será idempotente y quedará registrada por el backend.</p>
          </div>
          <form
            className="operation-form"
            onSubmit={(event) => void openForm.handleSubmit((data) => openMutation.mutate(data))(event)}
          >
            <Field
              label="Monto inicial (MXN)"
              inputMode="decimal"
              placeholder="500.00"
              error={openForm.formState.errors.amount?.message}
              {...openForm.register('amount')}
            />
            <Button type="submit" loading={openMutation.isPending}>Abrir Caja</Button>
          </form>
        </section>
      )}

      {role === 'admin' && (
        <Feedback tone="info">
          Administración controla la sesión y consulta pedidos; por seguridad, los cobros y entregas requieren una cuenta con rol de Caja.
        </Feedback>
      )}

      {isCashier && (
        <section className="pos-orders" aria-labelledby="cashier-orders-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Atención en Caja</p>
              <h2 id="cashier-orders-title">Pedidos pendientes</h2>
            </div>
            <span className={`live-indicator ${heartbeat.isSuccess ? 'live-indicator--online' : ''}`}>
              <span /> {heartbeat.isSuccess ? 'Caja en línea' : 'Conectando'}
            </span>
          </div>

          {cashierQueue.isError && (
            <Feedback tone="error">No se pudo actualizar la fila de pedidos. {errorMessage(cashierQueue.error)}</Feedback>
          )}

          {cashierQueue.isPending ? (
            <div className="orders-loading" role="status">Actualizando la fila de Caja…</div>
          ) : (
            <div className="pos-queue-grid">
              <QueueColumn
                title="Por cobrar"
                description="Pedidos en efectivo pendientes"
                count={cashOrders.length}
                icon={<ReceiptText aria-hidden="true" />}
              >
                {cashOrders.length ? cashOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={
                      <Button disabled={!active} onClick={() => beginCash(order)}>
                        <CircleDollarSign aria-hidden="true" className="size-5" /> Cobrar
                      </Button>
                    }
                  />
                )) : (
                  <EmptyState
                    icon={<ReceiptText aria-hidden="true" />}
                    title="Sin cobros pendientes"
                    description="Los pedidos en efectivo nuevos aparecerán aquí automáticamente."
                  />
                )}
                {!active && cashOrders.length > 0 && (
                  <Feedback tone="info">Abre la sesión de Caja para registrar cobros.</Feedback>
                )}
              </QueueColumn>

              <QueueColumn
                title="Listos para entregar"
                description="Pedidos para llevar con QR"
                count={readyOrders.length}
                icon={<ScanLine aria-hidden="true" />}
              >
                {readyOrders.length ? readyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={
                      <Button variant="dark" onClick={() => beginDelivery(order)}>
                        <ScanLine aria-hidden="true" className="size-5" /> Validar QR
                      </Button>
                    }
                  />
                )) : (
                  <EmptyState
                    icon={<ScanLine aria-hidden="true" />}
                    title="Sin entregas pendientes"
                    description="Los pedidos para llevar aparecerán al quedar listos."
                  />
                )}
              </QueueColumn>
            </div>
          )}
          {cashierQueue.hasNextPage && (
            <div className="orders-footer">
              <Button
                variant="secondary"
                loading={cashierQueue.isFetchingNextPage}
                onClick={() => void cashierQueue.fetchNextPage()}
              >
                Cargar más pedidos pendientes
              </Button>
            </div>
          )}
        </section>
      )}

      <Modal
        open={Boolean(cashOrder)}
        onOpenChange={(open) => { if (!open) setCashOrder(null); }}
        title={cashOrder ? `Cobrar pedido ${cashOrder.folio}` : 'Cobrar pedido'}
        description="Confirma el efectivo recibido antes de registrar el cobro."
      >
        {cashOrder && (
          <form
            className="transaction-form"
            onSubmit={(event) => void cashForm.handleSubmit(({ amount }) => {
              collectMutation.mutate({ order: cashOrder, amount });
            })(event)}
          >
            {collectMutation.isError && <Feedback tone="error">{errorMessage(collectMutation.error)}</Feedback>}
            <OrderDetailContent order={cashOrder} />
            <Field
              label="Efectivo recibido (MXN)"
              inputMode="decimal"
              placeholder={cashOrder.total}
              autoFocus
              error={cashForm.formState.errors.amount?.message}
              hint={receivedAmount && change === null ? `Debe ser igual o mayor a ${formatMoney(cashOrder.total)}.` : undefined}
              {...cashForm.register('amount')}
            />
            <div className={`change-preview ${change !== null ? 'change-preview--ready' : ''}`} aria-live="polite">
              <span>Cambio</span>
              <strong>{change === null ? '—' : formatMoney(change)}</strong>
            </div>
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setCashOrder(null)}>Cancelar</Button>
              <Button type="submit" loading={collectMutation.isPending} disabled={change === null}>
                Confirmar cobro
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(deliveryOrder)}
        onOpenChange={(open) => { if (!open) { setDeliveryOrder(null); setQrToken(''); } }}
        title={deliveryOrder ? `Entregar pedido ${deliveryOrder.folio}` : 'Entregar pedido'}
        description="Escanea el código del cliente. El backend verificará que corresponda exactamente a este pedido."
      >
        {deliveryOrder && (
          <div className="transaction-form">
            {deliveryMutation.isError && <Feedback tone="error">{errorMessage(deliveryMutation.error)}</Feedback>}
            <OrderDetailContent order={deliveryOrder} />
            <QrTokenField
              value={qrToken}
              onChange={updateQrToken}
              error={!qrToken.trim() && deliveryMutation.isError ? 'Captura el token de entrega.' : undefined}
            />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => { setDeliveryOrder(null); setQrToken(''); }}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="dark"
                loading={deliveryMutation.isPending}
                disabled={!qrToken.trim()}
                onClick={() => deliveryMutation.mutate({ order: deliveryOrder, pickupToken: qrToken.trim() })}
              >
                Confirmar entrega
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function QueueColumn({
  title,
  description,
  count,
  icon,
  children,
}: {
  title: string;
  description: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="queue-column">
      <header className="queue-column__header">
        <span className="queue-column__icon">{icon}</span>
        <div><h3>{title}</h3><p>{description}</p></div>
        <strong aria-label={`${count} pedidos`}>{count}</strong>
      </header>
      <div className="queue-column__list">{children}</div>
    </section>
  );
}

function getCashierDeviceId(): string {
  const storageKey = 'vaiinilla-cashier-device';
  try {
    const current = window.sessionStorage.getItem(storageKey);
    if (current) return current;
    const next = `web-caja-${window.crypto.randomUUID()}`;
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `web-caja-${window.crypto.randomUUID()}`;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
