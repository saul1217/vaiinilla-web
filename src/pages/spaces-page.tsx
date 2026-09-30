import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, Download, ExternalLink, Link2, Pencil, Plus, RefreshCw, RotateCw, Store, Table2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Feedback, Field, PageHeader, SelectField } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { parseHourlyPrice } from '../lib/hourly-price';
import type { BookingSettingsInput, ManagedSpace, SpaceType } from '../types/api';

const typeLabels: Record<SpaceType, string> = {
  mesa: 'Mesa',
  barra: 'Barra',
  cancha: 'Cancha',
  drive_thru: 'Drive-thru',
};

function HourlyPrice({ space, onSave }: { space: ManagedSpace; onSave: (price: string | null) => void }) {
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? space.precio_hora ?? '';
  const setDraft = setEdited;
  const parsed = parseHourlyPrice(draft);
  const changed = parsed !== undefined && parsed !== space.precio_hora;
  return (
    <form
      className="grid gap-2 rounded-2xl bg-cream p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) {
          onSave(parsed);
          setEdited(null);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field
          label="Precio por hora (MXN)"
          name={`precio-hora-${space.id}`}
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Sin precio"
          error={parsed === undefined ? 'Escribe un monto mayor a 0, por ejemplo 300 o 300.50.' : undefined}
          hint={
            space.precio_hora
              ? 'Tus clientes y tu personal pueden rentar esta cancha. Déjalo vacío para dejar de rentarla.'
              : 'Sin precio, la cancha no se renta: se abre y se cierra a mano, como antes.'
          }
        />
        <Button type="submit" disabled={!changed}>
          Guardar precio
        </Button>
      </div>
    </form>
  );
}

function BookingSettingsCard() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ apertura: string; cierre: string; dias: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const settings = useQuery({
    queryKey: ['booking-settings', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.bookingSettings(token),
  });
  const save = useMutation({
    mutationFn: (input: BookingSettingsInput) => api.saveBookingSettings(token, input),
    onSuccess: () => {
      setDraft(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['booking-settings', scopeId] });
    },
  });
  const current = settings.data;
  const values = draft ?? (current ? { apertura: current.apertura, cierre: current.cierre, dias: String(current.dias_adelanto) } : null);
  const days = values ? Number(values.dias) : NaN;
  const invalid = !values || values.cierre <= values.apertura || !Number.isInteger(days) || days < 0 || days > 60;
  const changed =
    Boolean(draft) && current !== undefined &&
    (draft?.apertura !== current.apertura || draft?.cierre !== current.cierre || Number(draft?.dias) !== current.dias_adelanto);
  return (
    <section className="panel-card" aria-labelledby="booking-settings-title">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
          <CalendarClock aria-hidden="true" />
        </span>
        <div>
          <h2 id="booking-settings-title" className="text-xl font-extrabold text-ink">
            Horario de reservas
          </h2>
          <p className="mt-1 text-sm text-muted">
            Las canchas con precio se rentan dentro de este horario{current ? ` (hora de ${current.zona_horaria})` : ''}.
          </p>
        </div>
      </div>
      {settings.isError && <Feedback tone="error">{errorMessage(settings.error)}</Feedback>}
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      {saved && !save.isError && <Feedback tone="success">Horario guardado.</Feedback>}
      {values && (
        <form
          className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setSaved(false);
            if (!invalid && changed) save.mutate({ apertura: values.apertura, cierre: values.cierre, dias_adelanto: days });
          }}
        >
          <Field
            label="Abre"
            name="booking-open"
            type="time"
            value={values.apertura}
            onChange={(event) => setDraft({ ...values, apertura: event.target.value })}
            required
          />
          <Field
            label="Cierra"
            name="booking-close"
            type="time"
            value={values.cierre}
            onChange={(event) => setDraft({ ...values, cierre: event.target.value })}
            error={values.cierre <= values.apertura ? 'Debe cerrar después de abrir.' : undefined}
            required
          />
          <Field
            label="Días de anticipación"
            name="booking-days"
            type="number"
            min={0}
            max={60}
            value={values.dias}
            onChange={(event) => setDraft({ ...values, dias: event.target.value })}
            required
          />
          <Button type="submit" loading={save.isPending} disabled={invalid || !changed}>
            Guardar horario
          </Button>
        </form>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">
        Días de anticipación: cuántos días adelante se puede reservar (de 0 a 60).
      </p>
    </section>
  );
}

function SpaceCard({
  space,
  onToggle,
  onRotate,
  onRename,
  onChangeType,
  onChangePrice,
}: {
  space: ManagedSpace;
  onToggle: () => void;
  onRotate: () => void;
  onRename: (nombre: string) => void;
  onChangeType: (tipo: SpaceType) => void;
  onChangePrice: (price: string | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(space.nombre);
  const nameValue = editing ? draftName : space.nombre;

  useEffect(() => {
    let mounted = true;
    void QRCode.toDataURL(space.qr_url, { margin: 2, width: 180, color: { dark: '#16150F', light: '#FBF9F2' } }).then(
      (value) => {
        if (mounted) setQr(value);
      },
    );
    return () => {
      mounted = false;
    };
  }, [space.qr_url]);

  async function copyUrl() {
    await navigator.clipboard.writeText(space.qr_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function saveName(event: FormEvent) {
    event.preventDefault();
    const next = draftName.trim();
    if (!next || next === space.nombre) {
      setEditing(false);
      setDraftName(space.nombre);
      return;
    }
    onRename(next);
    setEditing(false);
  }

  return (
    <article className="panel-card flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-lime text-ink">
            <Table2 aria-hidden="true" />
          </span>
          <div>
            {editing ? (
              <form className="grid gap-2" onSubmit={saveName}>
                <Field
                  label="Nombre"
                  value={nameValue}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={80}
                  required
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Guardar</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setDraftName(space.nombre);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-ink">{space.nombre}</h2>
                <p className="text-sm text-muted">{typeLabels[space.tipo]}</p>
              </>
            )}
          </div>
        </div>
        <span className={`status-badge ${space.activo ? 'status-badge--success' : 'status-badge--muted'}`}>
          {space.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <SelectField
        label="Tipo"
        value={space.tipo}
        onChange={(event) => onChangeType(event.target.value as SpaceType)}
      >
        <option value="mesa">Mesa</option>
        <option value="barra">Barra</option>
        <option value="cancha">Cancha</option>
        <option value="drive_thru">Drive-thru</option>
      </SelectField>
      {space.tipo === 'cancha' && <HourlyPrice space={space} onSave={onChangePrice} />}
      <div className="flex items-center gap-4 rounded-2xl bg-cream p-4">
        {qr && <img src={qr} alt={`Código QR de ${space.nombre}`} width="96" height="96" className="size-24 rounded-xl" />}
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">Enlace del QR</p>
          <p className="break-all text-xs leading-5 text-ink">{space.qr_url}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copyUrl()}>
          <Copy aria-hidden="true" className="size-4" />
          {copied ? 'Copiado' : 'Copiar enlace'}
        </Button>
        {qr ? (
          <a className="button button--ghost" href={qr} download={`${space.nombre.replace(/\s+/g, '-')}-qr.png`}>
            <Download aria-hidden="true" className="size-4" />
            Descargar QR
          </a>
        ) : null}
        <a className="button button--ghost" href={space.qr_url} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" className="size-4" />
          Abrir
        </a>
        <Button type="button" variant="ghost" onClick={() => {
          setDraftName(space.nombre);
          setEditing(true);
        }}>
          <Pencil aria-hidden="true" className="size-4" />
          Editar nombre
        </Button>
        <Button type="button" variant="ghost" onClick={onRotate}>
          <RotateCw aria-hidden="true" className="size-4" />
          Rotar QR
        </Button>
        <Button type="button" variant="ghost" onClick={onToggle}>
          {space.activo ? 'Desactivar' : 'Activar'}
        </Button>
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
  const spaces = useQuery({
    queryKey: ['managed-spaces', scopeId],
    enabled: Boolean(token),
    queryFn: () => api.listManagedSpaces(token),
  });
  const create = useMutation({
    mutationFn: () => api.createSpace(token, { nombre: name.trim(), tipo: type }),
    onSuccess: () => {
      setName('');
      setFeedback('Espacio creado. El enlace ya puede convertirse en QR.');
      void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: number; nombre?: string; tipo?: SpaceType; activo?: boolean; precio_hora?: string | null }) =>
      api.updateSpace(token, id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }),
  });
  const rotate = useMutation({
    mutationFn: (id: number) => api.rotateSpaceQr(token, id),
    onSuccess: () => setFeedback('QR rotado. El enlace anterior dejó de resolver.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }),
  });
  const mutationError = create.error || update.error || rotate.error;
  function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    if (name.trim()) create.mutate();
  }
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operación del establecimiento"
        title="Mesas y espacios"
        description="Crea espacios para que tus clientes puedan pedir desde un QR. Los enlaces pertenecen únicamente a este establecimiento."
      />
      {feedback && <Feedback tone="success">{feedback}</Feedback>}
      {mutationError && <Feedback tone="error">{errorMessage(mutationError)}</Feedback>}
      {spaces.isError && <Feedback tone="error">{errorMessage(spaces.error)}</Feedback>}
      <section className="panel-card">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
            <Plus aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-ink">Nuevo espacio</h2>
            <p className="mt-1 text-sm text-muted">Puedes usar mesas, canchas o espacios drive-thru.</p>
          </div>
        </div>
        <form className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end" onSubmit={submit}>
          <Field
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mesa 01"
            maxLength={80}
            required
          />
          <SelectField label="Tipo" value={type} onChange={(event) => setType(event.target.value as SpaceType)}>
            <option value="mesa">Mesa</option>
            <option value="barra">Barra</option>
            <option value="cancha">Cancha</option>
            <option value="drive_thru">Drive-thru</option>
          </SelectField>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            <Plus aria-hidden="true" className="size-4" />
            Crear espacio
          </Button>
        </form>
      </section>
      {spaces.data?.some((space) => space.tipo === 'cancha') && <BookingSettingsCard />}
      <section className="space-y-4" aria-labelledby="spaces-list-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Inventario operativo</p>
            <h2 id="spaces-list-title" className="mt-1 text-2xl font-extrabold text-ink">
              Tus espacios
            </h2>
          </div>
          <Button type="button" variant="ghost" onClick={() => void spaces.refetch()}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Actualizar
          </Button>
        </div>
        {spaces.isLoading && <div className="table-loading">Consultando espacios…</div>}
        {!spaces.isLoading && !spaces.isError && spaces.data?.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">
              <Store aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-ink">Todavía no hay espacios</h2>
            <p className="mt-2 text-sm text-muted">Crea el primero arriba para comenzar a recibir pedidos en mesa.</p>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {spaces.data?.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              onToggle={() => update.mutate({ id: space.id, activo: !space.activo })}
              onRotate={() => rotate.mutate(space.id)}
              onRename={(nombre) => update.mutate({ id: space.id, nombre })}
              onChangeType={(tipo) => update.mutate({ id: space.id, tipo })}
              onChangePrice={(precio_hora) => update.mutate({ id: space.id, precio_hora })}
            />
          ))}
        </div>
      </section>
      <p className="flex items-center gap-2 text-xs leading-5 text-muted">
        <Link2 aria-hidden="true" className="size-4 shrink-0" />
        Rotar un QR invalida el enlace anterior; imprime el nuevo QR antes de volver a usar ese espacio.
      </p>
    </div>
  );
}
