import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { MultiFactorResolver, User } from 'firebase/auth';
import { Feedback, PageHeader } from '../components/ui';
import { VilloDevicesPanel } from '../components/villo-devices-panel';
import { useSessions } from '../context/session-context';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { completeTotpSignIn, passwordSignIn } from '../lib/firebase';
import { SimpleMarkdown } from '../lib/simple-markdown';

type TabKey = 'guia' | 'dispositivos';

export function VilloPage() {
  const { user, ready, configured, signOut } = useAuth();
  const { clearAll } = useSessions();
  const queryClient = useQueryClient();
  const [loginError, setLoginError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accessVersion, setAccessVersion] = useState(0);
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const activeUser = signedInUser ?? user;

  const access = useQuery({
    queryKey: ['villo-owner-access', activeUser?.uid ?? null, accessVersion],
    enabled: ready && Boolean(activeUser),
    queryFn: async () => {
      const token = await activeUser!.getIdToken();
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
    setResolver(null);
    setTotpCode('');
    setAccessVersion((version) => version + 1);
  }

  if (ready && !activeUser) {
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
              setResolver(result.mfaResolver);
              return;
            }
            if (!result.user) throw new Error('Sign-in was not completed.');
            setSignedInUser(result.user);
            setAccessVersion((version) => version + 1);
          } catch {
            setLoginError(true);
          } finally {
            setBusy(false);
          }
        }}
        resolver={resolver}
        totpCode={totpCode}
        onTotpCodeChange={setTotpCode}
        onVerifyTotp={async () => {
          if (!resolver || !/^\d{6}$/.test(totpCode)) {
            setLoginError(true);
            return;
          }
          setBusy(true);
          setLoginError(false);
          try {
            const result = await completeTotpSignIn(resolver, totpCode);
            setResolver(null);
            setTotpCode('');
            setSignedInUser(result);
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

  if (access.isError) return (
    <main className="page-stack mx-auto w-full max-w-lg">
      <PageHeader eyebrow="Acceso privado" title="Villo" />
      <Feedback tone="error">Esta cuenta no tiene acceso a VILLO</Feedback>
      <button className="button button--secondary w-fit" onClick={() => void closeVilloSession()} type="button">Cerrar sesión</button>
    </main>
  );
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
      firebaseUser={activeUser}
      onSignOut={closeVilloSession}
      showSignOut
    />
  );
}

function VilloLogin({
  configured,
  error,
  busy,
  onSubmit,
  resolver,
  totpCode,
  onTotpCodeChange,
  onVerifyTotp,
}: {
  configured: boolean;
  error: boolean;
  busy: boolean;
  onSubmit: (email: string, password: string) => Promise<void>;
  resolver: MultiFactorResolver | null;
  totpCode: string;
  onTotpCodeChange: (value: string) => void;
  onVerifyTotp: () => Promise<void>;
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
          {resolver ? (
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Código de tu aplicación autenticadora
              <input autoComplete="one-time-code" className="field" disabled={busy} inputMode="numeric" maxLength={6} onChange={(event) => onTotpCodeChange(event.target.value)} pattern="[0-9]{6}" required value={totpCode} />
            </label>
          ) : (
            <>
              <label className="grid gap-1 text-sm font-semibold text-ink">
                Correo electrónico
                <input autoComplete="username" className="field" disabled={busy || !configured} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-ink">
                Contraseña
                <input autoComplete="current-password" className="field" disabled={busy || !configured} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
              </label>
            </>
          )}
          {resolver ? (
            <button className="button button--primary" disabled={busy || !configured} onClick={() => void onVerifyTotp()} type="button">{busy ? 'Verificando…' : 'Verificar código'}</button>
          ) : <button className="button button--primary" disabled={busy || !configured} type="submit">{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>}
        </form>
      </section>
    </main>
  );
}

function VilloOwnerArea({
  authToken,
  firebaseUser,
  onSignOut,
  showSignOut,
}: {
  authToken: string | null | undefined;
  firebaseUser: User | null;
  onSignOut: () => Promise<void>;
  showSignOut: boolean;
}) {
  const [tab, setTab] = useState<TabKey>('guia');
  const guide = useQuery({
    queryKey: ['villo-owner-guide', firebaseUser?.uid ?? null],
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
          {guide.isError && <Feedback tone="error">No pudimos cargar la guía. Inténtalo de nuevo.</Feedback>}
          {guide.isPending ? <div className="analytics-loading" role="status">Cargando guía…</div> : guide.data?.markdown?.trim() ? <>
            <SimpleMarkdown source={guide.data.markdown} />
            {updatedAt && <p className="mt-6 text-xs text-muted">Última actualización: {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(updatedAt)}</p>}
          </> : !guide.isError && <Feedback tone="error">No pudimos cargar la guía. Inténtalo de nuevo.</Feedback>}
        </section>
      ) : (
        <section id="villo-tabpanel-dispositivos" role="tabpanel" aria-labelledby="Dispositivos">
          <VilloDevicesPanel userOverride={firebaseUser} />
        </section>
      )}
    </div>
  );
}
