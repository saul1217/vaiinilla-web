import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Copy,
  Download,
  ExternalLink,
  ImageIcon,
  Nfc,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Table2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, CustomSelect, Feedback, Field, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { parseHourlyPrice } from '../lib/hourly-price';
import { canWriteNfc, writeNfcUrl } from '../lib/nfc-tag';
import {
  addFeature,
  COURT_FEATURE_SUGGESTIONS,
  MAX_DESCRIPTION_LENGTH,
  MAX_FEATURE_LENGTH,
  MAX_FEATURES,
  removeFeature,
  sameFeatures,
} from '../lib/space-features';
import type { BookingSettingsInput, ManagedSpace, SpaceType, SpaceUpdateInput } from '../types/api';

const typeLabels: Record<SpaceType, string> = {
  mesa: 'Mesa',
  barra: 'Barra',
  cancha: 'Cancha',
  drive_thru: 'Drive-thru',
  asiento: 'Asiento',
};

function HourlyPrice({ space, onSave }: { space: ManagedSpace; onSave: (price: string | null) => void }) {
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? space.precio_hora ?? '';
  const setDraft = setEdited;
  const parsed = parseHourlyPrice(draft);
  const changed = parsed !== undefined && parsed !== space.precio_hora;
  return (
    <form
      className="swap-enter grid gap-2 rounded-2xl bg-cream p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) onSave(parsed);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end [&>*]:min-w-0">
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

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Foto, descripción y características que ven los clientes antes de rentar la cancha. */
function SpaceProfile({
  space,
  saving,
  onSave,
  onUploadImage,
  onRemoveImage,
}: {
  space: ManagedSpace;
  saving: boolean;
  onSave: (input: { descripcion: string | null; caracteristicas: string[] }) => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(space.descripcion ?? '');
  const savedDescription = space.descripcion ?? null;
  const savedFeatures = space.caracteristicas ?? [];
  const [features, setFeatures] = useState(savedFeatures);
  const [draftFeature, setDraftFeature] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const changed =
    (description.trim() || null) !== savedDescription || !sameFeatures(features, savedFeatures);
  const full = features.length >= MAX_FEATURES;
  const suggestions = COURT_FEATURE_SUGGESTIONS.filter(
    (suggestion) => !features.some((feature) => feature.toLocaleLowerCase('es') === suggestion.toLocaleLowerCase('es')),
  );

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setImageError('La foto debe ser JPG, PNG o WebP.');
    if (file.size > MAX_IMAGE_BYTES) return setImageError('La foto no puede pesar más de 5 MB.');
    setImageError(null);
    onUploadImage(file);
  }

  function addDraftFeature() {
    setFeatures((current) => addFeature(current, draftFeature));
    setDraftFeature('');
  }

  return (
    <form
      className="swap-enter grid gap-4 rounded-2xl bg-cream p-4"
      aria-label={`Ficha de ${space.nombre}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) onSave({ descripcion: description.trim() || null, caracteristicas: features });
      }}
    >
      <div>
        <p className="text-sm font-extrabold text-ink">Ficha de la cancha</p>
        <p className="mt-1 text-xs leading-5 text-muted">Tus clientes la ven antes de rentar. Todo es opcional.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid aspect-[4/3] w-40 place-items-center overflow-hidden rounded-xl bg-white-warm">
          {space.imagen_url ? (
            <img src={space.imagen_url} alt={`Foto de ${space.nombre}`} className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-8 text-muted" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => imageInput.current?.click()}>
            <UploadCloud aria-hidden="true" className="size-4" />
            {space.imagen_url ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          <input
            ref={imageInput}
            className="sr-only"
            type="file"
            aria-label={`Elegir foto de ${space.nombre}`}
            accept={IMAGE_TYPES.join(',')}
            onChange={(event) => {
              chooseImage(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {space.imagen_url && (
            <Button type="button" variant="ghost" onClick={onRemoveImage}>
              <Trash2 aria-hidden="true" className="size-4" /> Quitar foto
            </Button>
          )}
        </div>
        {imageError && (
          <p className="field__error w-full" role="alert">
            {imageError}
          </p>
        )}
      </div>
      <label className="field">
        <span className="field__label">Descripción</span>
        <textarea
          className="field__control min-h-20 resize-y"
          name={`descripcion-${space.id}`}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Cancha techada de vidrio, a un lado de la barra."
        />
      </label>
      <div className="grid gap-2">
        <span className="field__label">Características</span>
        {features.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Características">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-1 rounded-full bg-lime px-3 py-1 text-sm font-bold text-ink">
                {feature}
                <button
                  type="button"
                  className="grid size-5 place-items-center rounded-full hover:bg-ink/10"
                  aria-label={`Quitar ${feature}`}
                  onClick={() => setFeatures((current) => removeFeature(current, feature))}
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            className="field__control min-w-40 flex-1"
            aria-label="Nueva característica"
            value={draftFeature}
            maxLength={MAX_FEATURE_LENGTH}
            disabled={full}
            placeholder={full ? `Máximo ${MAX_FEATURES}` : 'Ej. Con luz'}
            onChange={(event) => setDraftFeature(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addDraftFeature();
              }
            }}
          />
          <Button type="button" variant="ghost" disabled={full || !draftFeature.trim()} onClick={addDraftFeature}>
            <Plus aria-hidden="true" className="size-4" /> Agregar
          </Button>
        </div>
        {!full && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold text-muted hover:text-ink"
                onClick={() => setFeatures((current) => addFeature(current, suggestion))}
              >
                + {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <Button type="submit" loading={saving} disabled={!changed}>
          Guardar ficha
        </Button>
      </div>
    </form>
  );
}

const MAX_BATCH = 500;

/** Crear muchos espacios numerados de una vez: "Asiento 1" … "Asiento 100", cada uno con su QR. */
function BatchSpacesCard({ onCreated }: { onCreated: (message: string) => void }) {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const scopeId = tenant?.context.establecimiento_id ?? '';
  const queryClient = useQueryClient();
  const [type, setType] = useState<SpaceType>('asiento');
  const [prefix, setPrefix] = useState('Asiento');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('100');
  const start = Number(from);
  const end = Number(to);
  const validRange =
    from.trim() !== '' && to.trim() !== '' && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start;
  const count = validRange ? end - start + 1 : 0;
  const tooMany = count > MAX_BATCH;
  const label = prefix.trim();
  const create = useMutation({
    mutationFn: () => api.createSpaceBatch(token, { tipo: type, prefijo: label, desde: start, hasta: end }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] });
      const skipped = result.omitidos.length;
      onCreated(
        `${result.creados} ${result.creados === 1 ? 'espacio creado' : 'espacios creados'}` +
          (skipped > 0 ? `; ${skipped} ya existían y se omitieron.` : '.'),
      );
    },
  });
  return (
    <section className="panel-card p-5 sm:p-6" aria-labelledby="batch-spaces-title">
      <h2 id="batch-spaces-title" className="text-xl font-extrabold text-ink">
        Crear varios a la vez
      </h2>
      <p className="mt-1 text-sm text-muted">
        Para un cine, un estadio o un evento: crea asientos numerados, cada uno con su propio QR.
      </p>
      {create.isError && <Feedback tone="error">{errorMessage(create.error)}</Feedback>}
      <form
        className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_120px_120px_auto] md:items-end [&>*]:min-w-0"
        onSubmit={(event) => {
          event.preventDefault();
          if (validRange && !tooMany && label) create.mutate();
        }}
      >
        <CustomSelect
          label="Tipo"
          value={type}
          onChange={(next) => setType(next as SpaceType)}
          options={[
            { value: 'asiento', label: 'Asiento' },
            { value: 'mesa', label: 'Mesa' },
            { value: 'barra', label: 'Barra' },
            { value: 'drive_thru', label: 'Drive-thru' },
          ]}
        />
        <Field label="Nombre base" name="batch-prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} maxLength={70} required />
        <Field label="Desde" name="batch-from" type="number" min={0} value={from} onChange={(event) => setFrom(event.target.value)} required />
        <Field label="Hasta" name="batch-to" type="number" min={0} value={to} onChange={(event) => setTo(event.target.value)} required />
        <Button type="submit" loading={create.isPending} disabled={!validRange || tooMany || !label}>
          <Plus aria-hidden="true" className="size-4" />
          Crear {count > 0 ? count : ''}
        </Button>
      </form>
      <p className="mt-3 text-xs leading-5 text-muted" role="status">
        {!validRange
          ? 'Escribe el número inicial y el final (el final no puede ser menor).'
          : tooMany
            ? `Máximo ${MAX_BATCH} a la vez.`
            : `Se crearán ${count}: ${label} ${start}${count > 1 ? ` … ${label} ${end}` : ''}. Los nombres que ya existan se omiten.`}
      </p>
    </section>
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
  const sameHours = Boolean(values && values.cierre === values.apertura);
  const crossesMidnight = Boolean(values && values.cierre < values.apertura);
  const invalid = !values || sameHours || !Number.isInteger(days) || days < 0 || days > 60;
  const changed =
    Boolean(draft) && current !== undefined &&
    (draft?.apertura !== current.apertura || draft?.cierre !== current.cierre || Number(draft?.dias) !== current.dias_adelanto);
  return (
    <section className="panel-card p-5 sm:p-6" aria-labelledby="booking-settings-title">
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
          className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end [&>*]:min-w-0"
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
            error={sameHours ? 'El cierre debe ser distinto de la apertura.' : undefined}
            hint={crossesMidnight ? 'Cruza la medianoche (del día siguiente)' : undefined}
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
  onDelete,
  onRename,
  onChangeType,
  onChangePrice,
  profileSaving,
  onSaveProfile,
  onUploadImage,
  onRemoveImage,
}: {
  space: ManagedSpace;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (nombre: string) => void;
  onChangeType: (tipo: SpaceType) => void;
  onChangePrice: (price: string | null) => void;
  profileSaving: boolean;
  onSaveProfile: (input: { descripcion: string | null; caracteristicas: string[] }) => void;
  onUploadImage: (file: File) => void;
  onRemoveImage: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [nfc, setNfc] = useState<'idle' | 'waiting' | 'done' | 'error'>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(space.nombre);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
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

  async function writeTag() {
    setNfc('waiting');
    try {
      await writeNfcUrl(space.qr_url);
      setNfc('done');
    } catch {
      setNfc('error');
    }
  }

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
    <article className="panel-card space-card-enter flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lime text-ink">
            <Table2 aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {editing ? (
              <form className="swap-enter grid gap-2" onSubmit={saveName}>
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
        <span className={`status-badge shrink-0 ${space.activo ? 'status-badge--success' : 'status-badge--muted'}`}>
          {space.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <CustomSelect
        label="Tipo"
        value={space.tipo}
        onChange={(next) => onChangeType(next as SpaceType)}
        options={(Object.keys(typeLabels) as SpaceType[]).map((tipo) => ({ value: tipo, label: typeLabels[tipo] }))}
      />
      {space.tipo === 'cancha' && <HourlyPrice key={space.precio_hora ?? ''} space={space} onSave={onChangePrice} />}
      {space.tipo === 'cancha' && (
        <SpaceProfile
          key={`${space.descripcion ?? ''}|${(space.caracteristicas ?? []).join('|')}`}
          space={space}
          saving={profileSaving}
          onSave={onSaveProfile}
          onUploadImage={onUploadImage}
          onRemoveImage={onRemoveImage}
        />
      )}
      <div className="swap-enter flex items-center gap-4 rounded-2xl bg-cream p-4">
        {qr && <img src={qr} alt={`Código QR de ${space.nombre}`} width="96" height="96" className="qr-enter size-24 shrink-0 rounded-xl" />}
        <div className="min-w-0 flex-1">
          {space.codigo ? (
            <div className="mb-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted">Código de la mesa</p>
              <p className="font-mono text-3xl font-extrabold tracking-[0.25em] text-ink">{space.codigo}</p>
              <p className="text-xs leading-5 text-muted">Imprímelo junto al QR: quien no pueda escanear lo escribe en la app.</p>
            </div>
          ) : null}
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">Enlace del QR y NFC</p>
          <p className="break-all text-xs leading-5 text-ink">{space.qr_url}</p>
          {canWriteNfc() ? null : (
            <p className="mt-1 text-xs leading-5 text-muted">Para NFC, graba este enlace en la etiqueta con cualquier app de NFC.</p>
          )}
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
        {canWriteNfc() ? (
          <Button type="button" variant="ghost" onClick={() => void writeTag()} disabled={nfc === 'waiting'}>
            <Nfc aria-hidden="true" className="size-4" />
            {nfc === 'waiting'
              ? 'Acerca la etiqueta…'
              : nfc === 'done'
                ? 'Grabada'
                : nfc === 'error'
                  ? 'No se grabó, reintenta'
                  : 'Grabar en NFC'}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => {
          setDraftName(space.nombre);
          setEditing(true);
        }}>
          <Pencil aria-hidden="true" className="size-4" />
          Editar nombre
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (space.activo) {
              setConfirmingDelete(false);
              setConfirmingDeactivate(true);
            } else onToggle();
          }}
        >
          {space.activo ? 'Desactivar' : 'Activar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setConfirmingDeactivate(false);
            setConfirmingDelete(true);
          }}
        >
          Eliminar
        </Button>
      </div>
      {confirmingDeactivate && space.activo && (
        <div className="mt-4 grid gap-3 rounded-2xl bg-cream p-4" role="alertdialog" aria-label={`Desactivar ${space.nombre}`}>
          <p className="text-sm leading-6 text-ink">
            ¿Desactivar «{space.nombre}»? Dejará de estar disponible para los clientes hasta que lo actives de nuevo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingDeactivate(false);
                onToggle();
              }}
            >
              Sí, desactivar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDeactivate(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {confirmingDelete && (
        <div className="mt-4 grid gap-3 rounded-2xl bg-cream p-4">
          <p className="text-sm leading-6 text-ink">
            ¿Eliminar «{space.nombre}»? Deja de aparecer en esta lista. Sus pedidos y cuentas anteriores se conservan.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
            >
              Sí, eliminar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
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
    mutationFn: ({ id, ...input }: { id: number } & SpaceUpdateInput) => api.updateSpace(token, id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }),
  });
  const image = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File | null }) =>
      file ? api.uploadSpaceImage(token, id, file) : api.deleteSpaceImage(token, id),
    onSuccess: (_space, { file }) => setFeedback(file ? 'Foto guardada.' : 'Foto quitada.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSpace(token, id),
    onSuccess: () => setFeedback('Espacio eliminado. Su nombre queda libre para uno nuevo.'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['managed-spaces', scopeId] }),
  });
  const mutationError = create.error || update.error || image.error || remove.error;
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
      <section className="panel-card p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-ink text-white-warm">
            <Plus aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-ink">Nuevo espacio</h2>
            <p className="mt-1 text-sm text-muted">Puedes usar mesas, canchas o espacios drive-thru.</p>
          </div>
        </div>
        <form className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end [&>*]:min-w-0" onSubmit={submit}>
          <Field
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mesa 01"
            maxLength={80}
            required
          />
          <CustomSelect
            label="Tipo"
            value={type}
            onChange={(next) => setType(next as SpaceType)}
            options={(Object.keys(typeLabels) as SpaceType[]).map((tipo) => ({ value: tipo, label: typeLabels[tipo] }))}
          />
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            <Plus aria-hidden="true" className="size-4" />
            Crear espacio
          </Button>
        </form>
      </section>
      <BatchSpacesCard onCreated={setFeedback} />
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
        <div className="spaces-grid grid gap-4 lg:grid-cols-2">
          {spaces.data?.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              onToggle={() => update.mutate({ id: space.id, activo: !space.activo })}
              onDelete={() => remove.mutate(space.id)}
              onRename={(nombre) => update.mutate({ id: space.id, nombre })}
              onChangeType={(tipo) => update.mutate({ id: space.id, tipo })}
              onChangePrice={(precio_hora) => update.mutate({ id: space.id, precio_hora })}
              profileSaving={update.isPending && update.variables?.id === space.id}
              onSaveProfile={(input) =>
                update.mutate({ id: space.id, ...input }, { onSuccess: () => setFeedback('Ficha guardada.') })
              }
              onUploadImage={(file) => image.mutate({ id: space.id, file })}
              onRemoveImage={() => image.mutate({ id: space.id, file: null })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
