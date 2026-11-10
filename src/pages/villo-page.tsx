import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Feedback, PageHeader } from '../components/ui';
import { VilloDevicesPanel } from '../components/villo-devices-panel';
import { useSessions } from '../context/session-context';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { passwordSignIn } from '../lib/firebase';
import { SimpleMarkdown } from '../lib/simple-markdown';
import { NotFoundPage } from './not-found-page';

type TabKey = 'guia' | 'dispositivos';

function ownerSessionGateEnabled() {
  return import.meta.env.MODE === 'development' ||
    import.meta.env.VITE_VILLO_OWNER_SESION_NORMAL === 'true';
}

export function VilloPage() {
  const { user, ready, configured, signOut } = useAuth();
  const { platform, clearAll } = useSessions();
  const queryClient = useQueryClient();
  const gateEnabled = ownerSessionGateEnabled();
  const [loginError, setLoginError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accessVersion, setAccessVersion] = useState(0);
  const [loginSucceeded, setLoginSucceeded] = useState(false);
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const activeUser = signedInUser ?? user;

  const access = useQuery({
    queryKey: ['villo-owner-access', activeUser?.uid ?? null, gateEnabled ? 'firebase' : Boolean(platform?.token), accessVersion],
    enabled: ready && (!gateEnabled || Boolean(activeUser)),
    queryFn: async () => {
      const token = gateEnabled ? await activeUser!.getIdToken() : (platform?.token ?? null);
      await api.villoOwnerAccess(token);
      return token;
    },
    retry: false,
  });
  async function closeVilloSession() {
    await clearAll();
    await signOut();
    setSignedInUser(null);
    queryClient.clear();
    setLoginSucceeded(false);
    setAccessVersion((version) => version + 1);
  }

  if (!gateEnabled && access.isError) return <NotFoundPage />;
  if (gateEnabled && ready && (!activeUser || (access.isError && isNotFound(access.error) && !loginSucceeded))) {
    return (
      <VilloLogin
        configured={configured}
        error={loginError}
        busy={busy}
        onSubmit={async (email, password) => {
          setBusy(true);
          setLoginError(false);
          try {
            // Reemplaza cualquier cuenta y contexto abiertos antes de entrar a VILLO.
            await clearAll();
            const result = await passwordSignIn(email.trim().toLowerCase(), password, true);
            if (result.mfaResolver) {
              await signOut();
              throw new Error('Sign-in was not completed.');
            }
            if (!result.user) throw new Error('Sign-in was not completed.');
            setSignedInUser(result.user);
            setLoginSucceeded(true);
            setAccessVersion((version) => version + 1);
          } catch {
            setLoginError(true);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  if (gateEnabled && loginSucceeded && access.isError && isNotFound(access.error)) {
    return (
      <main className="page-stack mx-auto w-full max-w-lg">
        <PageHeader eyebrow="Acceso privado" title="Villo" />
        <Feedback tone="error">Esta cuenta no tiene acceso a VILLO</Feedback>
        <button className="button button--secondary w-fit" onClick={() => void closeVilloSession()} type="button">
          Cerrar sesión
        </button>
      </main>
    );
  }

  if (access.isError) return <NotFoundPage />;
  if (access.isPending || !ready) {
    return (
      <div className="grid min-h-[50vh] place-items-center" role="status">
        <span className="inline-flex items-center gap-3 font-semibold text-ink">Validando acceso…</span>
      </div>
    );
  }

  return (
    <VilloOwnerArea
      authToken={access.data}
      onSignOut={closeVilloSession}
      showSignOut={gateEnabled}
    />
  );
}

function isNotFound(error: unknown) {
  return error instanceof VaiinillaApiError && error.status === 404;
}

function VilloLogin({
  configured,
  error,
  busy,
  onSubmit,
}: {
  configured: boolean;
  error: boolean;
  busy: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(email, password);
    setPassword('');
  }

  return (
    <main className="page-stack mx-auto w-full max-w-lg">
      <PageHeader eyebrow="Acceso privado" title="Villo" description="Inicia sesión para continuar." />
      <section className="rounded-2xl border border-ink/15 bg-white p-6 shadow-sm">
        <p className="mb-5 text-sm text-muted">
          Este acceso reemplaza la sesión actual de Vaiinilla para usar tu cuenta de VILLO.
        </p>
        {!configured && <Feedback tone="error">El acceso no está disponible en este entorno.</Feedback>}
        {error && <Feedback tone="error">No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.</Feedback>}
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Correo electrónico
            <input
              autoComplete="username"
              className="field"
              disabled={busy || !configured}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Contraseña
            <input
              autoComplete="current-password"
              className="field"
              disabled={busy || !configured}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="button button--primary" disabled={busy || !configured} type="submit">
            {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
      </section>
    </main>
  );
}

function VilloOwnerArea({
  authToken,
  onSignOut,
  showSignOut,
}: {
  authToken: string | null | undefined;
  onSignOut: () => Promise<void>;
  showSignOut: boolean;
}) {
  const [tab, setTab] = useState<TabKey>('guia');
  const guide = useQuery({
    queryKey: ['villo-owner-guide', authToken ?? 'none'],
    queryFn: () => api.villoOwnerGuide(authToken),
    enabled: tab === 'guia',
    retry: false,
  });

  const updatedAt = guide.data?.actualizado_en ? new Date(guide.data.actualizado_en) : null;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Sección privada"
          title="Villo"
          description="Herramientas internas del dueño de la plataforma."
        />
        {showSignOut && (
          <button className="button button--secondary" onClick={() => void onSignOut()} type="button">
            Cerrar sesión
          </button>
        )}
      </div>

      <nav className="tabs" role="tablist" aria-label="Villo">
        <button role="tab" aria-selected={tab === 'guia'} aria-controls="villo-tabpanel-guia" className={`tab ${tab === 'guia' ? 'tab--active' : ''}`} onClick={() => setTab('guia')} type="button">Guía</button>
        <button role="tab" aria-selected={tab === 'dispositivos'} aria-controls="villo-tabpanel-dispositivos" className={`tab ${tab === 'dispositivos' ? 'tab--active' : ''}`} onClick={() => setTab('dispositivos')} type="button">Dispositivos</button>
      </nav>

      {tab === 'guia' ? (
        <section id="villo-tabpanel-guia" role="tabpanel" aria-labelledby="Guía" className="prose max-w-none villo-markdown">
          {guide.isError && <Feedback tone="error">{errorMessage(guide.error)}</Feedback>}
          {guide.isPending ? <div className="analytics-loading" role="status">Cargando guía…</div> : guide.data ? <>
            <SimpleMarkdown source={guide.data.markdown} />
            {updatedAt && <p className="mt-6 text-xs text-muted">Última actualización: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(updatedAt)}</p>}
          </> : null}
        </section>
      ) : (
        <section id="villo-tabpanel-dispositivos" role="tabpanel" aria-labelledby="Dispositivos">
          <VilloDevicesPanel />
        </section>
      )}
    </div>
  );
}
