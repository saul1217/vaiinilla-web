import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, ShieldCheck, UserPlus, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { OperationalStatusPanel } from '../components/operational-status-panel';
import { PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';

export function TenantDashboardPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';

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
    queryFn: () => api.listOrders(token, {
      estado: ['por_cobrar', 'cobrado', 'preparando', 'listo'],
      limit: 100,
    }),
    refetchInterval: 10_000,
  });

  const pendingCount = pendingInvitations.data?.invitations.length ?? 0;
  const activeSession = cashSession.data;
  const activeOrderCount = activeOrders.data?.orders.length ?? 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administración"
        title={`Hola, ${tenant?.access.establecimiento.nombre ?? 'Vaiinilla'}`}
        description="Revisa lo que necesita atención y entra directamente a cada operación autorizada."
      />

      {tenant?.context.modo_restringido && (
        <div className="restricted-banner">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Contexto restringido: {tenant.context.modo_restringido.replace('_', ' ')}</strong>
            <p>El backend permitirá únicamente las acciones de cierre compatibles con la suspensión.</p>
          </div>
        </div>
      )}

      <section className="stats-grid" aria-label="Resumen del establecimiento">
        <article className="stat-card">
          <span className="stat-card__icon stat-card__icon--lime"><UserPlus aria-hidden="true" /></span>
          <div>
            <p>Invitaciones pendientes</p>
            <strong>{pendingInvitations.isPending ? '—' : pendingCount}</strong>
          </div>
          <span className="stat-card__meta">Hasta 50 recientes</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon"><WalletCards aria-hidden="true" /></span>
          <div>
            <p>Estado de Caja</p>
            <strong className="text-xl">{cashSession.isPending ? 'Consultando' : activeSession ? 'Abierta' : 'Cerrada'}</strong>
          </div>
          <span className="stat-card__meta">Contrato POS vigente</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon"><ClipboardList aria-hidden="true" /></span>
          <div>
            <p>Pedidos activos</p>
            <strong>{activeOrders.isPending ? '—' : `${activeOrderCount}${activeOrders.data?.cursor ? '+' : ''}`}</strong>
          </div>
          <span className="stat-card__meta">Actualización cada 10 segundos</span>
        </article>
      </section>

      <OperationalStatusPanel />

      <section className="dashboard-grid dashboard-grid--three">
        <Link to="/app/pedidos" className="dashboard-card">
          <div className="dashboard-card__top">
            <span className="dashboard-card__icon"><ClipboardList aria-hidden="true" /></span>
            <ArrowRight aria-hidden="true" />
          </div>
          <h2>Pedidos e historial</h2>
          <p>Revisa pedidos activos, entregados e incidencias con su detalle completo.</p>
        </Link>
        <Link to="/app/invitaciones" className="dashboard-card">
          <div className="dashboard-card__top">
            <span className="dashboard-card__icon"><UserPlus aria-hidden="true" /></span>
            <ArrowRight aria-hidden="true" />
          </div>
          <h2>Personal e invitaciones</h2>
          <p>Invita por correo, revisa estados y controla reenvíos o revocaciones.</p>
        </Link>
        <Link to="/app/pos" className="dashboard-card dashboard-card--dark">
          <div className="dashboard-card__top">
            <span className="dashboard-card__icon"><WalletCards aria-hidden="true" /></span>
            <ArrowRight aria-hidden="true" />
          </div>
          <h2>Caja / POS</h2>
          <p>Consulta, abre o cierra la sesión operativa usando las mismas reglas que Caja móvil.</p>
        </Link>
      </section>
    </div>
  );
}
