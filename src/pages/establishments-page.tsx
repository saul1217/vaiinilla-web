import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  MailPlus,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  StopCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { EstablishmentStatusBadge } from '../components/status-badge';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { PlatformEstablishment } from '../types/api';

const establishmentSchema = z.object({
  nombre: z.string().trim().min(2, 'Captura el nombre del establecimiento.'),
  slug: z
    .string()
    .trim()
    .min(2, 'Captura el identificador Web.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones medios.'),
  zona_horaria: z.string().trim().min(3, 'Captura una zona horaria IANA.'),
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

export function EstablishmentsPage() {
  const { platform } = useSessions();
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

  const rows = useMemo(
    () => establishments.data?.pages.flatMap((page) => page.establishments) ?? [],
    [establishments.data],
  );

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
            <article className="establishment-card" key={establishment.id}>
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
        <Field label="Zona horaria" error={form.formState.errors.zona_horaria?.message} {...form.register('zona_horaria')} />
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
