import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Banknote,
  Building2,
  CircleAlert,
  CirclePause,
  MailCheck,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PeriodSelector, RankedBarChart, SalesTrendChart } from '../components/analytics-dashboard';
import { Feedback, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { defaultAnalyticsPeriod, formatAnalyticsMoney } from '../lib/analytics';

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

export function PlatformDashboardPage() {
  const { platform } = useSessions();
  const token = platform?.token ?? '';
  const [period, setPeriod] = useState(defaultAnalyticsPeriod);
  const analytics = useQuery({
    queryKey: ['platform-analytics', period.desde, period.hasta],
    enabled: Boolean(token),
    queryFn: () => api.platformAnalytics(token, period),
  });
  const report = analytics.data;
  const operation = report?.operacion;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Autoridad global"
        title="Pulso de la plataforma"
        description="Compara ventas y operación entre establecimientos con datos agregados y sin exponer información personal."
      />

      <section className="platform-security-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Consulta global separada y auditada</strong>
          <p>
            El reporte usa un token de plataforma de 10 minutos, registra cada consulta y nunca
            devuelve clientes, pedidos individuales ni wallets.
          </p>
        </div>
      </section>

      <PeriodSelector value={period} onChange={setPeriod} />

      {analytics.isError && <Feedback tone="error">{errorMessage(analytics.error)}</Feedback>}

      <section className="analytics-kpi-grid" aria-label="Indicadores globales del periodo">
        <article className="analytics-kpi analytics-kpi--dark">
          <span className="analytics-kpi__icon">
            <Banknote aria-hidden="true" />
          </span>
          <p>Ventas globales</p>
          <strong>{report ? formatAnalyticsMoney(report.resumen.ventas_totales) : '—'}</strong>
          <small>Pagos confirmados</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <ReceiptText aria-hidden="true" />
          </span>
          <p>Pedidos pagados</p>
          <strong>{report?.resumen.pedidos ?? '—'}</strong>
          <small>En todos los establecimientos</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <TrendingUp aria-hidden="true" />
          </span>
          <p>Ticket promedio</p>
          <strong>{report ? formatAnalyticsMoney(report.resumen.ticket_promedio) : '—'}</strong>
          <small>Promedio global</small>
        </article>
        <article className="analytics-kpi">
          <span className="analytics-kpi__icon">
            <WalletCards aria-hidden="true" />
          </span>
          <p>Comisiones</p>
          <strong>{report ? formatAnalyticsMoney(report.resumen.comisiones) : '—'}</strong>
          <small>Generadas en el periodo</small>
        </article>
      </section>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Operación</p>
          <h2>Estado actual de la red</h2>
        </div>
      </div>
      <section className="operation-metric-grid" aria-label="Estado global de establecimientos">
        <article>
          <Building2 aria-hidden="true" />
          <span>Activos</span>
          <strong>{operation?.establecimientos_activos ?? '—'}</strong>
        </article>
        <article>
          <CirclePause aria-hidden="true" />
          <span>Suspendidos</span>
          <strong>{operation?.establecimientos_suspendidos ?? '—'}</strong>
        </article>
        <article>
          <MailCheck aria-hidden="true" />
          <span>Invitaciones</span>
          <strong>{operation?.invitaciones_pendientes ?? '—'}</strong>
        </article>
        <article>
          <WalletCards aria-hidden="true" />
          <span>Cajas abiertas</span>
          <strong>{operation?.sesiones_caja_abiertas ?? '—'}</strong>
        </article>
        <article>
          <Store aria-hidden="true" />
          <span>Recibiendo pedidos</span>
          <strong>{operation?.establecimientos_recibiendo ?? '—'}</strong>
        </article>
        <article className="operation-metric--warning">
          <CircleAlert aria-hidden="true" />
          <span>Activos sin operación</span>
          <strong>{operation?.establecimientos_sin_operacion ?? '—'}</strong>
        </article>
      </section>

      {analytics.isPending ? (
        <div className="analytics-loading" role="status">
          Consolidando las métricas de la plataforma…
        </div>
      ) : report ? (
        <section className="analytics-grid" aria-label="Gráficas globales">
          <SalesTrendChart data={report.ventas_por_dia} />
          <RankedBarChart
            eyebrow="Comparativo"
            title="Ventas por establecimiento"
            emptyMessage="No hay establecimientos con ventas confirmadas en este periodo."
            items={report.establecimientos
              .filter((item) => Number(item.ventas) > 0)
              .map((item) => ({
                id: item.id,
                label: item.nombre,
                value: Number(item.ventas),
                valueLabel: formatAnalyticsMoney(item.ventas),
                meta: `${item.pedidos} pedidos · ${item.recibiendo_pedidos ? 'Recibiendo' : 'Sin operación'}`,
                state: item.recibiendo_pedidos ? ('positive' as const) : ('warning' as const),
              }))}
          />
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

      <Link to="/plataforma/establecimientos" className="platform-action-card">
        <div>
          <p className="eyebrow">Gestión global</p>
          <h2>Administrar establecimientos</h2>
          <p>
            Crea, configura, suspende, reactiva o asigna el primer administrador con acciones
            confirmadas.
          </p>
        </div>
        <span>
          <ArrowRight aria-hidden="true" />
        </span>
      </Link>

      {report && (
        <p className="text-xs text-muted">
          Último cálculo:{' '}
          {new Intl.DateTimeFormat('es-MX', {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(report.calculado_en))}
        </p>
      )}
    </div>
  );
}
