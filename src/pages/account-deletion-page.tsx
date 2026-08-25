import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import type { MultiFactorResolver, User } from 'firebase/auth';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileLock2,
  KeyRound,
  ShieldCheck,
  Trash2,
  UserRoundX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Logo } from '../components/brand-mark';
import { Button, Feedback, Field } from '../components/ui';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { completeTotpSignIn, passwordSignIn } from '../lib/firebase';
import { createIdempotencyKey } from '../lib/idempotency';

const credentialsSchema = z.object({
  email: z.string().email('Captura un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

type Credentials = z.infer<typeof credentialsSchema>;
type DeletionStep = 'credentials' | 'mfa' | 'confirmation' | 'success';

export function AccountDeletionPage() {
  const { user: currentUser, configured, signOut } = useAuth();
  const { clearAll } = useSessions();
  const [step, setStep] = useState<DeletionStep>('credentials');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [understands, setUnderstands] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingTotp, setVerifyingTotp] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedEmail, setDeletedEmail] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deletionKey = useRef(createIdempotencyKey());

  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: {
      email: currentUser?.email ?? '',
      password: '',
    },
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  async function authenticate(credentials: Credentials) {
    setError(null);
    try {
      const result = await passwordSignIn(
        credentials.email.trim().toLowerCase(),
        credentials.password,
        true,
      );
      if (result.mfaResolver) {
        setResolver(result.mfaResolver);
        setStep('mfa');
        return;
      }
      if (!result.user) throw new Error('Firebase no devolvió una identidad válida.');
      prepareConfirmation(result.user);
    } catch (caught) {
      setError(authenticationErrorMessage(caught));
    }
  }

  function prepareConfirmation(user: User) {
    setAuthenticatedUser(user);
    setDeletedEmail(user.email ?? form.getValues('email').trim().toLowerCase());
    setResolver(null);
    setTotpCode('');
    setStep('confirmation');
  }

  async function verifyTotp() {
    if (!resolver || !/^\d{6}$/.test(totpCode)) {
      setError('Captura los 6 dígitos actuales de tu aplicación autenticadora.');
      return;
    }
    setVerifyingTotp(true);
    setError(null);
    try {
      prepareConfirmation(await completeTotpSignIn(resolver, totpCode));
    } catch (caught) {
      setError(authenticationErrorMessage(caught));
    } finally {
      setVerifyingTotp(false);
    }
  }

  async function deleteAccount() {
    if (!authenticatedUser || confirmation !== 'ELIMINAR' || !understands) return;
    setDeleting(true);
    setError(null);
    try {
      const firebaseToken = await authenticatedUser.getIdToken(true);
      await api.deleteOwnAccount(firebaseToken, deletionKey.current);
      clearAll();
      await signOut().catch(() => undefined);
      setAuthenticatedUser(null);
      setConfirmation('');
      setUnderstands(false);
      setStep('success');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDeleting(false);
    }
  }

  const content = stepContent(step);

  return (
    <main className="auth-page auth-page--deletion">
      <section className="auth-visual account-deletion-visual" aria-label="Control de privacidad de Vaiinilla">
        <Link to="/acceso" aria-label="Vaiinilla, volver al acceso">
          <Logo theme="dark" variant="splash" />
        </Link>

        <div className="auth-visual__content">
          <p className="eyebrow">Privacidad y control</p>
          <h1>Tu cuenta, <span>bajo tu control.</span></h1>
          <p>
            Puedes iniciar la eliminación desde esta página aunque ya no tengas la
            aplicación instalada.
          </p>
        </div>

        <ul className="account-deletion-points" aria-label="Protecciones del proceso">
          <li>
            <ShieldCheck aria-hidden="true" />
            <span><strong>Identidad confirmada</strong>Pedimos tu contraseña antes de continuar.</span>
          </li>
          <li>
            <UserRoundX aria-hidden="true" />
            <span><strong>Accesos revocados</strong>La cuenta y sus permisos dejan de funcionar.</span>
          </li>
          <li>
            <FileLock2 aria-hidden="true" />
            <span><strong>Registros protegidos</strong>La evidencia contable se conserva sin identidad personal.</span>
          </li>
        </ul>
      </section>

      <section className="auth-panel account-deletion-panel">
        <div className="auth-card account-deletion-card">
          <div className={`auth-card__icon ${step === 'confirmation' ? 'auth-card__icon--danger' : ''}`}>
            {step === 'credentials' && <KeyRound aria-hidden="true" />}
            {step === 'mfa' && <ShieldCheck aria-hidden="true" />}
            {step === 'confirmation' && <Trash2 aria-hidden="true" />}
            {step === 'success' && <CheckCircle2 aria-hidden="true" />}
          </div>
          <p className="eyebrow">Eliminación de cuenta</p>
          <h2 ref={headingRef} tabIndex={-1}>{content.title}</h2>
          <p className="auth-card__subtitle">{content.description}</p>

          {!configured && (
            <Feedback tone="error">
              El acceso seguro no está disponible porque Firebase no está configurado.
            </Feedback>
          )}
          {error && <Feedback tone="error">{error}</Feedback>}

          {step === 'credentials' && (
            <form className="account-deletion-form" onSubmit={(event) => void form.handleSubmit(authenticate)(event)}>
              <Field
                label="Correo de la cuenta"
                type="email"
                autoComplete="email"
                placeholder="nombre@ejemplo.com"
                error={form.formState.errors.email?.message}
                {...form.register('email')}
              />
              <div className="field">
                <label className="field__label" htmlFor="account-deletion-password">Contraseña</label>
                <div className="password-field">
                  <input
                    id="account-deletion-password"
                    className={`field__control ${form.formState.errors.password ? 'field__control--error' : ''}`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    aria-describedby={form.formState.errors.password ? 'account-deletion-password-error' : undefined}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    className="password-field__toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                {form.formState.errors.password?.message && (
                  <span id="account-deletion-password-error" className="field__error">
                    {form.formState.errors.password.message}
                  </span>
                )}
              </div>
              <Button type="submit" className="w-full" loading={form.formState.isSubmitting} disabled={!configured}>
                Confirmar identidad
              </Button>
            </form>
          )}

          {step === 'mfa' && (
            <form
              className="account-deletion-form"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyTotp();
              }}
            >
              <Field
                label="Código de 6 dígitos"
                name="account-deletion-totp"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="tracking-[0.35em]"
              />
              <Button type="submit" className="w-full" loading={verifyingTotp}>
                Verificar segundo factor
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setResolver(null);
                  setTotpCode('');
                  setError(null);
                  setStep('credentials');
                }}
              >
                Volver
              </Button>
            </form>
          )}

          {step === 'confirmation' && (
            <div className="account-deletion-confirmation">
              <div className="account-deletion-account">
                <span>Cuenta confirmada</span>
                <strong>{deletedEmail}</strong>
              </div>

              <section className="account-deletion-impact" aria-labelledby="deletion-impact-title">
                <h3 id="deletion-impact-title">Qué ocurrirá</h3>
                <ul>
                  <li>Se eliminará tu identidad de acceso en Firebase.</li>
                  <li>Se revocarán membresías, permisos y sesiones de Vaiinilla.</li>
                  <li>Tu nombre, correo e identificadores personales serán anonimizados.</li>
                </ul>
              </section>

              <Feedback tone="info">
                Los pedidos, pagos, movimientos y aceptaciones que deban conservar integridad
                contable o legal permanecerán asociados únicamente a una identidad anónima.
              </Feedback>

              <Field
                label="Escribe ELIMINAR para confirmar"
                name="account-deletion-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                hint="Debe coincidir exactamente y en mayúsculas."
              />

              <label className="account-deletion-consent">
                <input
                  type="checkbox"
                  checked={understands}
                  onChange={(event) => setUnderstands(event.target.checked)}
                />
                <span>
                  <strong>Entiendo que esta acción es definitiva.</strong>
                  Para volver a usar Vaiinilla tendré que crear una cuenta nueva.
                </span>
              </label>

              <Button
                type="button"
                variant="danger"
                className="w-full"
                loading={deleting}
                disabled={confirmation !== 'ELIMINAR' || !understands}
                onClick={() => void deleteAccount()}
              >
                Eliminar mi cuenta definitivamente
              </Button>
              <Button type="button" variant="ghost" className="w-full" disabled={deleting} onClick={() => setStep('credentials')}>
                Cancelar y volver
              </Button>
            </div>
          )}

          {step === 'success' && (
            <div className="account-deletion-success">
              <Feedback tone="success">
                La cuenta {deletedEmail && <strong>{deletedEmail}</strong>} fue eliminada y sus accesos quedaron revocados.
              </Feedback>
              <p>
                Ya puedes cerrar esta ventana. Si vuelves a Vaiinilla, deberás crear una cuenta nueva.
              </p>
              <Link className="button button--dark w-full" to="/acceso">Volver al inicio</Link>
            </div>
          )}

          {step !== 'success' && (
            <div className="auth-card__switch">
              <Link to="/acceso">No eliminar mi cuenta y volver al acceso</Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function stepContent(step: DeletionStep): { title: string; description: string } {
  return {
    credentials: {
      title: 'Confirma que eres tú',
      description: 'Inicia sesión nuevamente. No necesitas tener instalada la aplicación para completar el proceso.',
    },
    mfa: {
      title: 'Confirma el segundo factor',
      description: 'Esta cuenta está protegida. Captura el código actual de tu aplicación autenticadora.',
    },
    confirmation: {
      title: 'Revisa antes de eliminar',
      description: 'La eliminación revoca el acceso y no puede deshacerse. Revisa el alcance antes de confirmar.',
    },
    success: {
      title: 'Cuenta eliminada',
      description: 'La solicitud terminó correctamente y la sesión local fue cerrada.',
    },
  }[step];
}

function authenticationErrorMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return errorMessage(error);
  return {
    'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
    'auth/invalid-email': 'El correo no tiene un formato válido.',
    'auth/too-many-requests': 'Hay demasiados intentos. Espera un momento antes de continuar.',
    'auth/invalid-verification-code': 'El código del autenticador no es válido o ya cambió.',
    'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa tu conexión.',
  }[error.code] ?? 'No fue posible confirmar tu identidad. Intenta nuevamente.';
}
