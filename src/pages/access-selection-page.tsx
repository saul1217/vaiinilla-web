import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, LogOut, ShieldAlert, Store } from 'lucide-react';
import { useState } from 'react';
import { Redirect, useHistory } from 'react-router-dom';
import { Logo, Spinner } from '../components/brand-mark';
import { Button, EmptyState, Feedback } from '../components/ui';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import type { SessionAccess } from '../types/api';

const webRoles = new Set(['admin', 'cajero', 'cocina', 'mesero']);

export function AccessSelectionPage() {
  const { user, ready, signOut } = useAuth();
  const { tenant, tenantReady, openTenantSession, clearAll } = useSessions();
  const history = useHistory();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accesses = useQuery({
    queryKey: ['session-accesses', user?.uid],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      return api.listAccesses(await user.getIdToken(true));
    },
  });

  if (!ready || !tenantReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream text-ink" role="status">
        <span className="inline-flex items-center gap-3 font-semibold">
          <Spinner /> Recuperando tu espacio de trabajo…
        </span>
      </div>
    );
  }
  if (!user) return <Redirect to="/acceso" />;
  if (tenant) return <Redirect to="/app" />;

  const available = (accesses.data ?? []).filter((access) => webRoles.has(access.rol));

  async function choose(access: SessionAccess) {
    if (!user) return;
    setOpening(access.membresia_id);
    setError(null);
    try {
      const session = await openTenantSession(user, access);
      history.replace(session.context.rol === 'admin' ? '/app' : '/app/pos');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setOpening(null);
    }
  }

  async function exit() {
    clearAll();
    await signOut();
    history.replace('/acceso');
  }

  return (
    <main className="selection-page">
      <header className="selection-header">
        <Logo />
        <Button variant="ghost" onClick={() => void exit()}>
          <LogOut aria-hidden="true" className="size-4" /> Cerrar sesión
        </Button>
      </header>

      <section className="selection-content">
        <p className="eyebrow">Accesos autorizados</p>
        <h1>¿Dónde vas a trabajar?</h1>
        <p className="selection-intro">
          Estos accesos vienen del backend. Vaiinilla emitirá una sesión nueva para una sola membresía y un solo rol.
        </p>

        {error && <Feedback tone="error">{error}</Feedback>}
        {accesses.isError && <Feedback tone="error">{errorMessage(accesses.error)}</Feedback>}

        {accesses.isPending ? (
          <div className="access-grid" aria-label="Cargando accesos">
            {[0, 1].map((item) => <div className="access-card access-card--skeleton" key={item} />)}
          </div>
        ) : available.length ? (
          <div className="access-grid">
            {available.map((access) => (
              <button
                type="button"
                className="access-card"
                key={access.membresia_id}
                onClick={() => void choose(access)}
                disabled={opening !== null}
              >
                <span className="access-card__icon">
                  {access.rol === 'admin' ? <Building2 aria-hidden="true" /> : <Store aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <strong>{access.establecimiento.nombre}</strong>
                  <span>{roleLabel(access.rol)}</span>
                  {access.estado_establecimiento === 'suspendido' && (
                    <small>
                      <ShieldAlert aria-hidden="true" /> Establecimiento suspendido
                    </small>
                  )}
                </span>
                <ArrowRight aria-hidden="true" className="size-5 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title="No hay accesos Web disponibles"
            description="Tu identidad está activa, pero el backend no devolvió una membresía de Administración o POS. Pide al administrador que revise tu invitación."
          />
        )}
      </section>
    </main>
  );
}

function roleLabel(role: string): string {
  return (
    {
      admin: 'Administración',
      cajero: 'Caja',
      cocina: 'Cocina',
      mesero: 'Servicio en mesa',
    }[role] ?? role
  );
}
