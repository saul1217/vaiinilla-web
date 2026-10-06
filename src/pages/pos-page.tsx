import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  Radio,
  ReceiptText,
  ScanLine,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { RejectOrderDialog } from '../components/reject-order-dialog';
import { itemRejectionNotice } from '../lib/rejection-notice';
import { TipPicker } from '../components/tip-picker';
import { addMoney, tipAmount, tipExceedsTotal, type TipChoice } from '../lib/tips';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { OrderCard, OrderDetailContent } from '../components/order-card';
import { QrTokenField } from '../components/qr-token-field';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader } from '../components/ui';
import { PendingRefunds } from '../components/pending-refunds';
import { WaiterBoard } from '../components/waiter-board';
import { StaffUiSwitch } from '../components/staff-ui-switch';
import { useStaffUi } from '../lib/staff-ui';
import { useSessions } from '../context/session-context';
import { isHeartbeatRole, useOperationalHeartbeat } from '../hooks/use-operational-heartbeat';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { MONEY_PATTERN, calculateChange, formatMoney, normalizeMoneyInput } from '../lib/money';
import { isCashierCashOrder, isCashierDeliveryOrder } from '../lib/cashier-queue';
import type { OrderDetail } from '../types/api';

const moneySchema = z.object({
  amount: z.string().trim().regex(MONEY_PATTERN, 'Escribe un monto, por ejemplo 500 o 500.50.').transform(normalizeMoneyInput),
});

type MoneyForm = z.infer<typeof moneySchema>;

export function PosPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const isCashier = role === 'cajero';
  const isOperationalWorker = isHeartbeatRole(role);
  const canOperateSession = role === 'admin' || isCashier;
  // Mesero y Caja tienen la presentación de las apps (oscura) y pueden volver a la anterior.
  const staffRole = role === 'mesero' || isCashier;
  const [ui, setUi] = useStaffUi(staffRole);
  const nueva = staffRole && ui === 'nueva';
  const businessName = tenant?.access.establecimiento.nombre;
  const queryClient = useQueryClient();
  const [cashOrder, setCashOrder] = useState<OrderDetail | null>(null);
  // Un solo aviso a la vez, que se va solo: los avisos no se acumulan en la página.
  const [notice, setNotice] = useState<ReactNode>(null);
  // Monto final capturado, esperando que Caja confirme el cierre.
  const [closingAmount, setClosingAmount] = useState<string | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<OrderDetail | null>(null);
  const [qrToken, setQrToken] = useState('');
  // Caja quita un artículo que no se puede entregar; si ya se pagó, se devuelve esa parte.
  const [removingFrom, setRemovingFrom] = useState<OrderDetail | null>(null);

  const session = useQuery({
    queryKey: ['cash-session', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.activeCashSession(token),
    refetchInterval: 15_000,
  });

  const heartbeat = useOperationalHeartbeat({ token, scopeId, role });
  // Igual que el tablero del mesero: en un espacio el negocio puede dispensar el QR.
  // Para llevar siempre lo exige (regla del backend).
  const deliveryQr = useQuery({
    queryKey: ['operational-status', 'delivery-qr'],
    enabled: Boolean(token),
    queryFn: () => api.operationalStatus(token),
    staleTime: 60_000,
  });
  const deliveryNeedsQr = (order: OrderDetail) =>
    order.destino === 'para_llevar' || deliveryQr.data?.entrega_requiere_qr !== false;

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
    onSuccess: async (_session, { amount }) => {
      closeMutation.reset();
      setNotice(<>Caja abierta con fondo de <strong>{formatMoney(amount)}</strong>.</>);
      await refreshOperation();
    },
  });
  const closeMutation = useMutation({
    mutationFn: ({ amount }: MoneyForm) => {
      if (!session.data) throw new Error('No existe una sesión abierta.');
      return api.closeCashSession(token, session.data.id, amount);
    },
    onSuccess: async (_session, { amount }) => {
      openMutation.reset();
      setClosingAmount(null);
      closeForm.reset({ amount: '' });
      setNotice(<>Caja cerrada con <strong>{formatMoney(amount)}</strong> en efectivo.</>);
      await refreshOperation();
    },
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const collectMutation = useMutation({
    mutationFn: ({ order, amount, propina }: { order: OrderDetail; amount: string; propina: string }) =>
      api.collectCash(token, order.id, amount, order.version, propina),
    onSuccess: async (result) => {
      setNotice(<>Cobro registrado. Cambio para el cliente: <strong>{formatMoney(result.cambio)}</strong>.</>);
      setCashOrder(null);
      cashForm.reset({ amount: '' });
      await refreshOperation();
    },
  });
  const deliveryMutation = useMutation({
    mutationFn: ({ order, pickupToken }: { order: OrderDetail; pickupToken: string }) =>
      api.deliverOrder(token, order.id, order.version, pickupToken),
    onSuccess: async (order) => {
      setNotice(`Pedido ${order.folio} entregado correctamente.`);
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
  const cashAmountField = cashForm.register('amount');
  const [tip, setTip] = useState<TipChoice>({ kind: 'none' });
  const tipValue = cashOrder ? tipAmount(cashOrder.total, tip) : '0.00';
  // La propina no puede ser mayor a lo que se cobra (misma regla del servidor).
  const tipTooBig = cashOrder ? tipExceedsTotal(cashOrder.total, tipValue) : false;
  const tipError = tipTooBig ? 'La propina no puede ser mayor a lo que se cobra.' : null;
  // El efectivo cubre el pedido más la propina; el cambio se calcula después.
  const cashToCollect = cashOrder ? addMoney(cashOrder.total, tipValue) : '0.00';
  const change = cashOrder ? calculateChange(receivedAmount, cashToCollect) : null;
  const active = session.data;
  const queuedOrders = useMemo(
    () => cashierQueue.data?.pages.flatMap((page) => page.orders) ?? [],
    [cashierQueue.data],
  );
  const cashOrders = useMemo(
    () => queuedOrders.filter(isCashierCashOrder),
    [queuedOrders],
  );
  const readyOrders = useMemo(
    () => queuedOrders.filter(isCashierDeliveryOrder),
    [queuedOrders],
  );
  const updateQrToken = useCallback((value: string) => setQrToken(value), []);

  function beginCash(order: OrderDetail) {
    collectMutation.reset();
    setTip({ kind: 'none' });
    setCashOrder(order);
    cashForm.reset({ amount: '' });
  }

  function beginDelivery(order: OrderDetail) {
    deliveryMutation.reset();
    setQrToken('');
    setDeliveryOrder(order);
  }

  return (
    <div className={nueva ? 'page-stack staff-page' : 'page-stack'}>
      {staffRole && (
        <div className="staff-topbar">
          {nueva && isOperationalWorker && (
            <span className={`staff-chip ${heartbeat.isSuccess ? 'staff-chip--on' : ''}`} role="status">
              <span /> {heartbeat.isSuccess ? `${roleLabel(role)} en línea` : `Conectando ${roleLabel(role)}`}
            </span>
          )}
          <StaffUiSwitch mode={ui} onChange={setUi} />
        </div>
      )}
      {!nueva ? (
        <PageHeader
          eyebrow="Operación POS"
          title={pageTitle(role)}
          description={pageDescription(role)}
        />
      ) : isCashier ? (
        <header className="staff-hero">
          <p className="staff-eyebrow">Turno de hoy{businessName ? ` · ${businessName}` : ''}</p>
          <h1 className="staff-title">Caja en control.</h1>
          <p>Cobra, entrega y mantén el menú disponible para todos.</p>
        </header>
      ) : null}

      {!nueva && <OperationalStatusPanel />}

      {session.isError && <Feedback tone="error">{errorMessage(session.error)}</Feedback>}
      {openMutation.isError && <Feedback tone="error">{errorMessage(openMutation.error)}</Feedback>}
      {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
      {notice && (
        <div className="pos-toast" role="status" aria-live="polite">
          <Feedback tone="success">{notice}</Feedback>
        </div>
      )}
      {heartbeat.isError && (
        <Feedback tone="error">
          {roleLabel(role)} perdió su conexión operativa. Revisa internet; intentaremos reconectar automáticamente.
        </Feedback>
      )}

      {isOperationalWorker && !isCashier && !nueva && (
        <section className="operation-card">
          <Radio aria-hidden="true" className="size-7 text-muted" />
          <div>
            <p className="eyebrow">Presencia operativa</p>
            <h2>{heartbeat.isSuccess ? `${roleLabel(role)} en línea` : `Conectando ${roleLabel(role)}`}</h2>
            <p>
              Esta ventana reporta el perfil cada cinco segundos y lo mantiene visible para Administración.
            </p>
          </div>
        </section>
      )}

      {role === 'mesero' && <WaiterBoard token={token} role="mesero" variant={ui} businessName={businessName} />}

      {nueva && isCashier && (
        <section className={`staff-cashbar ${active ? 'staff-cashbar--open' : ''}`} aria-label="Sesión de Caja">
          <div className="staff-cashbar__state">
            <span className="staff-cashbar__dot" aria-hidden="true" />
            <div>
              <strong>{session.isPending ? 'Consultando…' : active ? 'Caja abierta' : 'Caja cerrada'}</strong>
              <small>
                {active
                  ? `Desde ${formatDate(active.abierta_en)} · fondo $${active.monto_inicial}`
                  : 'Abre la caja para recibir pedidos.'}
              </small>
            </div>
          </div>
          {active ? (
            <details className="staff-cashbar__close">
              <summary>
                <span className="staff-cashbar__when-closed">Cerrar caja</span>
                <span className="staff-cashbar__when-open">Cancelar</span>
              </summary>
              <form
                className="operation-form"
                onSubmit={(event) => void closeForm.handleSubmit((data) => setClosingAmount(data.amount))(event)}
              >
                <Field
                  label="Monto final (MXN)"
                  inputMode="decimal"
                  placeholder="0.00"
                  error={closeForm.formState.errors.amount?.message}
                  {...closeForm.register('amount')}
                />
                <Button type="submit" variant="dark">Revisar cierre</Button>
              </form>
            </details>
          ) : (
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
          )}
        </section>
      )}

      {role !== 'mesero' && !nueva && (
      <>
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
            <p>Al cerrar, el sistema expira los pedidos en efectivo que sigan por cobrar y registra el movimiento.</p>
          </div>
          <form
            className="operation-form"
            onSubmit={(event) => void closeForm.handleSubmit((data) => setClosingAmount(data.amount))(event)}
          >
            <Field
              label="Monto final (MXN)"
              inputMode="decimal"
              placeholder="0.00"
              error={closeForm.formState.errors.amount?.message}
              {...closeForm.register('amount')}
            />
            <Button type="submit" variant="dark">Revisar cierre</Button>
          </form>
        </section>
      ) : (
        <section className="operation-card">
          <div>
            <p className="eyebrow">Apertura</p>
            <h2>Abrir sesión de Caja</h2>
            <p>Confirma el fondo inicial. El movimiento quedará registrado en el sistema.</p>
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
      </>
      )}

      {role === 'admin' && (
        <Feedback tone="info">
          Administración controla la sesión y consulta pedidos; por seguridad, los cobros y entregas requieren una cuenta con rol de Caja.
        </Feedback>
      )}

      {isCashier && <PendingRefunds token={token} canConfirm />}

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
                      <>
                        <Button disabled={!active} onClick={() => beginCash(order)}>
                          <CircleDollarSign aria-hidden="true" className="size-5" /> Cobrar
                        </Button>
                        <Button variant="ghost" onClick={() => setRemovingFrom(order)}>
                          <XCircle aria-hidden="true" className="size-5" /> Rechazar o quitar
                        </Button>
                      </>
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
                description="Para llevar y mesa: valida el QR del cliente"
                count={readyOrders.length}
                icon={<ScanLine aria-hidden="true" />}
              >
                {readyOrders.length ? readyOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={
                      <>
                        <Button variant="dark" onClick={() => beginDelivery(order)}>
                          <ScanLine aria-hidden="true" className="size-5" /> Validar QR
                        </Button>
                        <Button variant="ghost" onClick={() => setRemovingFrom(order)}>
                          <XCircle aria-hidden="true" className="size-5" /> Rechazar o quitar
                        </Button>
                      </>
                    }
                  />
                )) : (
                  <EmptyState
                    icon={<ScanLine aria-hidden="true" />}
                    title="Sin entregas pendientes"
                    description="Los pedidos listos, de mesa o para llevar, aparecerán aquí."
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

      {/* Caja también cobra la cuenta de las mesas y renta canchas en mostrador. */}
      {isCashier && <WaiterBoard token={token} role="cajero" variant={ui} businessName={businessName} />}

      {nueva && (
        <details className="staff-details">
          <summary>Estado del local</summary>
          <OperationalStatusPanel />
        </details>
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
              if (tipTooBig) return;
              collectMutation.mutate({ order: cashOrder, amount, propina: tipValue });
            })(event)}
          >
            {collectMutation.isError && <Feedback tone="error">{errorMessage(collectMutation.error)}</Feedback>}
            <OrderDetailContent order={cashOrder} />
            <TipPicker base={cashOrder.total} value={tip} onChange={setTip} error={tipError} />
            <Field
              label="Efectivo recibido (MXN)"
              inputMode="decimal"
              placeholder={cashOrder.total}
              autoFocus
              error={cashForm.formState.errors.amount?.message}
              hint={receivedAmount && change === null ? `Debe ser igual o mayor a ${formatMoney(cashToCollect)}.` : undefined}
              {...cashAmountField}
              onBlur={(event) => {
                void cashAmountField.onBlur(event);
                const normalized = normalizeMoneyInput(event.target.value);
                if (normalized !== event.target.value) {
                  cashForm.setValue('amount', normalized, { shouldValidate: true, shouldDirty: true });
                }
              }}
            />
            <div className={`change-preview ${change !== null ? 'change-preview--ready' : ''}`} aria-live="polite">
              <span>Cambio</span>
              <strong>{change === null ? '—' : formatMoney(change)}</strong>
            </div>
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setCashOrder(null)}>Cancelar</Button>
              <Button type="submit" loading={collectMutation.isPending} disabled={change === null || tipTooBig} aria-disabled={change === null || tipTooBig}>
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
        description="Escanea el código del cliente. El sistema verificará que corresponda exactamente a este pedido."
      >
        {deliveryOrder && (
          <div className="transaction-form">
            {deliveryMutation.isError && <Feedback tone="error">{errorMessage(deliveryMutation.error)}</Feedback>}
            <OrderDetailContent order={deliveryOrder} />
            {deliveryNeedsQr(deliveryOrder) && (
              <QrTokenField
                value={qrToken}
                onChange={updateQrToken}
                error={!qrToken.trim() && deliveryMutation.isError ? 'Captura el token de entrega.' : undefined}
              />
            )}
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => { setDeliveryOrder(null); setQrToken(''); }}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="dark"
                loading={deliveryMutation.isPending}
                disabled={deliveryNeedsQr(deliveryOrder) && !qrToken.trim()}
                onClick={() => deliveryMutation.mutate({ order: deliveryOrder, pickupToken: qrToken.trim() })}
              >
                Confirmar entrega
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <RejectOrderDialog
        token={token}
        order={removingFrom}
        allowWholeOrder={true}
        onClose={() => setRemovingFrom(null)}
        onRejected={async (order, target, result) => {
          setRemovingFrom(null);
          setNotice(target.kind === 'item' ? itemRejectionNotice(order, target.name, result) : null);
          await refreshOperation();
          await queryClient.invalidateQueries({ queryKey: ['pending-refunds'] });
        }}
      />
      <Modal
        open={closingAmount !== null}
        onOpenChange={(open) => { if (!open) setClosingAmount(null); }}
        title="¿Cerrar la caja?"
        description="Los pedidos en efectivo que sigan por cobrar se cancelarán y ya no se recibirán pedidos."
      >
        {closingAmount !== null && active && (
          <div className="close-cash-summary">
            <dl>
              <div><dt>Fondo inicial</dt><dd>{formatMoney(active.monto_inicial)}</dd></div>
              <div><dt>Efectivo al cerrar</dt><dd><strong>{formatMoney(closingAmount)}</strong></dd></div>
            </dl>
            {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
            <div className="close-cash-summary__actions">
              <Button variant="secondary" onClick={() => setClosingAmount(null)}>Volver</Button>
              <Button
                variant="dark"
                loading={closeMutation.isPending}
                onClick={() => closeMutation.mutate({ amount: closingAmount })}
              >
                Cerrar caja
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

function pageTitle(role: string | undefined): string {
  if (role === 'cajero') return 'Caja y entrega de pedidos';
  if (role === 'cocina') return 'Conexión de Cocina';
  if (role === 'mesero') return 'Servicio en mesa';
  return 'Sesión de Caja';
}

function pageDescription(role: string | undefined): string {
  if (role === 'cajero') {
    return 'Cobra efectivo y entrega con QR (mesa o para llevar). Mantén la Caja en línea.';
  }
  if (role === 'cocina') {
    return 'Mantén esta ventana abierta para que el establecimiento detecte Cocina en línea.';
  }
  if (role === 'mesero') {
    return 'Atiende las mesas y entrega con QR los pedidos listos. Mantén esta ventana abierta.';
  }
  return 'Consulta, abre o cierra la sesión operativa del establecimiento.';
}

function roleLabel(role: string | undefined): string {
  return ({ cajero: 'Caja', cocina: 'Cocina', mesero: 'Servicio en mesa' } as Record<string, string>)[role ?? '']
    ?? 'El dispositivo';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
