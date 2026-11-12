import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppPageHeader } from '../components/app-page-header';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { Button, Feedback } from '../components/ui';
import { errorMessage } from '../lib/api-error';
import { Card, LoadingState } from '../components/vai';

export function SinInternetPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const client = useQueryClient();
  // Por negocio y usuario: otra sesión en el mismo navegador no reutiliza estos datos.
  const scope = `${tenant?.context.establecimiento_id ?? ''}|${tenant?.context.usuario_id ?? ''}`;
  const settings = useQuery({ queryKey: ['business-settings', 'offline', scope], enabled: !!token, queryFn: () => api.businessSettings(token) });
  const status = useQuery({ queryKey: ['operational-status', 'offline', scope], enabled: !!token, queryFn: () => api.operationalStatus(token) });
  const save = useMutation({ mutationFn: (enabled: boolean) => api.setOfflinePause(token, enabled), onSuccess: () => client.invalidateQueries({ queryKey: ['business-settings', 'offline', scope] }) });
  const loadError = settings.error ?? status.error;
  return <main className="page-stack admin-screen admin-flow">
    <AppPageHeader eyebrow="Administración · Continuidad" title="Operación sin internet" description="El sistema pausa los pedidos en línea cuando el local pierde conexión con su personal." />
    <Card aria-busy={settings.isLoading || status.isLoading}>
      {loadError ? (
        <Feedback tone="error">
          No se pudo consultar el estado: {errorMessage(loadError)}
          <Button type="button" variant="ghost" onClick={() => { void settings.refetch(); void status.refetch(); }}>Reintentar</Button>
        </Feedback>
      ) : settings.isLoading || status.isLoading ? <LoadingState label="Consultando estado…" cards={1} /> : <>
        <div className="section-heading"><div><p className="eyebrow">Estado actual</p><h2>{status.data?.local_sin_conexion ? 'Local sin conexión' : 'Operación en línea'}</h2></div></div>
        <p>{status.data?.local_sin_conexion ? 'La tienda dejó de recibir pedidos QR y reservas próximas hasta que vuelva el personal a conectarse.' : 'El servidor recibe señales del personal y mantiene disponible la operación normal.'}</p>
        <p role="status">{status.data?.recibiendo_pedidos ? 'Pedidos en línea habilitados' : 'Pedidos en línea pausados'}</p>
        <label className="flex items-center gap-3"><input type="checkbox" checked={settings.data?.pausa_sin_conexion ?? false} disabled={save.isPending} onChange={event => save.mutate(event.target.checked)} />Pausar pedidos de clientes cuando no haya personal conectado</label>
        {save.isPending && <p role="status">Guardando preferencia…</p>}
        {save.isSuccess && <Feedback tone="success">Preferencia actualizada.</Feedback>}
        {save.isError && <Feedback tone="error">No se guardó la preferencia: {errorMessage(save.error)}</Feedback>}
      </>}
    </Card>
    <Card title="Pedidos tomados sin conexión" description="Caja y Mesero guardan en el navegador los pedidos en efectivo que no se pudieron mandar, con su folio local, y los mandan solos al volver la red sin duplicarlos. Si el navegador no deja guardar, la pantalla lo avisa y no los da por tomados." />
  </main>;
}
