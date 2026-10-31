import { AppPageHeader } from '../components/app-page-header';
import { useQuery } from '@tanstack/react-query';
import {
  BadgePercent,
  ChevronRight,
  HandCoins,
  ClipboardList,
  NotebookTabs,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PeriodSelector, RankedBarChart, SalesTrendChart } from '../components/analytics-dashboard';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { UnpaidAccountsCard } from '../components/unpaid-accounts-card';
import { Feedback } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { defaultAnalyticsPeriod, formatAnalyticsMoney } from '../lib/analytics';
import { CASHBACK_ENABLED } from '../lib/features';

const paymentLabels = {
  efectivo: 'Efectivo',
  saldo: 'Saldo Vaiinilla',
  stripe: 'Tarjeta',
} as const;
const statusLabels = {
  por_cobrar: 'Por cobrar',
  cobrado: 'Cobrado',
  preparando: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  no_recogido: 'No recogido',
  expirado: 'Expirado',
} as const;

export function TenantDashboardPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const [period, setPeriod] = useState(defaultAnalyticsPeriod);

  const analytics = useQuery({
    queryKey: ['tenant-analytics', scopeId, period.desde, period.hasta],
    enabled: Boolean(token),
    queryFn: () => api.tenantAnalytics(token, period),
  });

  const pendingInvitations = useQuery({
    queryKey: ['invitations', 'pendiente', 'summary'],
    enabled: Boolean(token),
    queryFn: () => api.listInvitations(token, { estado: 'pendiente', limit: 50 }),
  });

  const cashSession = useQuery({
    queryKey: ['cash-session', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.activeCashSession(token),
  });

  const activeOrders = useQuery({
    queryKey: ['orders', 'admin', scopeId, 'summary'],
    enabled: Boolean(token),
    queryFn: () =>
      api.listOrders(token, {
        estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'],
        limit: 100,
      }),
    refetchInterval: 10_000,
  });

  const pendingCount = pendingInvitations.data?.invitations.length ?? 0;
  const activeSession = cashSession.data;
  const activeOrderCount = activeOrders.data?.orders.length ?? 0;
  const report = analytics.data;
  const topProduct = report?.productos[0];

  return (
    <div className="page-stack admin-screen admin-overview">
      <AppPageHeader
        eyebrow="Administración · Inicio"
        title={tenant?.access.establecimiento.nombre ?? 'Vaiinilla'}
      />

      <PeriodSelector value={period} onChange={setPeriod} />

      {tenant?.context.modo_restringido && (
        <div className="restricted-banner">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>
              Contexto restringido: {tenant.context.modo_restringido.replace('_', ' ')}
            </strong>
            <p>
              El sistema permitirá únicamente las acciones de cierre compatibles con la suspensión.
            </p>
          </div>
        </div>
      )}

      {analytics.isError && <Feedback tone="error">{errorMessage(analytics.error)}</Feedback>}

      <div className="business-summary">
        <section aria-label="Ventas en el periodo" aria-busy={analytics.isFetching}>
          <p className="eyebrow">En el periodo</p>
          <p className="sr-only" role="status">
            Periodo: {period.desde} a {period.hasta}
            {analytics.isFetching ? '. Actualizando métricas…' : ''}
          </p>
          <article className="business-sales">
            <p>Ventas confirmadas</p>
            <strong>{report ? formatAnalyticsMoney(report.resumen.ventas_totales) : '—'}</strong>
            <small>Sin cancelados ni pedidos por cobrar</small>
          </article>
        </section>
        <aside className="business-now" aria-label="Ahora">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ahora</p>
              <h2>Operación del establecimiento</h2>
            </div>
          </div>

          <section className="stats-grid" aria-label="Resumen del establecimiento">
            <article className="stat-card">
              <span className="stat-card__icon stat-card__icon--lime">
                <UserPlus aria-hidden="true" />
              </span>
              <div>
                <p>Invitaciones pendientes</p>
                <strong>
                  {pendingInvitations.isError
                    ? 'No disponible'
                    : pendingInvitations.isPending
                      ? '—'
                      : pendingCount}
                </strong>
              </div>
              <span className="stat-card__meta">Hasta 50 recientes</span>
            </article>
            <article className="stat-card">
              <span className="stat-card__icon">
                <WalletCards aria-hidden="true" />
              </span>
              <div>
                <p>Estado de Caja</p>
                <strong className="text-xl">
                  {cashSession.isError
                    ? 'No disponible'
                    : cashSession.isPending
                      ? 'Consultando'
                      : activeSession
                        ? 'Abierta'
                        : 'Cerrada'}
                </strong>
              </div>
              <span className="stat-card__meta">Contrato POS vigente</span>
            </article>
            <article className="stat-card">
              <span className="stat-card__icon">
                <ClipboardList aria-hidden="true" />
              </span>
              <div>
                <p>Pedidos activos</p>
                <strong>
                  {activeOrders.isError
                    ? 'No disponible'
                    : activeOrders.isPending
                      ? '—'
                      : `${activeOrderCount}${activeOrders.data?.cursor ? '+' : ''}`}
                </strong>
              </div>
              <span className="stat-card__meta">Actualización cada 10 segundos</span>
            </article>
          </section>

          <OperationalStatusPanel />
          {pendingInvitations.isError && (
            <Feedback tone="error">
              Invitaciones: {errorMessage(pendingInvitations.error)}
            </Feedback>
          )}
          {cashSession.isError && (
            <Feedback tone="error">Caja: {errorMessage(cashSession.error)}</Feedback>
          )}
          {activeOrders.isError && (
            <Feedback tone="error">
              Pedidos activos: {errorMessage(activeOrders.error)}
            </Feedback>
          )}
        </aside>
      </div>
      <section className="analytics-kpi-grid" aria-label="Indicadores del periodo">
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <ReceiptText aria-hidden="true" />
          </span>
          <p>Pedidos pagados</p>
          <strong>{report?.resumen.pedidos ?? '—'}</strong>
          <small>Dentro del periodo seleccionado</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <TrendingUp aria-hidden="true" />
          </span>
          <p>Ticket promedio</p>
          <strong>{report ? formatAnalyticsMoney(report.resumen.ticket_promedio) : '—'}</strong>
          <small>Promedio por pedido confirmado</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <HandCoins aria-hidden="true" />
          </span>
          <p>Propinas</p>
          <strong>{report ? formatAnalyticsMoney(report.resumen.propinas ?? '0.00') : '—'}</strong>
          <small>Aparte de las ventas, sin comisión</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <PackageCheck aria-hidden="true" />
          </span>
          <p>Producto más vendido</p>
          <strong className="analytics-kpi__text">
            {topProduct?.nombre ?? (report ? 'Sin ventas' : '—')}
          </strong>
          <small>{topProduct ? `${topProduct.cantidad} unidades` : 'En el periodo actual'}</small>
        </article>
      </section>

      {report && (
        <section className="analytics-secondary" aria-label="Otros movimientos del periodo">
          <div>
            <span>Recargas en efectivo</span>
            <strong>{formatAnalyticsMoney(report.resumen.recargas)}</strong>
          </div>
          <div>
            <span>Comisiones generadas</span>
            <strong>{formatAnalyticsMoney(report.resumen.comisiones)}</strong>
          </div>
          <p>
            Actualizado{' '}
            {new Intl.DateTimeFormat('es-MX', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(report.calculado_en))}
          </p>
        </section>
      )}

      {analytics.isPending ? (
        <div className="analytics-loading" role="status">
          Preparando las métricas del negocio…
        </div>
      ) : report ? (
        <section className="analytics-grid" aria-label="Gráficas del negocio">
          <RankedBarChart
            eyebrow="Preferencias"
            title="Métodos de pago"
            emptyMessage="No hay pagos confirmados en este periodo."
            items={report.metodos_pago
              .filter((item) => Number(item.ventas) > 0)
              .map((item) => ({
                id: item.metodo,
                label: paymentLabels[item.metodo],
                value: Number(item.ventas),
                valueLabel: formatAnalyticsMoney(item.ventas),
                meta: `${item.pedidos} pedidos`,
                state: 'positive' as const,
              }))}
          />
          <RankedBarChart
            eyebrow="Menú"
            title="Productos más vendidos"
            emptyMessage="Los productos aparecerán cuando haya ventas confirmadas."
            items={report.productos.map((item) => ({
              id: String(item.producto_id),
              label: item.nombre,
              value: item.cantidad,
              valueLabel: `${item.cantidad} u.`,
              state: 'positive' as const,
            }))}
          />
          <SalesTrendChart data={report.ventas_por_dia} />
          <RankedBarChart
            eyebrow="Flujo"
            title="Pedidos por estado"
            emptyMessage="No hay pedidos en este periodo."
            items={report.pedidos_por_estado
              .filter((item) => item.pedidos > 0)
              .map((item) => ({
                id: item.estado,
                label: statusLabels[item.estado],
                value: item.pedidos,
                valueLabel: String(item.pedidos),
                state:
                  item.estado === 'cancelado' || item.estado === 'expirado'
                    ? ('warning' as const)
                    : ('neutral' as const),
              }))}
          />
        </section>
      ) : null}

      <UnpaidAccountsCard />

      <nav className="dashboard-access" aria-label="Accesos">
        <ul>
          <li>
            <Link to="/app/menu">
              <NotebookTabs aria-hidden="true" />
              <span>Menú</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link to="/app/pedidos">
              <ClipboardList aria-hidden="true" />
              <span>Pedidos e historial</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link to="/app/invitaciones">
              <UserPlus aria-hidden="true" />
              <span>Personal e invitaciones</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
          {CASHBACK_ENABLED && (
            <li>
              <Link to="/app/cashback">
                <BadgePercent aria-hidden="true" />
                <span>Cashback y wallet</span>
                <ChevronRight aria-hidden="true" />
              </Link>
            </li>
          )}
          <li>
            <Link to="/app/pos">
              <WalletCards aria-hidden="true" />
              <span>Caja / POS</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
