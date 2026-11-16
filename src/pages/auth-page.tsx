import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Redirect, useHistory, useLocation } from 'react-router-dom';
import { z } from 'zod';
import type { MultiFactorResolver, User } from 'firebase/auth';
import { Logo, Spinner } from '../components/brand-mark';
import { PlatformAccountPreparation } from '../components/platform-account-preparation';
import { Button, Feedback, Field } from '../components/ui';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { errorMessage, VaiinillaApiError } from '../lib/api-error';
import { api } from '../lib/api';
import {
  completeTotpSignIn,
  googleSignIn,
  passwordSignIn,
} from '../lib/firebase';

const credentialsSchema = z.object({
  email: z.string().email('Captura un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

type Credentials = z.infer<typeof credentialsSchema>;

export function AuthPage({ surface }: { surface: 'tenant' | 'platform' }) {
  const { user, ready, configured, signOut } = useAuth();
  const { tenant, tenantReady, platform, openPlatformSession } = useSessions();
  const history = useHistory();
  const location = useLocation<{ from?: unknown }>();
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingTotp, setSubmittingTotp] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [platformPreparationUser, setPlatformPreparationUser] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: user?.email ?? '', password: '' },
  });

  if (!ready || (surface === 'tenant' && !tenantReady)) {
    return (
      <div className="grid min-h-screen place-items-center bg-cream text-ink" role="status">
        <span className="inline-flex items-center gap-3 font-semibold">
          <Spinner /> Validando sesión…
        </span>
      </div>
    );
  }
  if (surface === 'tenant' && tenant) return <Redirect to="/app" />;
  if (surface === 'platform' && platform) return <Redirect to="/plataforma" />;

  async function finish(userResult: User, secondFactorSatisfied = false) {
    if (surface === 'platform') {
      if (!secondFactorSatisfied) {
        setPlatformPreparationUser(userResult);
        return;
      }
      await openPlatformSession(userResult);
      history.replace(platformReturnPath(location.state));
    } else {
      history.replace('/accesos');
    }
  }

  async function submit(credentials: Credentials) {
    setError(null);
    setNotice(null);
    try {
      const result = await passwordSignIn(
        credentials.email.trim().toLowerCase(),
        credentials.password,
        surface === 'platform',
      );
      if (result.mfaResolver) {
        setResolver(result.mfaResolver);
        return;
      }
      if (result.user) await finish(result.user);
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setNotice(null);
    setGoogleBusy(true);
    try {
      const result = await googleSignIn();
      if (result.mfaResolver) {
        setResolver(result.mfaResolver);
        return;
      }
      if (result.user) await finish(result.user);
    } catch (caught) {
      // Cerrar la ventana de Google no es un error que haya que enseñar.
      if (caught instanceof FirebaseError && (caught.code === 'auth/popup-closed-by-user' || caught.code === 'auth/cancelled-popup-request')) return;
      setError(authErrorMessage(caught));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function verifyTotp() {
    if (!resolver || !/^\d{6}$/.test(totpCode)) {
      setError('Captura los 6 dígitos de tu aplicación autenticadora.');
      return;
    }
    setSubmittingTotp(true);
    setError(null);
    try {
      const userResult = await completeTotpSignIn(resolver, totpCode);
      try {
        await finish(userResult, true);
      } catch (caught) {
        if (
          surface === 'platform' &&
          caught instanceof VaiinillaApiError &&
          (caught.code === 'IDENTITY_NOT_REGISTERED' ||
            caught.code === 'PLATFORM_AUTHORITY_INACTIVE')
        ) {
          setResolver(null);
          setTotpCode('');
          setPlatformPreparationUser(userResult);
          return;
        }
        throw caught;
      }
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSubmittingTotp(false);
    }
  }

  async function requestReset() {
    const email = getValues('email').trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) {
      setError('Primero captura tu correo para enviar la recuperación.');
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await api.requestPasswordRecovery(email);
      setNotice('Si la cuenta existe, enviaremos las instrucciones de recuperación.');
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setResetting(false);
    }
  }

  const isPlatform = surface === 'platform';

  async function exitPlatformPreparation() {
    await signOut();
    setPlatformPreparationUser(null);
    setResolver(null);
    setTotpCode('');
    setError(null);
    setNotice(null);
  }

  return (
    <main className={`auth-page ${isPlatform ? 'auth-page--platform' : ''}`}>
      <section className="auth-visual" aria-label="Vaiinilla para operación">
        <Link to="/acceso" aria-label="Vaiinilla, inicio">
          <Logo theme={isPlatform ? 'dark' : 'light'} variant="splash" />
        </Link>
        <div className="auth-visual__content">
          <p className="eyebrow">{isPlatform ? 'Autoridad global' : 'Operación sin filas'}</p>
          <h1>
            {isPlatform ? (
              <>Control global. <span>Sin cruces.</span></>
            ) : (
              <>Tu operación, <span>en orden.</span></>
            )}
          </h1>
          <p>
            {isPlatform
              ? 'Una superficie reforzada para administrar establecimientos sin acceder a pedidos, wallet o dinero.'
              : 'Administra personal y mantén la Caja lista con los accesos autorizados.'}
          </p>
        </div>
      </section>

      <section className={`auth-panel ${platformPreparationUser ? 'auth-panel--preparation' : ''}`}>
        <div className={`auth-card ${platformPreparationUser ? 'auth-card--preparation' : ''}`}>
          {platformPreparationUser ? (
            <PlatformAccountPreparation
              user={platformPreparationUser}
              onExit={exitPlatformPreparation}
            />
          ) : (
            <>
          <p className="eyebrow">Acceso seguro</p>
          <h2>{resolver ? 'Confirma tu segundo factor' : isPlatform ? 'Super Admin' : 'Administración y POS'}</h2>
          <p className="auth-card__subtitle">
            {resolver
              ? 'Abre tu aplicación autenticadora y captura el código TOTP actual.'
              : ''}
          </p>

          {!configured && (
            <Feedback tone="error">
              Firebase aún no está configurado. Completa las variables indicadas en <code>.env.example</code>.
            </Feedback>
          )}
          {error && <Feedback tone="error">{error}</Feedback>}
          {notice && <Feedback tone="success">{notice}</Feedback>}

          {resolver ? (
            <form
              className="mt-6 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyTotp();
              }}
            >
              <Field
                label="Código de 6 dígitos"
                name="totp"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="tracking-[0.35em]"
              />
              <Button type="submit" className="w-full" loading={submittingTotp}>
                Confirmar y entrar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setResolver(null);
                  setTotpCode('');
                  setError(null);
                }}
              >
                Volver al acceso
              </Button>
            </form>
          ) : (
            <form className="mt-6 space-y-5" onSubmit={(event) => void handleSubmit(submit)(event)}>
              <Field
                label="Correo"
                type="email"
                autoComplete="email"
                placeholder="nombre@ejemplo.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Field
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                placeholder="Tu contraseña"
                error={errors.password?.message}
                {...register('password')}
              />
              <Button type="submit" className="w-full" loading={isSubmitting} disabled={!configured}>
                {isPlatform ? 'Continuar con segundo factor' : 'Iniciar sesión'}
              </Button>
              {!isPlatform && (
                <Button type="button" variant="secondary" className="w-full" loading={googleBusy} disabled={!configured || isSubmitting} onClick={() => void signInWithGoogle()}>
                  <GoogleMark /> Entrar con Google
                </Button>
              )}
              <button
                type="button"
                className="text-link mx-auto block"
                disabled={resetting || !configured}
                onClick={() => void requestReset()}
              >
                {resetting ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
              </button>
            </form>
          )}

          <div className="auth-card__switch">
            <Link to={isPlatform ? '/acceso' : '/eliminar-cuenta'}>
              {isPlatform ? 'Volver a Administración y POS' : 'Solicitar eliminación de cuenta'}
            </Link>
          </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function authErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return errorMessage(error);
  return (
    {
      'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
      'auth/invalid-email': 'El correo no tiene un formato válido.',
      'auth/too-many-requests': 'Hay demasiados intentos. Espera un momento antes de continuar.',
      'auth/invalid-verification-code': 'El código TOTP no es válido o ya cambió.',
      'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa tu conexión.',
      'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e intenta otra vez.',
      'auth/unauthorized-domain': 'Este sitio todavía no está autorizado para entrar con Google. Entra con tu correo y contraseña.',
      'auth/account-exists-with-different-credential': 'Ese correo ya tiene cuenta con contraseña. Entra con tu correo y contraseña.',
      'auth/operation-not-allowed': 'Entrar con Google no está activo. Entra con tu correo y contraseña.',
    }[error.code] ?? 'No fue posible iniciar sesión. Intenta nuevamente.'
  );
}

function platformReturnPath(state: unknown): string {
  if (!state || typeof state !== 'object') return '/plataforma';
  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'string') return '/plataforma';
  return from === '/plataforma' || from.startsWith('/plataforma/') ? from : '/plataforma';
}
