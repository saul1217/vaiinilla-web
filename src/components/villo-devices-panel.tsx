import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Copy, KeyRound, Plus, Radio, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/auth-context';
import { api, apiUrl } from '../lib/api';
import {
  filterVilloDevices,
  formatVilloDate,
  villoAlertLabel,
  villoErrorMessage,
  villoErrorNeedsRefresh,
  villoSpaceOptions,
  villoTokenLabel,
  type VilloStatusFilter,
} from '../lib/villo-devices';
import type { SessionAccess, VilloDevice } from '../types/api';
import { Button, EmptyState, Feedback, Field, Modal, SelectField } from './ui';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; device: VilloDevice }
  | { kind: 'issue'; device: VilloDevice; afterReassign?: boolean }
  | { kind: 'revoke'; device: VilloDevice }
  | { kind: 'alerts'; device: VilloDevice };

/** Lo único que se guarda del token: en memoria del componente, mientras el aviso está abierto. */
interface RevealedToken {
  deviceName: string;
  token: string;
  expiraEn: string;
}

interface AdminContext {
  token: string;
  expiresAt: number;
}

const RENEW_ADVANCE_MS = 60_000;

/**
 * Pestaña Dispositivos de /villo: el admin del negocio registra sus VILLO, los pone en una mesa,
 * les saca el token y los da de baja. Usa un token de contexto del negocio que escoja (solo los
 * accesos con rol admin), en memoria y sin tocar la sesión de trabajo de /app.
 */
export function VilloDevicesPanel() {
  const { user } = useAuth();
  const [membershipId, setMembershipId] = useState('');

  const accesses = useQuery({
    queryKey: ['villo-admin-accesses', user?.uid ?? 'none'],
    enabled: Boolean(user),
    queryFn: async () => (user ? api.listAccesses(await user.getIdToken()) : []),
    retry: false,
  });

  const adminAccesses = (accesses.data ?? []).filter((access) => access.rol === 'admin');
  const selected = adminAccesses.find((access) => access.membresia_id === membershipId)
    ?? (adminAccesses.length === 1 ? adminAccesses[0] : undefined);

  if (!user) {
    return <Feedback tone="info">Inicia sesión con tu cuenta de Vaiinilla para administrar los VILLO de tu negocio.</Feedback>;
  }
  if (accesses.isPending) return <div className="analytics-loading" role="status">Cargando tus negocios…</div>;
  if (accesses.isError) {
    return (
      <Feedback tone="error">
        No pudimos cargar tus negocios. {villoErrorMessage(accesses.error)}{' '}
        <button type="button" className="underline" onClick={() => void accesses.refetch()}>Reintentar</button>
      </Feedback>
    );
  }
  if (adminAccesses.length === 0) {
    return (
      <EmptyState
        icon={<Radio aria-hidden="true" className="size-6" />}
        title="No administras ningún negocio"
        description="Los VILLO los maneja la administración de cada negocio. Pide que te inviten como admin para registrar uno."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <ServerUrlCard />
      {adminAccesses.length > 1 && (
        <SelectField
          label="Negocio"
          value={selected?.membresia_id ?? ''}
          onChange={(event) => setMembershipId(event.target.value)}
        >
          <option value="">Escoge un negocio…</option>
          {adminAccesses.map((access) => (
            <option key={access.membresia_id} value={access.membresia_id}>
              {access.establecimiento.nombre}
              {access.estado_establecimiento === 'suspendido' ? ' (suspendido)' : ''}
            </option>
          ))}
        </SelectField>
      )}
      {selected ? (
        <EstablishmentDevices key={selected.membresia_id} access={selected} />
      ) : (
        <p className="text-muted">Escoge el negocio donde vas a poner el VILLO.</p>
      )}
    </div>
  );
}

function ServerUrlCard() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(apiUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="rounded-2xl border border-ink/15 p-4">
      <p className="text-sm font-semibold text-ink">Dirección del servidor para el VILLO (server_url)</p>
      <p className="mt-1 text-sm text-muted">Es la que se configura en el aparato junto con su token.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="break-all rounded-lg bg-cream px-3 py-2 text-sm">{apiUrl}</code>
        <Button variant="secondary" type="button" onClick={() => void copy()}>
          <Copy aria-hidden="true" className="size-4" /> {copied ? 'Copiada' : 'Copiar dirección'}
        </Button>
      </div>
    </div>
  );
}

function EstablishmentDevices({ access }: { access: SessionAccess }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<VilloStatusFilter>('todos');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [revealed, setRevealed] = useState<RevealedToken | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const context = useQuery({
    queryKey: ['villo-admin-context', user?.uid ?? 'none', access.membresia_id],
    enabled: Boolean(user),
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<AdminContext> => {
      if (!user) throw new Error('Inicia sesión de nuevo.');
      const response = await api.createTenantContext(await user.getIdToken(), access.membresia_id);
      return { token: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
    },
    // El token de contexto dura poco: se renueva un minuto antes de vencer.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data ? Math.max(data.expiresAt - Date.now() - RENEW_ADVANCE_MS, 30_000) : false;
    },
  });
  const token = context.data?.token ?? null;

  const devices = useQuery({
    queryKey: ['villo-devices', access.membresia_id],
    enabled: Boolean(token),
    gcTime: 0,
    retry: false,
    queryFn: () => api.listVilloDevices(token as string),
  });
  const spaces = useQuery({
    queryKey: ['villo-spaces', access.membresia_id],
    enabled: Boolean(token),
    gcTime: 0,
    retry: false,
    queryFn: () => api.listManagedSpaces(token as string),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['villo-devices', access.membresia_id] });
  }

  if (context.isPending || (token && devices.isPending)) {
    return <div className="analytics-loading" role="status">Cargando los VILLO de {access.establecimiento.nombre}…</div>;
  }
  if (context.isError) {
    return (
      <Feedback tone="error">
        No pudimos entrar a {access.establecimiento.nombre}. {villoErrorMessage(context.error)}{' '}
        <button type="button" className="underline" onClick={() => void context.refetch()}>Reintentar</button>
      </Feedback>
    );
  }
  if (devices.isError) {
    return (
      <Feedback tone="error">
        No pudimos cargar los VILLO. {villoErrorMessage(devices.error)}{' '}
        <button type="button" className="underline" onClick={() => void devices.refetch()}>Reintentar</button>
      </Feedback>
    );
  }

  const list = devices.data ?? [];
  const visible = filterVilloDevices(list, filter);
  const options = villoSpaceOptions(spaces.data ?? [], list);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-48">
          <SelectField label="Estado" value={filter} onChange={(event) => setFilter(event.target.value as VilloStatusFilter)}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="revocado">Dados de baja</option>
          </SelectField>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" type="button" onClick={refresh}>
            <RefreshCw aria-hidden="true" className="size-4" /> Actualizar
          </Button>
          <Button type="button" onClick={() => { setNotice(null); setDialog({ kind: 'create' }); }}>
            <Plus aria-hidden="true" className="size-4" /> Registrar VILLO
          </Button>
        </div>
      </div>

      {notice && <Feedback tone="success">{notice}</Feedback>}
      {spaces.isError && (
        <Feedback tone="error">No pudimos cargar las mesas: {villoErrorMessage(spaces.error)}</Feedback>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Radio aria-hidden="true" className="size-6" />}
          title={list.length === 0 ? 'Todavía no hay VILLO' : 'No hay VILLO con ese estado'}
          description={list.length === 0
            ? 'Registra tu primer VILLO, asígnale una mesa y genera su token para cargarlo en el aparato.'
            : 'Cambia el filtro de estado para ver los demás.'}
        />
      ) : (
        <ul className="grid gap-3" aria-label="Dispositivos VILLO">
          {visible.map((device) => (
            <DeviceItem
              key={device.id}
              device={device}
              onEdit={() => { setNotice(null); setDialog({ kind: 'edit', device }); }}
              onIssue={() => { setNotice(null); setDialog({ kind: 'issue', device }); }}
              onRevoke={() => { setNotice(null); setDialog({ kind: 'revoke', device }); }}
              onAlerts={() => setDialog({ kind: 'alerts', device })}
            />
          ))}
        </ul>
      )}

      {token && dialog?.kind === 'create' && (
        <DeviceFormDialog
          token={token}
          options={options}
          onClose={() => setDialog(null)}
          onSaved={(device) => {
            refresh();
            setDialog(null);
            setNotice(device.espacio
              ? `Registramos «${device.nombre}». Ahora genera su token para cargarlo en el aparato.`
              : `Registramos «${device.nombre}». Asígnale una mesa para poder generar su token.`);
          }}
          onStale={refresh}
        />
      )}
      {token && dialog?.kind === 'edit' && (
        <DeviceFormDialog
          token={token}
          device={dialog.device}
          options={options}
          onClose={() => setDialog(null)}
          onSaved={(device, reassigned) => {
            refresh();
            if (reassigned && device.espacio && device.estado === 'activo') {
              setDialog({ kind: 'issue', device, afterReassign: true });
            } else {
              setDialog(null);
              setNotice(`Guardamos los cambios de «${device.nombre}».`);
            }
          }}
          onStale={refresh}
        />
      )}
      {token && dialog?.kind === 'issue' && (
        <IssueTokenDialog
          token={token}
          device={dialog.device}
          afterReassign={dialog.afterReassign}
          onClose={() => setDialog(null)}
          onIssued={(issued) => {
            refresh();
            setDialog(null);
            setRevealed({ deviceName: issued.dispositivo.nombre, token: issued.token, expiraEn: issued.expira_en });
          }}
          onStale={refresh}
        />
      )}
      {token && dialog?.kind === 'revoke' && (
        <RevokeDialog
          token={token}
          device={dialog.device}
          onClose={() => setDialog(null)}
          onRevoked={(device) => {
            refresh();
            setDialog(null);
            setNotice(`«${device.nombre}» quedó dado de baja. El aparato deja de funcionar desde su siguiente petición.`);
          }}
          onStale={refresh}
        />
      )}
      {token && dialog?.kind === 'alerts' && (
        <AlertsDialog token={token} device={dialog.device} onClose={() => setDialog(null)} />
      )}
      {revealed && <TokenRevealDialog revealed={revealed} onClose={() => setRevealed(null)} />}
    </div>
  );
}

function DeviceItem({
  device,
  onEdit,
  onIssue,
  onRevoke,
  onAlerts,
}: {
  device: VilloDevice;
  onEdit: () => void;
  onIssue: () => void;
  onRevoke: () => void;
  onAlerts: () => void;
}) {
  const active = device.estado === 'activo';
  return (
    <li className="rounded-2xl border border-ink/15 p-4" aria-label={device.nombre}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-ink">{device.nombre}</p>
          <p className="text-sm text-muted">
            {active ? 'Activo' : 'Dado de baja'} · {device.espacio ? `Mesa: ${device.espacio.nombre ?? `#${device.espacio.id}`}` : 'Sin mesa'}
          </p>
        </div>
        <span className="text-sm font-semibold text-ink">{villoTokenLabel(device)}</span>
      </div>
      <dl className="mt-3 grid gap-1 text-sm text-muted sm:grid-cols-2">
        <div><dt className="inline">Última conexión: </dt><dd className="inline">{formatVilloDate(device.ultimo_uso_en)}</dd></div>
        {active && device.token.emitido && (
          <div><dt className="inline">El token vence: </dt><dd className="inline">{formatVilloDate(device.token.expira_en, 'Sin fecha')}</dd></div>
        )}
        {device.ultima_alerta_en && (
          <div><dt className="inline">Última alerta: </dt><dd className="inline">{formatVilloDate(device.ultima_alerta_en)}</dd></div>
        )}
        {!active && (
          <div>
            <dt className="inline">Dado de baja: </dt>
            <dd className="inline">
              {formatVilloDate(device.revocado_en, 'Sin fecha')}
              {device.motivo_revocacion ? ` (${device.motivo_revocacion})` : ''}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {active && (
          <>
            <Button variant="secondary" type="button" onClick={onEdit}>Editar nombre o mesa</Button>
            <Button variant="secondary" type="button" onClick={onIssue}>
              <KeyRound aria-hidden="true" className="size-4" />
              {device.token.emitido ? 'Generar token nuevo' : 'Generar token'}
            </Button>
          </>
        )}
        <Button variant="ghost" type="button" onClick={onAlerts}>
          <Bell aria-hidden="true" className="size-4" /> Ver alertas
        </Button>
        {active && <Button variant="danger" type="button" onClick={onRevoke}>Dar de baja</Button>}
      </div>
    </li>
  );
}

function DeviceFormDialog({
  token,
  device,
  options,
  onClose,
  onSaved,
  onStale,
}: {
  token: string;
  device?: VilloDevice;
  options: ReturnType<typeof villoSpaceOptions>;
  onClose: () => void;
  onSaved: (device: VilloDevice, reassigned: boolean) => void;
  onStale: () => void;
}) {
  const [nombre, setNombre] = useState(device?.nombre ?? '');
  const [spaceId, setSpaceId] = useState(device?.espacio ? String(device.espacio.id) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSpace = device?.espacio?.id ?? null;
  const nextSpace = spaceId ? Number(spaceId) : null;
  const reassigning = Boolean(device) && nextSpace !== currentSpace;
  const loseToken = reassigning && Boolean(device?.token.emitido);
  const trimmed = nombre.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || trimmed.length > 60) {
      setError('Ponle un nombre de hasta 60 letras, por ejemplo «Terraza 2».');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (!device) {
        onSaved(await api.createVilloDevice(token, { nombre: trimmed, ...(nextSpace ? { espacio_id: nextSpace } : {}) }), false);
        return;
      }
      const input = {
        ...(trimmed !== device.nombre ? { nombre: trimmed } : {}),
        ...(reassigning ? { espacio_id: nextSpace } : {}),
        version_esperada: device.version,
      };
      if (!input.nombre && !reassigning) {
        onClose();
        return;
      }
      onSaved(await api.updateVilloDevice(token, device.id, input), reassigning);
    } catch (caught) {
      setError(villoErrorMessage(caught));
      if (villoErrorNeedsRefresh(caught)) onStale();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={device ? `Editar «${device.nombre}»` : 'Registrar VILLO'}
      description={device ? undefined : 'Ponle un nombre que identifique dónde está, por ejemplo «Mesa 1» o «Terraza 2».'}
    >
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Nombre" value={nombre} maxLength={60} onChange={(event) => setNombre(event.target.value)} required />
        <SelectField
          label="Mesa"
          value={spaceId}
          onChange={(event) => setSpaceId(event.target.value)}
          hint="Cada mesa tiene a lo más un VILLO activo. Sin mesa no se le puede generar token."
        >
          <option value="">Sin mesa</option>
          {options.map((option) => {
            const takenByOther = option.ocupadaPor && option.ocupadaPor.id !== device?.id;
            return (
              <option key={option.id} value={option.id} disabled={Boolean(takenByOther)}>
                {option.nombre}{takenByOther ? ` (ya tiene a «${option.ocupadaPor?.nombre}»)` : ''}
              </option>
            );
          })}
        </SelectField>
        {loseToken && (
          <Feedback tone="info">
            Al cambiar de mesa se borra el token actual y el VILLO deja de funcionar hasta que le cargues uno nuevo. Al guardar te ofrecemos generarlo.
          </Feedback>
        )}
        {error && <Feedback tone="error">{error}</Feedback>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{device ? 'Guardar' : 'Registrar'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function IssueTokenDialog({
  token,
  device,
  afterReassign,
  onClose,
  onIssued,
  onStale,
}: {
  token: string;
  device: VilloDevice;
  afterReassign?: boolean;
  onClose: () => void;
  onIssued: (issued: Awaited<ReturnType<typeof api.issueVilloDeviceToken>>) => void;
  onStale: () => void;
}) {
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withoutSpace = !device.espacio;

  async function issue() {
    setIssuing(true);
    setError(null);
    try {
      onIssued(await api.issueVilloDeviceToken(token, device.id));
    } catch (caught) {
      setError(villoErrorMessage(caught));
      if (villoErrorNeedsRefresh(caught)) onStale();
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={afterReassign ? `«${device.nombre}» cambió de mesa` : `Token de «${device.nombre}»`}
    >
      <div className="grid gap-4">
        {afterReassign ? (
          <p className="text-sm text-muted">
            Guardamos la mesa nueva. Su token anterior se borró, así que el VILLO no funciona hasta que le cargues uno nuevo. ¿Lo generas ahora?
          </p>
        ) : device.token.emitido ? (
          <p className="text-sm text-muted">
            Generar un token nuevo deja sin servicio al anterior al instante: el aparato deja de funcionar hasta que le cargues el nuevo.
          </p>
        ) : (
          <p className="text-sm text-muted">El token es la llave del aparato. Se muestra una sola vez, así que tenlo a la mano para copiarlo.</p>
        )}
        {withoutSpace && <Feedback tone="info">Asígnale una mesa a este VILLO antes de generar su token.</Feedback>}
        {error && <Feedback tone="error">{error}</Feedback>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>{afterReassign ? 'Después' : 'Cancelar'}</Button>
          <Button type="button" loading={issuing} disabled={withoutSpace} onClick={() => void issue()}>
            {device.token.emitido && !afterReassign ? 'Sí, generar token nuevo' : 'Generar token'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TokenRevealDialog({ revealed, onClose }: { revealed: RevealedToken; onClose: () => void }) {
  const [copied, setCopied] = useState<'ok' | 'error' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(revealed.token);
      setCopied('ok');
    } catch {
      setCopied('error');
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Token de «${revealed.deviceName}»`}
    >
      <div className="grid gap-4">
        <Feedback tone="info">
          Cópialo ahora y cárgalo en el aparato: no se vuelve a mostrar. Si lo pierdes, genera uno nuevo.
        </Feedback>
        <code className="block break-all rounded-lg bg-cream px-3 py-3 text-sm" aria-label="Token del VILLO">
          {revealed.token}
        </code>
        <p className="text-sm text-muted">Vence: {formatVilloDate(revealed.expiraEn, 'Sin fecha')}. Antes de eso el aparato lo renueva solo.</p>
        <p className="text-sm text-muted">
          Dirección del servidor: <code className="break-all">{apiUrl}</code>
        </p>
        {copied === 'ok' && <Feedback tone="success">Token copiado.</Feedback>}
        {copied === 'error' && <Feedback tone="error">No se pudo copiar. Selecciónalo y cópialo a mano.</Feedback>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => void copy()}>
            <Copy aria-hidden="true" className="size-4" /> Copiar token
          </Button>
          <Button type="button" onClick={onClose}>Ya lo copié</Button>
        </div>
      </div>
    </Modal>
  );
}

function RevokeDialog({
  token,
  device,
  onClose,
  onRevoked,
  onStale,
}: {
  token: string;
  device: VilloDevice;
  onClose: () => void;
  onRevoked: (device: VilloDevice) => void;
  onStale: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setSaving(true);
    setError(null);
    try {
      onRevoked(await api.revokeVilloDevice(token, device.id, motivo.trim() || undefined));
    } catch (caught) {
      setError(villoErrorMessage(caught));
      if (villoErrorNeedsRefresh(caught)) onStale();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose(); }} title={`Dar de baja «${device.nombre}»`}>
      <div className="grid gap-4">
        <Feedback tone="error">
          Es definitivo: el aparato deja de funcionar al instante y este VILLO ya no se puede volver a activar. Para usar el aparato otra vez hay que registrarlo de nuevo.
        </Feedback>
        <Field label="Motivo (opcional)" value={motivo} maxLength={240} onChange={(event) => setMotivo(event.target.value)} />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          Entiendo que no se puede deshacer.
        </label>
        {error && <Feedback tone="error">{error}</Feedback>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" type="button" loading={saving} disabled={!confirmed} onClick={() => void revoke()}>
            Dar de baja
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AlertsDialog({ token, device, onClose }: { token: string; device: VilloDevice; onClose: () => void }) {
  const alerts = useQuery({
    queryKey: ['villo-device-alerts', device.id],
    gcTime: 0,
    retry: false,
    queryFn: () => api.listVilloDeviceAlerts(token, device.id),
  });
  return (
    <Modal open onOpenChange={(open) => { if (!open) onClose(); }} title={`Alertas de «${device.nombre}»`} description="Las últimas 50.">
      {alerts.isPending ? (
        <div role="status">Cargando alertas…</div>
      ) : alerts.isError ? (
        <Feedback tone="error">{villoErrorMessage(alerts.error)}</Feedback>
      ) : alerts.data.length === 0 ? (
        <p className="text-sm text-muted">Sin alertas. Todo en orden.</p>
      ) : (
        <ul className="grid gap-2" aria-label="Alertas">
          {alerts.data.map((alert) => (
            <li key={alert.id} className="text-sm">
              <span className="font-semibold text-ink">{formatVilloDate(alert.creado_en, 'Sin fecha')}</span>
              {' · '}
              {villoAlertLabel(alert)}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
