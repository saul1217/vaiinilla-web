import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MailPlus,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  StopCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useHistory } from 'react-router-dom';
import { z } from 'zod';
import { EstablishmentStatusBadge } from '../components/status-badge';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader, SelectField } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { createIdempotencyKey } from '../lib/idempotency';
import type { PlatformEstablishment, PlatformStripeSummary } from '../types/api';

const MEXICO_TIME_ZONES = [
  { value: 'America/Mexico_City', label: 'Ciudad de México y zona centro' },
  { value: 'America/Bahia_Banderas', label: 'Bahía de Banderas, Nayarit' },
  { value: 'America/Cancun', label: 'Cancún, Quintana Roo' },
  { value: 'America/Chihuahua', label: 'Chihuahua' },
  { value: 'America/Ciudad_Juarez', label: 'Ciudad Juárez, Chihuahua' },
  { value: 'America/Hermosillo', label: 'Hermosillo, Sonora' },
  { value: 'America/Matamoros', label: 'Matamoros y frontera de Tamaulipas' },
  { value: 'America/Mazatlan', label: 'Mazatlán, Sinaloa' },
  { value: 'America/Merida', label: 'Mérida, Yucatán' },
  { value: 'America/Monterrey', label: 'Monterrey, Nuevo León' },
  { value: 'America/Ojinaga', label: 'Ojinaga, Chihuahua' },
  { value: 'America/Tijuana', label: 'Tijuana, Baja California' },
] as const;

const MEXICO_TIME_ZONE_VALUES = new Set<string>(
  MEXICO_TIME_ZONES.map(({ value }) => value),
);

function isValidIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const establishmentSchema = z.object({
  nombre: z.string().trim().min(2, 'Captura el nombre del establecimiento.'),
  slug: z
    .string()
    .trim()
    .min(2, 'Captura el identificador Web.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones medios.'),
  zona_horaria: z
    .string()
    .trim()
    .refine(isValidIanaTimeZone, 'Selecciona una zona horaria válida.'),
  hora_cierre_forzado: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/, 'Usa el formato HH:mm:ss.'),
  identificador_cliente_etiqueta: z.string().trim().min(2, 'Captura la etiqueta visible.'),
  identificador_cliente_obligatorio: z.boolean(),
});

const reasonSchema = z.object({
  motivo: z.string().trim().min(10, 'Explica el motivo con al menos 10 caracteres.').max(500),
});

const emailSchema = z.object({ email: z.string().email('Captura un correo válido.') });

type EstablishmentForm = z.infer<typeof establishmentSchema>;
type ReasonForm = z.infer<typeof reasonSchema>;
type EmailForm = z.infer<typeof emailSchema>;

const PLATFORM_STRIPE_RETURN_KEY = 'vaiinilla_platform_stripe_return';

type StripeAction = 'onboarding' | 'activate' | null;
type StripeTone = 'neutral' | 'pending' | 'ready' | 'connected' | 'warning';

interface StripePresentation {
  label: string;
  description: string;
  action: StripeAction;
  actionLabel: string | null;
  tone: StripeTone;
}

function hasBlockingStripeRequirements(stripe: PlatformStripeSummary): boolean {
  const requirements = stripe.requisitos_actuales;
  return Boolean(
    requirements.disabled_reason ||
      (Array.isArray(requirements.currently_due) && requirements.currently_due.length > 0) ||
      (Array.isArray(requirements.past_due) && requirements.past_due.length > 0) ||
      (Array.isArray(requirements.errors) && requirements.errors.length > 0),
  );
}

function stripePresentation(stripe: PlatformStripeSummary | null | undefined): StripePresentation {
  if (!stripe) {
    return {
      label: 'Sin conectar',
      description: 'Crea la cuenta Express y entrega al dueño un Account Link seguro.',
      action: 'onboarding',
      actionLabel: 'Conectar Stripe',
      tone: 'neutral',
    };
  }

  if (
    stripe.razon_deshabilitacion ||
    stripe.estado_onboarding === 'restringida' ||
    stripe.estado_onboarding === 'deshabilitada' ||
    hasBlockingStripeRequirements(stripe)
  ) {
    return {
      label: 'Revisar requisitos',
      description: 'Stripe reporta requisitos pendientes o una restricción en la cuenta.',
      action: 'onboarding',
      actionLabel: 'Revisar requisitos',
      tone: 'warning',
    };
  }

  if (stripe.stripe_enabled && stripe.charges_enabled && stripe.payouts_enabled) {
    return {
      label: 'Stripe conectado',
      description: 'La cuenta está habilitada y activa para recibir pagos de este establecimiento.',
      action: null,
      actionLabel: null,
      tone: 'connected',
    };
  }

  if (stripe.charges_enabled && stripe.payouts_enabled) {
    return {
      label: 'Lista para activar',
      description: 'Stripe confirmó las capacidades necesarias; activa la integración localmente.',
      action: 'activate',
      actionLabel: 'Activar Stripe',
      tone: 'ready',
    };
  }

  if (!stripe.details_submitted || stripe.estado_onboarding === 'pendiente') {
    return {
      label: 'Continuar configuración',
      description: 'El dueño todavía debe completar la información de la cuenta Express.',
      action: 'onboarding',
      actionLabel: 'Continuar configuración',
      tone: 'pending',
    };
  }

  return {
    label: 'En revisión',
    description: 'Stripe está revisando la cuenta. El webhook actualizará este estado.',
    action: null,
    actionLabel: null,
    tone: 'pending',
  };
}

function rememberStripeReturn(establishmentId: string): void {
  try {
    window.sessionStorage.setItem(
      PLATFORM_STRIPE_RETURN_KEY,
      JSON.stringify({ establishmentId }),
    );
  } catch {
    // La redirección sigue siendo segura aunque el almacenamiento no esté disponible.
  }
}

function readStripeReturn(): string | null {
  try {
    const raw = window.sessionStorage.getItem(PLATFORM_STRIPE_RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { establishmentId?: unknown };
    return typeof parsed.establishmentId === 'string' ? parsed.establishmentId : null;
  } catch {
    return null;
  }
}

function forgetStripeReturn(): void {
  try {
    window.sessionStorage.removeItem(PLATFORM_STRIPE_RETURN_KEY);
  } catch {
    // No hay estado sensible que deba bloquear el flujo si storage está deshabilitado.
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof VaiinillaApiError && error.status === 401;
}

export function EstablishmentsPage() {
  const { platform, clearPlatform } = useSessions();
  const history = useHistory();
  const token = platform?.token ?? '';
  const queryClient = useQueryClient();
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'todos' | 'activo' | 'suspendido'>('todos');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<PlatformEstablishment | null>(null);
  const [statusAction, setStatusAction] = useState<'suspender' | 'reactivar' | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resumedEstablishmentId] = useState<string | null>(readStripeReturn);

  const redirectToPlatformAccess = useCallback((establishmentId?: string) => {
    if (establishmentId) rememberStripeReturn(establishmentId);
    clearPlatform();
    history.replace({
      pathname: '/plataforma/acceso',
      state: { from: '/plataforma/establecimientos' },
    });
  }, [clearPlatform, history]);

  const establishments = useInfiniteQuery({
    queryKey: ['platform-establishments', status, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.listEstablishments(token, {
        estado: status === 'todos' ? undefined : status,
        query: search || undefined,
        cursor: pageParam,
        limit: 20,
      }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (token && isUnauthorized(establishments.error)) redirectToPlatformAccess();
  }, [establishments.error, redirectToPlatformAccess, token]);

  const rows = useMemo(
    () => establishments.data?.pages.flatMap((page) => page.establishments) ?? [],
    [establishments.data],
  );

  useEffect(() => {
    if (!resumedEstablishmentId) return;
    if (!rows.some((establishment) => establishment.id === resumedEstablishmentId)) return;
    forgetStripeReturn();
  }, [resumedEstablishmentId, rows]);

  async function refresh(message: string) {
    setNotice(message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['platform-establishments'] }),
      queryClient.invalidateQueries({ queryKey: ['platform-summary'] }),
    ]);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Super Admin"
        title="Establecimientos"
        description="Configura el contexto global sin entrar a pedidos, saldos o movimientos financieros."
        action={
          <Button onClick={() => { setSelected(null); setFormMode('create'); setNotice(null); }}>
            <Plus aria-hidden="true" className="size-5" /> Crear establecimiento
          </Button>
        }
      />

      {notice && <Feedback tone="success">{notice}</Feedback>}
      {resumedEstablishmentId && rows.some((establishment) => establishment.id === resumedEstablishmentId) && (
        <Feedback tone="info">Sesión recuperada. Revisa nuevamente el estado de Stripe del establecimiento seleccionado.</Feedback>
      )}
      {establishments.isError && <Feedback tone="error">{errorMessage(establishments.error)}</Feedback>}

      <div className="establishment-toolbar">
        <form
          className="search-box"
          role="search"
          onSubmit={(event) => { event.preventDefault(); setSearch(draftSearch.trim()); }}
        >
          <Search aria-hidden="true" />
          <label htmlFor="establishment-search" className="sr-only">Buscar establecimientos</label>
          <input
            id="establishment-search"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Buscar por nombre"
          />
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
        <div className="filter-bar" role="group" aria-label="Estado del establecimiento">
          {(['todos', 'activo', 'suspendido'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${status === value ? 'filter-chip--active' : ''}`}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {value === 'todos' ? 'Todos' : value === 'activo' ? 'Activos' : 'Suspendidos'}
            </button>
          ))}
        </div>
      </div>

      <section className="establishment-grid" aria-label="Lista de establecimientos">
        {establishments.isPending ? (
          [0, 1, 2].map((item) => <div key={item} className="establishment-card establishment-card--skeleton" />)
        ) : rows.length ? (
          rows.map((establishment) => (
            <article
              className={`establishment-card ${resumedEstablishmentId === establishment.id ? 'establishment-card--highlighted' : ''}`}
              key={establishment.id}
            >
              <div className="establishment-card__header">
                <span className="establishment-card__icon"><Building2 aria-hidden="true" /></span>
                <EstablishmentStatusBadge status={establishment.estado} />
              </div>
              <h2>{establishment.nombre}</h2>
              <p className="establishment-card__slug">/{establishment.slug}</p>
              <dl className="establishment-card__details">
                <div><dt>Zona horaria</dt><dd>{establishment.zona_horaria}</dd></div>
                <div><dt>Cierre forzado</dt><dd>{establishment.hora_cierre_forzado}</dd></div>
                <div><dt>Identificador</dt><dd>{establishment.identificador_cliente_etiqueta}{establishment.identificador_cliente_obligatorio ? ' · obligatorio' : ''}</dd></div>
              </dl>
              {establishment.estado === 'suspendido' && establishment.motivo_suspension && (
                <div className="suspension-note"><strong>Motivo:</strong> {establishment.motivo_suspension}</div>
              )}
              <StripeStatusPanel
                establishment={establishment}
                token={token}
                onChanged={refresh}
                onUnauthorized={redirectToPlatformAccess}
              />
              <div className="establishment-card__actions">
                <button type="button" onClick={() => { setSelected(establishment); setFormMode('edit'); }}>
                  <Pencil aria-hidden="true" /> Configurar
                </button>
                <button type="button" onClick={() => { setSelected(establishment); setInviteOpen(true); }}>
                  <MailPlus aria-hidden="true" /> Primer admin
                </button>
                <button
                  type="button"
                  className={establishment.estado === 'activo' ? 'danger-action' : ''}
                  onClick={() => {
                    setSelected(establishment);
                    setStatusAction(establishment.estado === 'activo' ? 'suspender' : 'reactivar');
                  }}
                >
                  {establishment.estado === 'activo' ? <StopCircle aria-hidden="true" /> : <PlayCircle aria-hidden="true" />}
                  {establishment.estado === 'activo' ? 'Suspender' : 'Reactivar'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="col-span-full">
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title="No se encontraron establecimientos"
              description="Ajusta la búsqueda o crea el primer establecimiento de la plataforma."
            />
          </div>
        )}
      </section>

      {establishments.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={establishments.isFetchingNextPage}
            onClick={() => void establishments.fetchNextPage()}
          >
            Cargar más establecimientos
          </Button>
        </div>
      )}

      <EstablishmentFormModal
        open={formMode !== null}
        mode={formMode ?? 'create'}
        token={token}
        establishment={selected}
        onOpenChange={(open) => { if (!open) { setFormMode(null); setSelected(null); } }}
        onSaved={async (mode) => {
          setFormMode(null);
          setSelected(null);
          await refresh(mode === 'create' ? 'Establecimiento creado y acción auditada.' : 'Configuración guardada y acción auditada.');
        }}
      />

      <StatusModal
        open={statusAction !== null}
        token={token}
        action={statusAction ?? 'suspender'}
        establishment={selected}
        onOpenChange={(open) => { if (!open) { setStatusAction(null); setSelected(null); } }}
        onChanged={async (action) => {
          setStatusAction(null);
          setSelected(null);
          await refresh(action === 'suspender' ? 'Establecimiento suspendido y acción auditada.' : 'Establecimiento reactivado y acción auditada.');
        }}
      />

      <InviteAdminModal
        open={inviteOpen}
        token={token}
        establishment={selected}
        onOpenChange={(open) => { setInviteOpen(open); if (!open) setSelected(null); }}
        onInvited={async () => {
          setInviteOpen(false);
          setSelected(null);
          await refresh('Invitación del primer administrador enviada y acción auditada.');
        }}
      />
    </div>
  );
}

function StripeStatusPanel({
  establishment,
  token,
  onChanged,
  onUnauthorized,
}: {
  establishment: PlatformEstablishment;
  token: string;
  onChanged: (message: string) => Promise<void>;
  onUnauthorized: (establishmentId?: string) => void;
}) {
  const [accountLinkUrl, setAccountLinkUrl] = useState<string | null>(null);
  const presentation = stripePresentation(establishment.stripe);
  const account = establishment.stripe;
  const suspended = establishment.estado === 'suspendido';
  const onboarding = useMutation({
    mutationFn: (idempotencyKey: string) =>
      api.createPlatformStripeOnboarding(token, establishment.id, idempotencyKey),
    onSuccess: (result) => {
      setAccountLinkUrl(result.account_link_url);
      window.open(result.account_link_url, '_blank', 'noopener,noreferrer');
      void onChanged('Account Link de Stripe generado. El dueño debe completar la configuración.');
    },
    onError: (error) => {
      if (isUnauthorized(error)) onUnauthorized(establishment.id);
    },
  });
  const refreshStatus = useMutation({
    mutationFn: () => api.getPlatformStripeConfiguration(token, establishment.id),
    onSuccess: () => {
      void onChanged('Estado de Stripe actualizado desde el backend.');
    },
    onError: (error) => {
      if (isUnauthorized(error)) onUnauthorized(establishment.id);
    },
  });
  const configure = useMutation({
    mutationFn: (stripeEnabled: boolean) =>
      api.configurePlatformStripe(
        token,
        establishment.id,
        stripeEnabled,
        createIdempotencyKey(),
      ),
    onSuccess: () => {
      void onChanged('Stripe quedó activado para este establecimiento.');
    },
    onError: (error) => {
      if (isUnauthorized(error)) onUnauthorized(establishment.id);
    },
  });

  const loading = onboarding.isPending || refreshStatus.isPending || configure.isPending;
  const actionDisabled = suspended || loading;
  const actionLabel = suspended && presentation.action
    ? 'Reactiva el establecimiento'
    : presentation.actionLabel;

  function runAction() {
    if (suspended || !presentation.action) return;
    if (presentation.action === 'onboarding') onboarding.mutate(createIdempotencyKey());
    else configure.mutate(true);
  }

  return (
    <section className={`stripe-panel stripe-panel--${presentation.tone}`} aria-label="Stripe Connect">
      <div className="stripe-panel__header">
        <div className="stripe-panel__title">
          <span className="stripe-panel__icon">
            {presentation.tone === 'warning' ? (
              <AlertTriangle aria-hidden="true" />
            ) : presentation.tone === 'connected' ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <CreditCard aria-hidden="true" />
            )}
          </span>
          <div>
            <p>Stripe Connect</p>
            <strong>{presentation.label}</strong>
          </div>
        </div>
        {account && <span className="stripe-panel__account">Cuenta vinculada</span>}
      </div>
      <p className="stripe-panel__description">{presentation.description}</p>
      {(onboarding.isError || refreshStatus.isError || configure.isError) && (
        <Feedback tone="error">
          {errorMessage(onboarding.error ?? refreshStatus.error ?? configure.error)}
        </Feedback>
      )}
      <div className="stripe-panel__actions">
        {actionLabel && (
          <Button
            type="button"
            variant={presentation.action === 'activate' ? 'primary' : 'secondary'}
            loading={loading}
            disabled={actionDisabled}
            onClick={runAction}
          >
            {actionLabel}
          </Button>
        )}
        {account && (
          <button
            type="button"
            className="stripe-panel__refresh"
            disabled={loading}
            onClick={() => refreshStatus.mutate()}
          >
            <RefreshCw aria-hidden="true" className={refreshStatus.isPending ? 'spin' : ''} />
            Actualizar estado
          </button>
        )}
        {accountLinkUrl && (
          <a
            className="button button--secondary stripe-panel__link"
            href={accountLinkUrl}
            target="_blank"
            rel="noreferrer"
          >
            Abrir Account Link <ExternalLink aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}

function EstablishmentFormModal({
  open,
  mode,
  token,
  establishment,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  token: string;
  establishment: PlatformEstablishment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (mode: 'create' | 'edit') => Promise<void>;
}) {
  const defaults: EstablishmentForm = establishment
    ? {
        nombre: establishment.nombre,
        slug: establishment.slug,
        zona_horaria: establishment.zona_horaria,
        hora_cierre_forzado: establishment.hora_cierre_forzado,
        identificador_cliente_etiqueta: establishment.identificador_cliente_etiqueta,
        identificador_cliente_obligatorio: establishment.identificador_cliente_obligatorio,
      }
    : {
        nombre: '',
        slug: '',
        zona_horaria: 'America/Mexico_City',
        hora_cierre_forzado: '18:00:00',
        identificador_cliente_etiqueta: 'Matrícula',
        identificador_cliente_obligatorio: true,
      };

  const form = useForm<EstablishmentForm>({ resolver: zodResolver(establishmentSchema), values: defaults });
  const currentTimeZone = establishment?.zona_horaria;
  const hasTimeZoneOutsideMexicoList = Boolean(
    currentTimeZone && !MEXICO_TIME_ZONE_VALUES.has(currentTimeZone),
  );
  const mutation = useMutation({
    mutationFn: (input: EstablishmentForm) =>
      mode === 'create'
        ? api.createEstablishment(token, input)
        : api.updateEstablishment(token, establishment?.id ?? '', input),
    onSuccess: () => onSaved(mode),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? 'Crear establecimiento' : 'Configurar establecimiento'}
      description="El estado no se modifica desde este formulario. Suspender o reactivar requiere una confirmación y un motivo separados."
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form className="form-grid" onSubmit={(event) => void form.handleSubmit((data) => mutation.mutate(data))(event)}>
        <Field label="Nombre" error={form.formState.errors.nombre?.message} {...form.register('nombre')} />
        <Field label="Slug" hint="Ejemplo: cafeteria-centro" error={form.formState.errors.slug?.message} {...form.register('slug')} />
        <SelectField
          label="Zona horaria"
          hint="Selecciona la ciudad más cercana; se usa para cierres, reportes y cashback."
          error={form.formState.errors.zona_horaria?.message}
          {...form.register('zona_horaria')}
        >
          {hasTimeZoneOutsideMexicoList && currentTimeZone && (
            <optgroup label="Configuración actual">
              <option value={currentTimeZone}>{currentTimeZone}</option>
            </optgroup>
          )}
          <optgroup label="México">
            {MEXICO_TIME_ZONES.map(({ value, label }) => (
              <option key={value} value={value}>{label} — {value}</option>
            ))}
          </optgroup>
        </SelectField>
        <Field label="Cierre forzado" inputMode="numeric" error={form.formState.errors.hora_cierre_forzado?.message} {...form.register('hora_cierre_forzado')} />
        <Field label="Etiqueta del identificador" error={form.formState.errors.identificador_cliente_etiqueta?.message} {...form.register('identificador_cliente_etiqueta')} />
        <label className="checkbox-field">
          <input type="checkbox" {...form.register('identificador_cliente_obligatorio')} />
          <span><strong>Identificador obligatorio</strong><small>El cliente deberá capturarlo para completar su contexto.</small></span>
        </label>
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{mode === 'create' ? 'Crear' : 'Guardar cambios'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function StatusModal({
  open,
  token,
  action,
  establishment,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  token: string;
  action: 'suspender' | 'reactivar';
  establishment: PlatformEstablishment | null;
  onOpenChange: (open: boolean) => void;
  onChanged: (action: 'suspender' | 'reactivar') => Promise<void>;
}) {
  const form = useForm<ReasonForm>({ resolver: zodResolver(reasonSchema), defaultValues: { motivo: '' } });
  const mutation = useMutation({
    mutationFn: ({ motivo }: ReasonForm) => api.changeEstablishmentStatus(token, establishment?.id ?? '', action, motivo),
    onSuccess: () => onChanged(action),
  });
  const suspending = action === 'suspender';

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) { form.reset(); mutation.reset(); } }}
      title={`${suspending ? 'Suspender' : 'Reactivar'} ${establishment?.nombre ?? 'establecimiento'}`}
      description={suspending ? 'Lee el efecto operativo antes de confirmar.' : 'La operación nueva volverá a estar disponible después de confirmar.'}
    >
      {suspending && (
        <div className="suspension-warning">
          <StopCircle aria-hidden="true" />
          <div>
            <strong>La suspensión no cancela ni mueve dinero.</strong>
            <p>Bloquea operaciones nuevas, pero permite terminar pedidos activos y cerrar la Caja que ya estaba abierta.</p>
          </div>
        </div>
      )}
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form className="mt-5 space-y-5" onSubmit={(event) => void form.handleSubmit((data) => mutation.mutate(data))(event)}>
        <label className="field">
          <span className="field__label">Motivo auditado</span>
          <textarea className="field__control min-h-28 resize-y" maxLength={500} {...form.register('motivo')} />
          {form.formState.errors.motivo?.message && <span className="field__error">{form.formState.errors.motivo.message}</span>}
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" variant={suspending ? 'danger' : 'primary'} loading={mutation.isPending}>
            {suspending ? 'Confirmar suspensión' : 'Confirmar reactivación'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InviteAdminModal({
  open,
  token,
  establishment,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  token: string;
  establishment: PlatformEstablishment | null;
  onOpenChange: (open: boolean) => void;
  onInvited: () => Promise<void>;
}) {
  const form = useForm<EmailForm>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const mutation = useMutation({
    mutationFn: ({ email }: EmailForm) => api.inviteFirstAdmin(token, establishment?.id ?? '', email),
    onSuccess: onInvited,
  });
  return (
    <Modal
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) { form.reset(); mutation.reset(); } }}
      title="Invitar primer administrador"
      description={`La invitación pertenecerá únicamente a ${establishment?.nombre ?? 'este establecimiento'}.`}
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form className="space-y-5" onSubmit={(event) => void form.handleSubmit((data) => mutation.mutate(data))(event)}>
        <Field label="Correo del administrador" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register('email')} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Enviar invitación</Button>
        </div>
      </form>
    </Modal>
  );
}
