import { zodResolver } from '@hookform/resolvers/zod';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, MoreHorizontal, RefreshCw, UserPlus, UserX, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { InvitationStatusBadge } from '../components/status-badge';
import { Button, EmptyState, Feedback, Field, Modal, PageHeader } from '../components/ui';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { InvitationRole, InvitationStatus, StaffInvitation, StaffMembership } from '../types/api';

const invitationSchema = z.object({
  email: z.string().email('Captura un correo válido.'),
  rol: z.enum(['cajero', 'cocina', 'mesero', 'admin']),
});

type InvitationForm = z.infer<typeof invitationSchema>;

const filters: Array<{ value: 'todas' | InvitationStatus; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aceptada', label: 'Aceptadas' },
  { value: 'expirada', label: 'Expiradas' },
  { value: 'revocada', label: 'Revocadas' },
  { value: 'reemplazada', label: 'Reemplazadas' },
];

export function InvitationsPage() {
  const { tenant } = useSessions();
  const token = tenant?.token ?? '';
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'todas' | InvitationStatus>('todas');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<StaffInvitation | null>(null);
  const [action, setAction] = useState<'revocar' | 'reenviar' | null>(null);
  const [membershipAction, setMembershipAction] = useState<'editar' | 'desactivar' | null>(null);
  const [selectedMembership, setSelectedMembership] = useState<StaffMembership | null>(null);
  const [membershipRole, setMembershipRole] = useState<InvitationRole>('cajero');
  const [notice, setNotice] = useState<string | null>(null);

  const invitations = useInfiniteQuery({
    queryKey: ['invitations', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.listInvitations(token, {
        estado: filter === 'todas' ? undefined : filter,
        cursor: pageParam,
        limit: 20,
      }),
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: Boolean(token),
  });

  const rows = useMemo(
    () => invitations.data?.pages.flatMap((page) => page.invitations) ?? [],
    [invitations.data],
  );

  const memberships = useQuery({
    queryKey: ['staff-memberships'],
    queryFn: () => api.listStaffMemberships(token),
    enabled: Boolean(token),
  });

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !action) throw new Error('Selecciona una invitación.');
      return action === 'revocar'
        ? api.revokeInvitation(token, selected.id)
        : api.resendInvitation(token, selected.id);
    },
    onSuccess: async () => {
      setNotice(action === 'revocar' ? 'Invitación revocada correctamente.' : 'Nueva invitación enviada correctamente.');
      setSelected(null);
      setAction(null);
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const membershipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMembership || !membershipAction) throw new Error('Selecciona un acceso.');
      return membershipAction === 'editar'
        ? api.updateStaffMembership(token, selectedMembership.id, membershipRole)
        : api.deactivateStaffMembership(token, selectedMembership.id);
    },
    onSuccess: async () => {
      setNotice(membershipAction === 'editar' ? 'Rol actualizado correctamente.' : 'Acceso desactivado correctamente.');
      setSelectedMembership(null);
      setMembershipAction(null);
      await queryClient.invalidateQueries({ queryKey: ['staff-memberships'] });
    },
  });

  function confirm(invitation: StaffInvitation, nextAction: 'revocar' | 'reenviar') {
    setSelected(invitation);
    setAction(nextAction);
    setNotice(null);
    actionMutation.reset();
  }

  function editMembership(membership: StaffMembership) {
    setSelectedMembership(membership);
    setMembershipRole(membership.rol);
    setMembershipAction('editar');
    setNotice(null);
    membershipMutation.reset();
  }

  function deactivateMembership(membership: StaffMembership) {
    setSelectedMembership(membership);
    setMembershipAction('desactivar');
    setNotice(null);
    membershipMutation.reset();
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administración"
        title="Personal e invitaciones"
        description="Cada acceso pertenece únicamente a este establecimiento y se activa con una invitación válida de un solo uso."
        action={
          <Button onClick={() => { setCreateOpen(true); setNotice(null); }}>
            <MailPlus aria-hidden="true" className="size-5" /> Nueva invitación
          </Button>
        }
      />

      {notice && <Feedback tone="success">{notice}</Feedback>}
      {invitations.isError && <Feedback tone="error">{errorMessage(invitations.error)}</Feedback>}

      <div className="filter-bar" role="group" aria-label="Filtrar invitaciones por estado">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`filter-chip ${filter === item.value ? 'filter-chip--active' : ''}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="table-card" aria-label="Invitaciones">
        {invitations.isPending ? (
          <div className="table-loading">Consultando invitaciones…</div>
        ) : rows.length ? (
          <>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Creada</th>
                    <th>Vencimiento</th>
                    <th><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((invitation) => (
                    <InvitationRow
                      key={invitation.id}
                      invitation={invitation}
                      membership={memberships.data?.find(
                        (item) => item.activo && item.email.toLowerCase() === invitation.email.toLowerCase(),
                      ) ?? (invitation.estado === 'aceptada' && invitation.membresia_id ? {
                        id: invitation.membresia_id,
                        usuario_id: '',
                        nombre: '',
                        email: invitation.email,
                        rol: invitation.rol,
                        activo: true,
                        creado_en: invitation.creado_en,
                      } : undefined)}
                      onAction={confirm}
                      onEdit={editMembership}
                      onDeactivate={deactivateMembership}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {invitations.hasNextPage && (
              <div className="table-footer">
                <Button
                  variant="secondary"
                  loading={invitations.isFetchingNextPage}
                  onClick={() => void invitations.fetchNextPage()}
                >
                  Cargar más
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<UserPlus aria-hidden="true" />}
            title="No hay invitaciones en este estado"
            description="Cuando invites personal, el backend mostrará aquí su estado real y vigencia."
            action={<Button onClick={() => setCreateOpen(true)}>Crear invitación</Button>}
          />
        )}
      </section>

      <section className="table-card" aria-label="Personal con acceso">
        <div className="table-card__header">
          <div><h2 className="text-xl font-bold text-ink">Accesos activos</h2><p className="text-sm text-muted">Edita el rol o desactiva el acceso de una persona.</p></div>
        </div>
        {memberships.isPending ? <div className="table-loading">Consultando accesos…</div> : memberships.isError ? <Feedback tone="error">{errorMessage(memberships.error)}</Feedback> : memberships.data?.length ? (
          <div className="responsive-table"><table><thead><tr><th>Persona</th><th>Rol</th><th>Alta</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
            {memberships.data.map((membership) => <StaffRow key={membership.id} membership={membership} onEdit={editMembership} onDeactivate={deactivateMembership} />)}
          </tbody></table></div>
        ) : <EmptyState icon={<UserPlus aria-hidden="true" />} title="No hay accesos activos" description="Las invitaciones aceptadas aparecerán aquí." />}
      </section>

      <CreateInvitationModal
        open={createOpen}
        token={token}
        onOpenChange={setCreateOpen}
        onCreated={async () => {
          setCreateOpen(false);
          setNotice('Invitación creada y correo enviado correctamente.');
          await queryClient.invalidateQueries({ queryKey: ['invitations'] });
        }}
      />

      <Modal
        open={Boolean(selected && action)}
        onOpenChange={(open) => {
          if (!open) { setSelected(null); setAction(null); }
        }}
        title={action === 'revocar' ? 'Revocar invitación' : 'Reenviar invitación'}
        description={
          action === 'revocar'
            ? 'El enlace actual dejará de ser válido inmediatamente.'
            : 'El enlace anterior será reemplazado y se enviará una invitación nueva por correo.'
        }
      >
        {actionMutation.isError && <Feedback tone="error">{errorMessage(actionMutation.error)}</Feedback>}
        <p className="rounded-2xl bg-cream-2 p-4 text-sm font-semibold text-ink">{selected?.email}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => { setSelected(null); setAction(null); }}>Cancelar</Button>
          <Button
            variant={action === 'revocar' ? 'danger' : 'primary'}
            loading={actionMutation.isPending}
            onClick={() => actionMutation.mutate()}
          >
            {action === 'revocar' ? 'Sí, revocar' : 'Sí, reenviar'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(selectedMembership && membershipAction)}
        onOpenChange={(open) => { if (!open) { setSelectedMembership(null); setMembershipAction(null); } }}
        title={membershipAction === 'editar' ? 'Editar acceso' : 'Desactivar acceso'}
        description={membershipAction === 'editar' ? 'El cambio se aplicará inmediatamente en este establecimiento.' : 'La persona dejará de poder entrar a este establecimiento.'}
      >
        {membershipMutation.isError && <Feedback tone="error">{errorMessage(membershipMutation.error)}</Feedback>}
        <p className="rounded-2xl bg-cream-2 p-4 text-sm font-semibold text-ink">{selectedMembership?.email}</p>
        {membershipAction === 'editar' && <label className="field mt-5"><span className="field__label">Rol autorizado</span><select className="field__control" value={membershipRole} onChange={(event) => setMembershipRole(event.target.value as InvitationRole)}><option value="cajero">Caja</option><option value="cocina">Cocina</option><option value="mesero">Servicio en mesa</option><option value="admin">Administración</option></select></label>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => { setSelectedMembership(null); setMembershipAction(null); }}>Cancelar</Button><Button variant={membershipAction === 'desactivar' ? 'danger' : 'primary'} loading={membershipMutation.isPending} onClick={() => membershipMutation.mutate()}>{membershipAction === 'editar' ? 'Guardar cambios' : 'Desactivar acceso'}</Button></div>
      </Modal>
    </div>
  );
}

function StaffRow({ membership, onEdit, onDeactivate }: { membership: StaffMembership; onEdit: (membership: StaffMembership) => void; onDeactivate: (membership: StaffMembership) => void }) {
  return <tr><td data-label="Persona"><strong className="font-semibold text-ink">{membership.email}</strong>{membership.nombre && <small className="block text-muted">{membership.nombre}</small>}</td><td data-label="Rol">{roleLabel(membership.rol)}</td><td data-label="Alta">{formatDate(membership.creado_en)}</td><td className="table-actions" data-label="Acciones"><button type="button" className="table-action" onClick={() => onEdit(membership)}><Pencil aria-hidden="true" /> Editar</button><button type="button" className="table-action table-action--danger" onClick={() => onDeactivate(membership)}><UserX aria-hidden="true" /> Desactivar</button></td></tr>;
}

function InvitationRow({
  invitation,
  membership,
  onAction,
  onEdit,
  onDeactivate,
}: {
  invitation: StaffInvitation;
  membership?: StaffMembership;
  onAction: (invitation: StaffInvitation, action: 'revocar' | 'reenviar') => void;
  onEdit: (membership: StaffMembership) => void;
  onDeactivate: (membership: StaffMembership) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canRevoke = invitation.estado === 'pendiente';
  const canResend = ['pendiente', 'expirada', 'revocada'].includes(invitation.estado);
  const canManage = invitation.estado === 'aceptada' && membership;
  return (
    <tr>
      <td data-label="Persona"><strong className="font-semibold text-ink">{invitation.email}</strong></td>
      <td data-label="Rol">{roleLabel(invitation.rol)}</td>
      <td data-label="Estado"><InvitationStatusBadge status={invitation.estado} /></td>
      <td data-label="Creada">{formatDate(invitation.creado_en)}</td>
      <td data-label="Vencimiento">{formatDate(invitation.expira_en)}</td>
      <td className="table-actions" data-label="Acciones">
        {canResend && (
          <button type="button" className="table-action" onClick={() => onAction(invitation, 'reenviar')}>
            <RefreshCw aria-hidden="true" /> Reenviar
          </button>
        )}
        {canRevoke && (
          <button type="button" className="table-action table-action--danger" onClick={() => onAction(invitation, 'revocar')}>
            <UserX aria-hidden="true" /> Revocar
          </button>
        )}
        {!canRevoke && !canResend && canManage && (
          <div className="relative ml-auto">
            <button
              type="button"
              className="table-action table-action--icon"
              aria-label={`Opciones de ${invitation.email}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Opciones de acceso"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 min-w-44 rounded-2xl border border-line bg-cream-1 p-2 shadow-xl" role="menu">
                <button type="button" className="table-action w-full" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(membership); }}>
                  <Pencil aria-hidden="true" /> Editar rol
                </button>
                <button type="button" className="table-action table-action--danger w-full" role="menuitem" onClick={() => { setMenuOpen(false); onDeactivate(membership); }}>
                  <UserX aria-hidden="true" /> Desactivar acceso
                </button>
              </div>
            )}
          </div>
        )}
        {!canRevoke && !canResend && !canManage && <MoreHorizontal aria-hidden="true" className="ml-auto size-5 text-muted" />}
      </td>
    </tr>
  );
}

function CreateInvitationModal({
  open,
  token,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  token: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: (input: InvitationForm) => api.createInvitation(token, input),
    onSuccess: onCreated,
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvitationForm>({
    resolver: zodResolver(invitationSchema),
    defaultValues: { email: '', rol: 'cajero' },
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) { reset(); mutation.reset(); }
      }}
      title="Invitar personal"
      description="El enlace será de un solo uso, vencerá en 72 horas y quedará limitado al rol seleccionado."
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form className="space-y-5" onSubmit={(event) => void handleSubmit((input) => mutation.mutate(input))(event)}>
        <Field
          label="Correo de la persona"
          type="email"
          autoComplete="email"
          placeholder="persona@ejemplo.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <label className="field">
          <span className="field__label">Rol autorizado</span>
          <select className="field__control" {...register('rol')}>
            <option value="cajero">Caja</option>
            <option value="cocina">Cocina</option>
            <option value="mesero">Servicio en mesa</option>
            <option value="admin">Administración</option>
          </select>
          {errors.rol?.message && <span className="field__error">{errors.rol.message}</span>}
        </label>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Enviar invitación</Button>
        </div>
      </form>
    </Modal>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function roleLabel(role: InvitationRole): string {
  return ({ cajero: 'Caja', cocina: 'Cocina', mesero: 'Mesero', admin: 'Admin' })[role];
}
