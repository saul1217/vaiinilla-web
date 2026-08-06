import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, CirclePause, MailCheck, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Feedback, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';

export function PlatformDashboardPage() {
  const { platform } = useSessions();
  const token = platform?.token ?? '';
  const summary = useQuery({
    queryKey: ['platform-summary'],
    enabled: Boolean(token),
    queryFn: () => api.platformSummary(token),
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Autoridad global"
        title="Resumen de plataforma"
        description="Vista exclusivamente global. No contiene pedidos, wallet, cobros ni información financiera de los establecimientos."
      />

      {summary.isError && <Feedback tone="error">{errorMessage(summary.error)}</Feedback>}

      <section className="platform-security-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Autoridad separada y auditada</strong>
          <p>Cada consulta y mutación de esta superficie utiliza un token de plataforma de 10 minutos.</p>
        </div>
      </section>

      <section className="stats-grid" aria-label="Resumen global">
        <article className="stat-card">
          <span className="stat-card__icon stat-card__icon--lime"><Building2 aria-hidden="true" /></span>
          <div><p>Establecimientos activos</p><strong>{summary.data?.establecimientos_activos ?? '—'}</strong></div>
          <span className="stat-card__meta">Operación habilitada</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon"><CirclePause aria-hidden="true" /></span>
          <div><p>Establecimientos suspendidos</p><strong>{summary.data?.establecimientos_suspendidos ?? '—'}</strong></div>
          <span className="stat-card__meta">Con cierre controlado</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__icon"><MailCheck aria-hidden="true" /></span>
          <div><p>Invitaciones pendientes</p><strong>{summary.data?.invitaciones_pendientes ?? '—'}</strong></div>
          <span className="stat-card__meta">Primeros administradores</span>
        </article>
      </section>

      <Link to="/plataforma/establecimientos" className="platform-action-card">
        <div>
          <p className="eyebrow">Gestión global</p>
          <h2>Administrar establecimientos</h2>
          <p>Crea, configura, suspende, reactiva o asigna el primer administrador con acciones confirmadas.</p>
        </div>
        <span><ArrowRight aria-hidden="true" /></span>
      </Link>

      {summary.data && (
        <p className="text-xs text-muted">
          Último cálculo: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(summary.data.calculado_en))}
        </p>
      )}
    </div>
  );
}
