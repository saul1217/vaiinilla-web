import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { AppPageHeader } from '../components/app-page-header';
import { Feedback } from '../components/ui';
import { Card, LoadingState, VaiEmptyState } from '../components/vai';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { LineCounts, LiveLine, LiveStaffRow } from '../types/api';

const ROLE_LABEL: Record<LiveStaffRow['rol'], string> = { cajero: 'Caja', mesero: 'Mesero', cocina: 'Cocina' };

const pending = (c: LineCounts) => c.por_cobrar + c.en_preparacion + c.listos;

function minutesAgo(iso: string | null): string {
  if (!iso) return '—';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? 'ahora' : `hace ${min} min`;
}

function LineRow({ line, busiest }: { line: LiveLine; busiest: number }) {
  const total = pending(line);
  const width = busiest > 0 ? Math.round((total / busiest) * 100) : 0;
  return (
    <li className="grid gap-2 rounded-2xl border border-ink/10 bg-white-warm p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-extrabold">
          {line.nombre}
          {line.express && <span className="ml-2 text-xs font-bold text-muted">Express</span>}
        </h3>
        <p className="text-sm font-bold tabular-nums" aria-label={`${total} pendientes`}>{total} pendientes</p>
      </div>
      <div className="h-2 rounded-full bg-ink/10" aria-hidden="true">
        <div className="h-2 rounded-full bg-ink" style={{ width: `${width}%` }} />
      </div>
      <dl className="grid grid-cols-4 gap-2 text-sm tabular-nums">
        <div><dt className="text-muted">Por cobrar</dt><dd className="font-bold">{line.por_cobrar}</dd></div>
        <div><dt className="text-muted">Preparando</dt><dd className="font-bold">{line.en_preparacion}</dd></div>
        <div><dt className="text-muted">Listos</dt><dd className="font-bold">{line.listos}</dd></div>
        <div><dt className="text-muted">Entregados</dt><dd className="font-bold">{line.entregados}</dd></div>
      </dl>
      {line.no_recogidos > 0 && <p className="text-sm text-muted">{line.no_recogidos} no pasaron por su pedido.</p>}
    </li>
  );
}

/** Tablero de Caja: cuánto tiene cada fila ahora y qué lleva cada persona del equipo hoy. */
export function LinesLivePage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const board = useQuery({
    queryKey: ['lines-live', tenant?.context.establecimiento_id],
    queryFn: () => api.linesLive(token),
    enabled: Boolean(tenant),
    refetchInterval: 15_000,
  });
  if (!tenant) return null;

  const data = board.data;
  const busiest = data ? Math.max(0, ...data.filas.map(pending)) : 0;

  return (
    <div className="grid gap-5">
      <AppPageHeader
        eyebrow="Caja"
        title="Filas en vivo"
        description="Se actualiza cada 15 segundos. Si una fila se carga, pásale gente a la que tiene menos."
      />
      {board.isError && <Feedback tone="error">{errorMessage(board.error)}</Feedback>}
      {board.isPending && <LoadingState label="Cargando filas…" />}
      {data && (
        <>
          <Card
            title="Filas"
            description={
              data.reparto_filas === 'turno'
                ? `Los pedidos se reparten en orden entre las barras.${data.antes_del_corte ? ' La fila express todavía recibe lo que piden.' : ''}`
                : 'Cada pedido va a la barra cuyo QR escanearon.'
            }
          >
            {data.filas.length === 0 ? (
              <p className="text-sm text-muted">No hay barras activas. Créalas en Mesas y espacios con tipo «Barra».</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {data.filas.map((line) => <LineRow key={line.id} line={line} busiest={busiest} />)}
              </ul>
            )}
            {pending(data.sin_fila) > 0 && (
              <p className="mt-3 text-sm text-muted">
                Sin fila (mesas y para llevar sin barra): {pending(data.sin_fila)} pendientes.
              </p>
            )}
          </Card>
          <Card title="Equipo hoy">
            {data.personal.length === 0 ? (
              <VaiEmptyState icon={<Users aria-hidden="true" />} title="Sin movimientos todavía" message="Aquí aparece cada persona en cuanto prepara o entrega su primer pedido." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="py-2 pr-3 font-semibold">Persona</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Puesto</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Entregados</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Listos</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">No vinieron</th>
                      <th scope="col" className="py-2 font-semibold">Último movimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.personal.map((row) => (
                      <tr key={`${row.usuario_id}-${row.rol}`} className="border-t border-ink/10">
                        <td className="py-2 pr-3 font-bold">{row.nombre?.trim() || 'Sin nombre'}</td>
                        <td className="py-2 pr-3">{ROLE_LABEL[row.rol] ?? row.rol}</td>
                        <td className="py-2 pr-3">{row.entregados}</td>
                        <td className="py-2 pr-3">{row.listos}</td>
                        <td className="py-2 pr-3">{row.no_recogidos}</td>
                        <td className="py-2">{minutesAgo(row.ultimo_movimiento)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
