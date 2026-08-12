import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Redirect, useHistory } from 'react-router-dom';
import { z } from 'zod';
import type { MultiFactorResolver, User } from 'firebase/auth';
import { Logo } from '../components/brand-mark';
import { PlatformAccountPreparation } from '../components/platform-account-preparation';
import { Button, Feedback, Field } from '../components/ui';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { errorMessage } from '../lib/api-error';
import { api } from '../lib/api';
import {
  completeTotpSignIn,
  passwordSignIn,
} from '../lib/firebase';

const credentialsSchema = z.object({
  email: z.string().email('Captura un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

type Credentials = z.infer<typeof credentialsSchema>;

export function AuthPage({ surface }: { surface: 'tenant' | 'platform' }) {
  const { user, ready, configured, signOut } = useAuth();
  const { tenant, platform, openPlatformSession } = useSessions();
  const history = useHistory();
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingTotp, setSubmittingTotp] = useState(false);
  const [resetting, setResetting] = useState(false);
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

  if (!ready) return null;
  if (surface === 'tenant' && tenant) return <Redirect to="/app" />;
  if (surface === 'platform' && platform) return <Redirect to="/plataforma" />;

  async function finish(userResult: User, secondFactorSatisfied = false) {
    if (surface === 'platform') {
      if (!secondFactorSatisfied) {
        setPlatformPreparationUser(userResult);
        return;
      }
      await openPlatformSession(userResult);
      history.replace('/plataforma');
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

  async function verifyTotp() {
    if (!resolver || !/^\d{6}$/.test(totpCode)) {
      setError('Captura los 6 dígitos de tu aplicación autenticadora.');
      return;
    }
    setSubmittingTotp(true);
    setError(null);
    try {
      await finish(await completeTotpSignIn(resolver, totpCode), true);
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
          <Logo />
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
              : 'Administra personal y mantén la Caja lista con permisos emitidos por el backend.'}
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
          <div className="auth-card__icon">
            {resolver ? <KeyRound aria-hidden="true" /> : <Mail aria-hidden="true" />}
          </div>
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

          {isPlatform && (
            <div className="auth-card__switch">
              <Link to="/acceso">Volver a Administración y POS</Link>
            </div>
          )}
            </>
          )}
        </div>
      </section>
    </main>
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
    }[error.code] ?? 'No fue posible iniciar sesión. Intenta nuevamente.'
  );
}
