// «Mi turno y mis propinas» (Doop N07): lo de quien consulta, hoy y en la semana.
// Contrato: GET /reportes/mi-turno de vaiinilla_back (admin, cajero, mesero y cocina).
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPageHeader } from '../components/app-page-header';
import { Card, LoadingState, VaiButton, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { responseLabel, shiftMoney, todayIso, weekBarHeights, weekdayLetter } from '../lib/my-shift';

const ROLE_LABEL: Record<string, string> = { cajero: 'Caja', mesero: 'Mesero', cocina: 'Cocina', admin: 'Administración' };

export function MyShiftPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scope = tenant ? `${tenant.context.establecimiento_id}|${tenant.context.usuario_id}` : '';
  const shift = useQuery({
    queryKey: ['mi-turno', scope],
    enabled: Boolean(token),
    queryFn: () => api.myShift(token),
    refetchInterval: 60_000,
  });
  const subtitle = [ROLE_LABEL[tenant?.context.rol ?? ''], tenant?.access.establecimiento.nombre].filter(Boolean).join(' · ');

  return (
    <main className="page-stack admin-screen my-shift">
      <AppPageHeader eyebrow={subtitle || 'Personal'} title="Mi turno" description="Lo que llevas hoy y tus propinas de la semana. La propina es del negocio: aquí solo se informa."
        action={<Link className="button button--secondary" to="/app/manual"><BookOpen aria-hidden="true" className="size-4" /> Paso a paso</Link>} />
      {shift.isPending ? (
        <LoadingState label="Consultando tu turno…" cards={2} />
      ) : shift.isError ? (
        <div role="alert">
          <VaiEmptyState
            icon={<AlertTriangle />}
            title="No se pudo consultar tu turno"
            message={errorMessage(shift.error)}
            action={<VaiButton variant="secondary" onClick={() => void shift.refetch()} disabled={shift.isFetching}>Reintentar</VaiButton>}
          />
        </div>
      ) : (
        <>
          <section className="my-shift__hero" aria-label="Hoy">
            <span>Propinas de hoy</span>
            <strong>{shiftMoney(shift.data.hoy.propinas)}</strong>
            <dl className="my-shift__tiles">
              <div><dt>Entregas</dt><dd>{shift.data.hoy.entregas}</dd></div>
              <div><dt>Mesas</dt><dd>{shift.data.hoy.mesas}</dd></div>
              <div><dt>Llamadas</dt><dd>{shift.data.hoy.llamadas_atendidas}</dd></div>
              <div><dt>Respuesta</dt><dd>{responseLabel(shift.data.hoy.respuesta_min)}</dd></div>
            </dl>
          </section>
          <Card aria-label="Esta semana">
            <div className="my-shift__week-head">
              <h2 className="vai-card__title">Esta semana</h2>
              <strong>{shiftMoney(shift.data.semana.propinas)}</strong>
            </div>
            <Week days={shift.data.semana.por_dia} />
          </Card>
        </>
      )}
    </main>
  );
}

function Week({ days }: { days: { fecha: string; propinas: string }[] }) {
  const heights = weekBarHeights(days);
  const today = todayIso();
  return (
    <ol className="my-shift__bars" aria-label="Propinas por día">
      {days.map((day, i) => (
        <li key={day.fecha} className={day.fecha === today ? 'my-shift__day my-shift__day--today' : 'my-shift__day'}>
          <span className="my-shift__bar" style={{ height: `${Math.max(6, heights[i] ?? 0)}%` }} aria-hidden="true" />
          <span className="my-shift__letter" aria-hidden="true">{weekdayLetter(day.fecha)}</span>
          <span className="sr-only">{`${day.fecha}${day.fecha === today ? ' (hoy)' : ''}: ${shiftMoney(day.propinas)}`}</span>
        </li>
      ))}
    </ol>
  );
}
