import { CashierHome } from '../components/cashier-home';
import { CashierQueue } from '../components/cashier-queue';
import { AppSheet } from '../components/app-sheet';
import { AppPageHeader } from '../components/app-page-header';
import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  ReceiptText,
  ScanLine,
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
import { OrderDetailContent } from '../components/order-card';
import { QrTokenField } from '../components/qr-token-field';
import { StaffOrderForm } from '../components/staff-order-form';
import { Button, Feedback, Field } from '../components/ui';
import { PendingRefunds } from '../components/pending-refunds';
import { WaiterBoard } from '../components/waiter-board';
import { useStaffTheme } from '../lib/staff-ui';
import { useSessions } from '../context/session-context';
import { isHeartbeatRole, useOperationalHeartbeat } from '../hooks/use-operational-heartbeat';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { MONEY_PATTERN, calculateChange, formatMoney, normalizeMoneyInput } from '../lib/money';
import { hasOutstandingCashBalance, isCashierCashOrder, isCashierDeferredDeliveryOrder, isCashierDeliveryOrder, isCashierPaidDeliveryOrder } from '../lib/cashier-queue';
import { deliveryRequiresQr } from '../lib/delivery-policy';
import { printOrderTicket } from '../lib/order-ticket-print';
import type { OrderDetail, StaffOrderResult } from '../types/api';

const moneySchema = z.object({
  amount: z.string().trim().regex(MONEY_PATTERN, 'Escribe un monto, por ejemplo 500 o 500.50.').transform(normalizeMoneyInput),
});

type MoneyForm = z.infer<typeof moneySchema>;

/** Lo que ve quien registró el pedido: el folio y, si Caja cobró, el cambio o el motivo de no cobrar. */
function avisoDeAlta(pedido: StaffOrderResult): ReactNode {
  const cobro = pedido.cobro;
  if (cobro?.estado === 'cobrado') {
    return (
      <>
        Pedido <strong>{pedido.folio}</strong> cobrado. Cambio{' '}
        <strong>{formatMoney(cobro.cambio)}</strong>.
      </>
    );
  }
  if (cobro?.estado === 'pendiente') {
    return (
      <>
        Pedido <strong>{pedido.folio}</strong> registrado sin cobrar. {cobro.mensaje}
      </>
    );
  }
  return <>Pedido <strong>{pedido.folio}</strong> registrado.</>;
}

export function PosPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const role = tenant?.context.rol;
  const isCashier = role === 'cajero';
  const isOperationalWorker = isHeartbeatRole(role);
  const canOperateSession = role === 'admin' || isCashier;
  useStaffTheme();
  const businessName = tenant?.access.establecimiento.nombre;
  const queryClient = useQueryClient();
  const focusClosingSummary = useCallback((node: HTMLDivElement | null) => node?.focus(), []);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [cashOrder, setCashOrder] = useState<OrderDetail | null>(null);
  // Un solo aviso a la vez, que se va solo: los avisos no se acumulan en la página.
  const [notice, setNotice] = useState<ReactNode>(null);
  // Monto final capturado, esperando que Caja confirme el cierre.
  const [closingAmount, setClosingAmount] = useState<string | null>(null);
  const [deliveryOrder, setDeliveryOrder] = useState<OrderDetail | null>(null);
  const [qrToken, setQrToken] = useState('');
  // Caja quita un artículo que no se puede entregar; si ya se pagó, se devuelve esa parte.
  const [removingFrom, setRemovingFrom] = useState<OrderDetail | null>(null);
  // El staff registra pedidos de quien no usa la app (mesero, cajero y admin).
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [staffOrderSpaceId, setStaffOrderSpaceId] = useState<number | undefined>();
  const canCreateStaffOrder = role === 'mesero' || role === 'cajero' || role === 'admin';

  const openStaffOrder = useCallback((spaceId?: number) => {
    setStaffOrderSpaceId(spaceId);
    setNewOrderOpen(true);
  }, []);

  const session = useQuery({
    queryKey: ['cash-session', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.activeCashSession(token),
    refetchInterval: 15_000,
  });

  const heartbeat = useOperationalHeartbeat({ token, scopeId, role });
  // La configuración aplica a entrega para llevar; una sesión activa de mesa no requiere QR.
  const deliveryQr = useQuery({
    queryKey: ['operational-status', 'delivery-qr'],
    enabled: Boolean(token),
    queryFn: () => api.operationalStatus(token),
    staleTime: 60_000,
  });
  const deliveryNeedsQr = (order: OrderDetail) => deliveryRequiresQr(order, deliveryQr.data?.entrega_requiere_qr);

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
      setSessionOpen(false);
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
      setSessionOpen(false);
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
  const cashAmountDue = cashOrder?.saldo_pendiente ?? cashOrder?.total ?? '0.00';
  const tipValue = cashOrder ? tipAmount(cashAmountDue, tip) : '0.00';
  // La propina no puede ser mayor a lo que se cobra (misma regla del servidor).
  const tipTooBig = cashOrder ? tipExceedsTotal(cashAmountDue, tipValue) : false;
  const tipError = tipTooBig ? 'La propina no puede ser mayor a lo que se cobra.' : null;
  // El efectivo cubre el pedido más la propina; el cambio se calcula después.
  const cashToCollect = cashOrder ? addMoney(cashAmountDue, tipValue) : '0.00';
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
    <CashierHome cashier={isCashier}>
      {canCreateStaffOrder && (
        <div className="staff-topbar">
          {isOperationalWorker && (
            <span className={`staff-chip ${heartbeat.isSuccess ? 'staff-chip--on' : ''}`} role="status">
              <span /> {heartbeat.isSuccess ? `${roleLabel(role)} en línea` : `Conectando ${roleLabel(role)}`}
            </span>
          )}
          {canCreateStaffOrder && (
            <Button variant="dark" onClick={() => openStaffOrder()}>
              Nuevo pedido
            </Button>
          )}
        </div>
      )}
      {role === 'admin' ? (
        <AppPageHeader
          eyebrow="Operación POS"
          title={pageTitle(role)}
          description={pageDescription(role)}
        />
      ) : isCashier ? (
        <AppPageHeader eyebrow={`Caja${businessName ? ` · ${businessName}` : ''}`} title="Caja" connected={heartbeat.isSuccess} />
      ) : null}

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

      {role === 'mesero' && (
        <WaiterBoard
          token={token}
          role="mesero"
          businessName={businessName}
          onAddOrder={openStaffOrder}
        />
      )}

      {canOperateSession && (<div className="cashier-home__operation">
      {canOperateSession && (
        <section className={`staff-cashbar ${active ? 'staff-cashbar--open' : ''}`} aria-label="Sesión de Caja">
          <div className="staff-cashbar__state">
            <span className="staff-cashbar__dot" aria-hidden="true" />
            <div>
              <strong>{session.isPending ? 'Consultando…' : session.isError && !active ? 'Sesión no disponible' : active ? 'Caja abierta' : 'Caja cerrada'}</strong>
              <small>
                {active
                  ? `Desde ${formatDate(active.abierta_en)} · fondo $${active.monto_inicial}`
                  : session.isPending ? 'Consultando sesión operativa.' : session.isError ? 'No se pudo consultar la sesión.' : 'Abre la caja para recibir pedidos.'}
              </small>
            </div>
          </div>
          <Button variant="secondary" disabled={session.isPending || (session.isError && !active)} onClick={() => setSessionOpen(true)}>{active ? 'Cerrar caja' : 'Abrir Caja'}</Button>
          <AppSheet open={sessionOpen} onOpenChange={(open) => { setSessionOpen(open); if (!open) setClosingAmount(null); }} title={closingAmount !== null ? '¿Cerrar la caja?' : active ? 'Cerrar caja' : 'Abrir Caja'} description={closingAmount !== null ? 'Los pedidos en efectivo que sigan por cobrar se cancelarán y ya no se recibirán pedidos.' : 'Sesión operativa de Caja'}>
            <div hidden={closingAmount !== null}>
              {openMutation.isError && <Feedback tone="error">{errorMessage(openMutation.error)}</Feedback>}
              {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
              {active ? (<form
                className="operation-form"
                onSubmit={(event) => void closeForm.handleSubmit((data) => setClosingAmount(data.amount))(event)}
              >
                <Field
                  id="close-amount"
                  label="Monto final (MXN)"
                  inputMode="decimal"
                  placeholder="0.00"
                  error={closeForm.formState.errors.amount?.message}
                  {...closeForm.register('amount')}
                />
                <Button type="submit" variant="dark">Revisar cierre</Button>
              </form>) : (<form
              className="operation-form"
              onSubmit={(event) => void openForm.handleSubmit((data) => openMutation.mutate(data))(event)}
            >
              <Field
                id="open-amount"
                label="Monto inicial (MXN)"
                inputMode="decimal"
                placeholder="500.00"
                error={openForm.formState.errors.amount?.message}
                {...openForm.register('amount')}
              />
              <Button type="submit" loading={openMutation.isPending}>Abrir Caja</Button>
            </form>)}
            </div>
            {closingAmount !== null && active && <div className="close-cash-summary" tabIndex={-1} aria-label="Resumen de cierre" ref={focusClosingSummary}>
              <dl><div><dt>Fondo inicial</dt><dd>{formatMoney(active.monto_inicial)}</dd></div><div><dt>Efectivo al cerrar</dt><dd><strong>{formatMoney(closingAmount)}</strong></dd></div></dl>
              {closeMutation.isError && <Feedback tone="error">{errorMessage(closeMutation.error)}</Feedback>}
              <div className="form-actions"><Button variant="secondary" onClick={() => { setClosingAmount(null); requestAnimationFrame(() => closeForm.setFocus('amount')); }}>Volver</Button><Button variant="dark" loading={closeMutation.isPending} onClick={() => closeMutation.mutate({ amount: closingAmount })}>Cerrar caja</Button></div>
            </div>}
          </AppSheet>
        </section>
      )}

      {role === 'admin' && active && (
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

      {role === 'admin' && (
        <Feedback tone="info">
          Administración controla la sesión y consulta pedidos; por seguridad, los cobros y entregas requieren una cuenta con rol de Caja.
        </Feedback>
      )}

      {/* Caja también cobra la cuenta de las mesas y renta canchas en mostrador. */}
      {isCashier && <><Button variant="secondary" onClick={() => setBoardOpen(true)}>Mesas y canchas</Button><WaiterBoard token={token} role="cajero" businessName={businessName} sheetOpen={boardOpen} onSheetOpenChange={setBoardOpen} /></>}

      {isCashier && <PendingRefunds token={token} canConfirm />}
      </div>)}

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

          {cashierQueue.isError && !cashierQueue.data ? null : cashierQueue.isPending ? (
            <div className="orders-loading" role="status">Actualizando la fila de Caja…</div>
          ) : (
            <CashierQueue cashOrders={cashOrders} readyOrders={readyOrders} actions={(order, group) => group === 'cash' ? (<>
                        <Button disabled={!active} onClick={() => beginCash(order)}>
                          <CircleDollarSign aria-hidden="true" className="size-5" /> Cobrar
                        </Button>
                        <Button variant="ghost" onClick={() => setRemovingFrom(order)}>
                          <XCircle aria-hidden="true" className="size-5" /> Quitar artículo
                        </Button>
                      </>) : (<>
                        {hasOutstandingCashBalance(order) ? (
                          <Button disabled={!active || order.metodo_pago !== 'efectivo'} onClick={() => beginCash(order)}>
                            <CircleDollarSign aria-hidden="true" className="size-5" /> Cobrar {formatMoney(order.saldo_pendiente!)}
                          </Button>
                        ) : isCashierPaidDeliveryOrder(order) ? (
                          <>
                            <strong className="text-sm" role="status">PAGADO</strong>
                            <Button variant="secondary" onClick={() => printOrderTicket(order, businessName ?? 'Establecimiento')}>
                              <ReceiptText aria-hidden="true" className="size-5" /> Imprimir ticket
                            </Button>
                            <Button variant="dark" onClick={() => beginDelivery(order)}>
                              {deliveryNeedsQr(order)
                                ? <><ScanLine aria-hidden="true" className="size-5" /> Validar QR</>
                                : 'Entregar'}
                            </Button>
                          </>
                        ) : isCashierDeferredDeliveryOrder(order) ? (
                          <>
                            <strong className="text-sm" role="status">Pendiente en cuenta</strong>
                            <Button variant="dark" onClick={() => beginDelivery(order)}>
                              {deliveryNeedsQr(order)
                                ? <><ScanLine aria-hidden="true" className="size-5" /> Validar QR</>
                                : 'Entregar'}
                            </Button>
                          </>
                        ) : (
                          <span className="text-sm" role="status">Pago pendiente</span>
                        )}
                        <Button variant="ghost" onClick={() => setRemovingFrom(order)}>
                          <XCircle aria-hidden="true" className="size-5" /> Quitar artículo
                        </Button>
                      </>)} />
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


      <details className="staff-details" open={role === 'admin'}>
          <summary>Estado del local</summary>
          <OperationalStatusPanel />
      </details>

      <AppSheet
        size="large"
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        title="Nuevo pedido"
        description="Lo registras tú: llega a cocina y a la cuenta de la mesa como cualquier otro pedido."
        contentClassName="staff-order-dialog"
      >
        {newOrderOpen && (
          <StaffOrderForm
            token={token}
            rol={role ?? ''}
            initialSpaceId={staffOrderSpaceId}
            onCreated={async (pedido) => {
              setNewOrderOpen(false);
              setNotice(avisoDeAlta(pedido));
              await Promise.all([
                refreshOperation(),
                queryClient.invalidateQueries({ queryKey: ['mesero-board'] }),
                queryClient.invalidateQueries({ queryKey: ['space-availability'] }),
              ]);
            }}
          />
        )}
      </AppSheet>

      <AppSheet
        open={Boolean(cashOrder)}
        onOpenChange={(open) => { if (!open) setCashOrder(null); }}
        title={cashOrder ? `Cobrar pedido ${cashOrder.folio}` : 'Cobrar pedido'}
        contentClassName="staff-payment-dialog"
        description={`Saldo pendiente: ${formatMoney(cashAmountDue)}. Confirma el efectivo recibido antes de registrar el cobro.`}
      >
        {cashOrder && (
          <form
            className="transaction-form staff-payment"
            onSubmit={(event) => void cashForm.handleSubmit(({ amount }) => {
              if (tipTooBig) return;
              collectMutation.mutate({ order: cashOrder, amount, propina: tipValue });
            })(event)}
          >
            {collectMutation.isError && <Feedback tone="error">{errorMessage(collectMutation.error)}</Feedback>}
            <p className="cashier-payment__customer">{cashOrder.usuario?.nombre ?? 'Cliente'}</p>
            <details><summary>Productos del pedido</summary><OrderDetailContent order={cashOrder} /></details>
            <p className="staff-payment__due"><span>Por cobrar</span><strong>{formatMoney(cashAmountDue)}</strong></p>
            <TipPicker base={cashAmountDue} value={tip} onChange={setTip} error={tipError} />
            <Field
              id="cash-amount"
              label="Efectivo recibido (MXN)"
              inputMode="decimal"
              placeholder={cashAmountDue}
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
              <span>{change === null && receivedAmount && calculateChange(cashToCollect, receivedAmount) !== null ? 'Falta' : 'Cambio'}</span>
              <strong>{change === null ? receivedAmount && calculateChange(cashToCollect, receivedAmount) !== null ? formatMoney(calculateChange(cashToCollect, receivedAmount)!) : '—' : formatMoney(change)}</strong>
            </div>
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setCashOrder(null)}>Cancelar</Button>
              <Button type="submit" loading={collectMutation.isPending} disabled={change === null || tipTooBig} aria-disabled={change === null || tipTooBig}>
                Confirmar cobro
              </Button>
            </div>
          </form>
        )}
      </AppSheet>

      <AppSheet
        open={Boolean(deliveryOrder)}
        onOpenChange={(open) => { if (!open) { setDeliveryOrder(null); setQrToken(''); } }}
        title={deliveryOrder ? `Entregar pedido ${deliveryOrder.folio}` : 'Entregar pedido'}
        contentClassName="staff-delivery-dialog"
        description={deliveryOrder && deliveryNeedsQr(deliveryOrder)
          ? 'Escanea el código del cliente. El sistema verificará que corresponda exactamente a este pedido.'
          : 'Confirma que el pedido corresponde al cliente antes de entregarlo.'}
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
                disabled={deliveryMutation.isPending || (deliveryNeedsQr(deliveryOrder) && !qrToken.trim())}
                onClick={() => deliveryMutation.mutate({ order: deliveryOrder, pickupToken: qrToken.trim() })}
              >
                Confirmar entrega
              </Button>
            </div>
          </div>
        )}
      </AppSheet>
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

    </CashierHome>
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
    return 'Cobra pedidos, imprime tickets y entrega con o sin QR según la configuración del local.';
  }
  if (role === 'cocina') {
    return 'Mantén esta ventana abierta para que el establecimiento detecte Cocina en línea.';
  }
  if (role === 'mesero') {
    return 'Atiende las mesas y entrega los pedidos listos según la configuración del local.';
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
