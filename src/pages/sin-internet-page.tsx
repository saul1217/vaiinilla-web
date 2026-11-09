import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppPageHeader } from '../components/app-page-header';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { Feedback } from '../components/ui';

export function SinInternetPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['business-settings', 'offline'], enabled: !!token, queryFn: () => api.businessSettings(token) });
  const status = useQuery({ queryKey: ['operational-status', 'offline'], enabled: !!token, queryFn: () => api.operationalStatus(token) });
  const save = useMutation({ mutationFn: (enabled: boolean) => api.setOfflinePause(token, enabled), onSuccess: () => client.invalidateQueries({ queryKey: ['business-settings', 'offline'] }) });
  // Older servers without migrations 160/161 do not expose this screen.
  if (settings.isError || status.isError || save.isError) return null;
  return <main className="page-stack admin-screen admin-flow">
    <AppPageHeader eyebrow="Administración · Continuidad" title="Operación sin internet" description="El sistema pausa los pedidos en línea cuando el local pierde conexión con su personal." />
    <section className="panel-card" aria-busy={settings.isLoading || status.isLoading}>
      {settings.isLoading || status.isLoading ? <p role="status">Consultando estado…</p> : <>
        <div className="section-heading"><div><p className="eyebrow">Estado actual</p><h2>{status.data?.local_sin_conexion ? 'Local sin conexión' : 'Operación en línea'}</h2></div></div>
        <p>{status.data?.local_sin_conexion ? 'La tienda dejó de recibir pedidos QR y reservas próximas hasta que vuelva el personal a conectarse.' : 'El servidor recibe señales del personal y mantiene disponible la operación normal.'}</p>
        <p role="status">{status.data?.recibiendo_pedidos ? 'Pedidos en línea habilitados' : 'Pedidos en línea pausados'}</p>
        <label className="flex items-center gap-3"><input type="checkbox" checked={settings.data?.pausa_sin_conexion ?? false} disabled={save.isPending} onChange={event => save.mutate(event.target.checked)} />Pausar pedidos de clientes cuando no haya personal conectado</label>
        {save.isPending && <p role="status">Guardando preferencia…</p>}
        {save.isSuccess && <Feedback tone="success">Preferencia actualizada.</Feedback>}
      </>}
    </section>
    <section className="panel-card"><h2>Pedidos tomados sin conexión</h2><p>La sincronización de pedidos en efectivo usa el endpoint de pedidos existente y requiere que la aplicación staff conserve el folio local hasta recuperar la red.</p></section>
  </main>;
}
