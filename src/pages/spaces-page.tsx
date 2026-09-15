import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Link2, Plus, RefreshCw, RotateCw, Store, Table2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Feedback, Field, PageHeader, SelectField } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { ManagedSpace, SpaceType } from '../types/api';

const typeLabels: Record<SpaceType, string> = { mesa: 'Mesa', barra: 'Barra', cancha: 'Cancha', drive_thru: 'Drive-thru' };

function SpaceCard({ space, onToggle, onRotate }: { space: ManagedSpace; onToggle: () => void; onRotate: () => void }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { let mounted = true; void QRCode.toDataURL(space.qr_url, { margin: 2, width: 180, color: { dark: '#16150F', light: '#FBF9F2' } }).then((value) => { if (mounted) setQr(value); }); return () => { mounted = false; }; }, [space.qr_url]);
  async function copyUrl() {
    await navigator.clipboard.writeText(space.qr_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <article className="panel-card flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-lime text-ink"><Table2 aria-hidden="true" /></span>
          <div><h2 className="text-lg font-extrabold text-ink">{space.nombre}</h2><p className="text-sm text-muted">{typeLabels[space.tipo]}</p></div>
        </div>
        <span className={`status-badge ${space.activo ? 'status-badge--success' : 'status-badge--muted'}`}>{space.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div className="flex items-center gap-4 rounded-2xl bg-cream p-4">
        {qr && <img src={qr} alt={`Código QR de ${space.nombre}`} width="96" height="96" className="size-24 rounded-xl" />}
        <div className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">Enlace del QR</p>
        <p className="break-all text-xs leading-5 text-ink">{space.qr_url}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copyUrl()}><Copy aria-hidden="true" className="size-4" />{copied ? 'Copiado' : 'Copiar enlace'}</Button>
        <a className="button button--ghost" href={space.qr_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" className="size-4" />Abrir</a>
        <Button type="button" variant="ghost" onClick={onRotate}><RotateCw aria-hidden="true" className="size-4" />Rotar QR</Button>
        <Button type="button" variant="ghost" onClick={onToggle}>{space.activo ? 'Desactivar' : 'Activar'}</Button>
      </div>
    </article>
  );
}

export function SpacesPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<SpaceType>('mesa');
  const [feedback, setFeedback] = useState<string | null>(null);
  const spaces = useQuery({ queryKey: ['managed-spaces', scopeId], enabled: Boolean(token), queryFn: () => api.listManagedSpaces(token) });
  const create = useMutation({ mutationFn: () => api.createSpace(token, { nombre: name.trim(), tipo: type }), onSuccess: () => { setName(''); setFeedback('Espacio creado. El enlace ya puede convertirse en QR.'); void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }); } });
  const update = useMutation({ mutationFn: ({ id, activo }: { id: number; activo: boolean }) => api.updateSpace(token, id, { activo }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }) });
  const rotate = useMutation({ mutationFn: (id: number) => api.rotateSpaceQr(token, id), onSuccess: () => setFeedback('QR rotado. El enlace anterior dejó de resolver.'), onSettled: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }) });
  const mutationError = create.error || update.error || rotate.error;
  function submit(event: FormEvent) { event.preventDefault(); setFeedback(null); if (name.trim()) create.mutate(); }
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Operación del establecimiento" title="Mesas y espacios" description="Crea espacios para que tus clientes puedan pedir desde un QR. Los enlaces pertenecen únicamente a este establecimiento." />
      {feedback && <Feedback tone="success">{feedback}</Feedback>}
      {mutationError && <Feedback tone="error">{errorMessage(mutationError)}</Feedback>}
      <section className="panel-card">
        <div className="mb-5 flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm"><Plus aria-hidden="true" /></span><div><h2 className="text-xl font-extrabold text-ink">Nuevo espacio</h2><p className="mt-1 text-sm text-muted">Puedes usar mesas, canchas o espacios drive-thru.</p></div></div>
        <form className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={submit}>
          <Field label="Nombre" value={name} onChange={(event) => setName(event.target.value)} placeholder="Mesa 01" maxLength={80} required />
          <SelectField label="Tipo" value={type} onChange={(event) => setType(event.target.value as SpaceType)}><option value="mesa">Mesa</option><option value="barra">Barra</option><option value="cancha">Cancha</option><option value="drive_thru">Drive-thru</option></SelectField>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}><Plus aria-hidden="true" className="size-4" />Crear espacio</Button>
        </form>
      </section>
      <section className="space-y-4" aria-labelledby="spaces-list-title">
        <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Inventario operativo</p><h2 id="spaces-list-title" className="mt-1 text-2xl font-extrabold text-ink">Tus espacios</h2></div><Button type="button" variant="ghost" onClick={() => void spaces.refetch()}><RefreshCw aria-hidden="true" className="size-4" />Actualizar</Button></div>
        {spaces.isLoading && <div className="table-loading">Consultando espacios…</div>}
        {!spaces.isLoading && spaces.data?.length === 0 && <div className="empty-state"><div className="empty-state__icon"><Store aria-hidden="true" /></div><h2 className="mt-4 text-lg font-bold text-ink">Todavía no hay espacios</h2><p className="mt-2 text-sm text-muted">Crea el primero arriba para comenzar a recibir pedidos en mesa.</p></div>}
        <div className="grid gap-4 lg:grid-cols-2">{spaces.data?.map((space) => <SpaceCard key={space.id} space={space} onToggle={() => update.mutate({ id: space.id, activo: !space.activo })} onRotate={() => rotate.mutate(space.id)} />)}</div>
      </section>
      <p className="flex items-center gap-2 text-xs leading-5 text-muted"><Link2 aria-hidden="true" className="size-4 shrink-0" />Rotar un QR invalida el enlace anterior; imprime el nuevo QR antes de volver a usar ese espacio.</p>
    </div>
  );
}
