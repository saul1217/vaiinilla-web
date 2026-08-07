import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import type { MultiFactorResolver, User } from 'firebase/auth';
import {
  ArrowRight,
  Check,
  KeyRound,
  LogOut,
  MailCheck,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Logo } from '../components/brand-mark';
import { Button, Feedback, Field } from '../components/ui';
import { legalDocumentsReady } from '../content/legal-documents';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { errorMessage, VaiinillaApiError } from '../lib/api-error';
import {
  completeTotpSignIn,
  createPasswordAccount,
  passwordSignIn,
  updateFirebaseDisplayName,
} from '../lib/firebase';
import {
  capturePendingInvitationFromUrl,
  clearPendingInvitation,
} from '../lib/pending-invitation';
import type { InvitationAcceptance, LegalVersions } from '../types/api';

const credentialsSchema = z.object({
  email: z.string().email('Captura un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
});

const registrationSchema = credentialsSchema
  .extend({ confirmPassword: z.string().min(1, 'Confirma tu contraseña.') })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  });

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Captura tu nombre completo.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),
});

type Credentials = z.infer<typeof credentialsSchema>;
type Registration = z.infer<typeof registrationSchema>;
type Profile = z.infer<typeof profileSchema>;
type AuthMode = 'login' | 'register';

export function InvitationAcceptancePage() {
  const { user, ready, configured, signOut } = useAuth();
  const [invitationToken] = useState(capturePendingInvitationFromUrl);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [signedUser, setSignedUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [profileRequired, setProfileRequired] = useState(false);
  const [legalVersions, setLegalVersions] = useState<LegalVersions | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [accepted, setAccepted] = useState<InvitationAcceptance | null>(null);

  const loginForm = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });
  const registrationForm = useForm<Registration>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });
  const profileForm = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.displayName ?? '' },
  });

  const currentUser = signedUser ?? user;
  const currentEmailVerified = emailVerified ?? currentUser?.emailVerified ?? false;
  const legalReady = Boolean(
    legalVersions &&
      legalDocumentsReady(
        legalVersions.terminos_version,
        legalVersions.privacidad_version,
      ),
  );
  const progressStep = accepted
    ? 4
    : profileRequired
      ? 3
      : currentUser && !currentEmailVerified
        ? 2
        : 1;

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const interval = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [resendSeconds]);

  const legalLinks = useMemo(() => {
    if (!legalVersions) return null;
    return {
      terms: localLegalPath(
        legalVersions.terminos_url,
        `/legal/terminos/${legalVersions.terminos_version}`,
      ),
      privacy: localLegalPath(
        legalVersions.privacidad_url,
        `/legal/privacidad/${legalVersions.privacidad_version}`,
      ),
    };
  }, [legalVersions]);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function finishSignIn(nextUser: User) {
    setSignedUser(nextUser);
    setEmailVerified(nextUser.emailVerified);
    setResolver(null);
    setTotpCode('');
    resetMessages();
  }

  async function submitCredentials(credentials: Credentials) {
    resetMessages();
    try {
      const result = await passwordSignIn(
        credentials.email.trim().toLowerCase(),
        credentials.password,
      );
      if (result.mfaResolver) {
        setResolver(result.mfaResolver);
        return;
      }
      if (result.user) finishSignIn(result.user);
    } catch (caught) {
      setError(authenticationMessage(caught));
    }
  }

  async function submitRegistration(values: Registration) {
    setBusy(true);
    resetMessages();
    try {
      const nextUser = await createPasswordAccount(
        values.email.trim().toLowerCase(),
        values.password,
      );
      finishSignIn(nextUser);
      await sendVerification(nextUser);
    } catch (caught) {
      setError(authenticationMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp() {
    if (!resolver || !/^\d{6}$/.test(totpCode)) {
      setError('Captura los 6 dígitos de tu aplicación autenticadora.');
      return;
    }
    setBusy(true);
    resetMessages();
    try {
      finishSignIn(await completeTotpSignIn(resolver, totpCode));
    } catch (caught) {
      setError(authenticationMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendVerification(targetUser = currentUser) {
    if (!targetUser || resendSeconds > 0) return;
    setBusy(true);
    resetMessages();
    try {
      const firebaseToken = await targetUser.getIdToken(true);
      await api.requestEmailVerification(firebaseToken);
      setEmailSent(true);
      setResendSeconds(60);
      setNotice(
        `Enviamos el enlace a ${targetUser.email ?? 'tu correo'}. Mantén esta pestaña abierta.`,
      );
    } catch (caught) {
      if (caught instanceof VaiinillaApiError && caught.retryAfter) {
        setResendSeconds(caught.retryAfter);
      }
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function refreshEmailStatus() {
    if (!currentUser) return;
    setBusy(true);
    resetMessages();
    try {
      await currentUser.reload();
      setSignedUser(currentUser);
      setEmailVerified(currentUser.emailVerified);
      if (!currentUser.emailVerified) {
        setError(
          'El correo todavía no aparece como verificado. Abre el enlace del correo y vuelve a intentarlo.',
        );
        return;
      }
      await continueWithVerifiedUser(currentUser);
    } catch (caught) {
      setError(authenticationMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithCurrentUser() {
    if (!currentUser) return;
    setBusy(true);
    resetMessages();
    try {
      await currentUser.reload();
      setSignedUser(currentUser);
      setEmailVerified(currentUser.emailVerified);
      if (!currentUser.emailVerified) {
        if (!emailSent) await sendVerification(currentUser);
        return;
      }
      await continueWithVerifiedUser(currentUser);
    } catch (caught) {
      setError(authenticationMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithVerifiedUser(targetUser: User) {
    if (!invitationToken) return;
    const firebaseToken = await targetUser.getIdToken(true);
    try {
      const result = await api.acceptInvitation(firebaseToken, invitationToken);
      clearPendingInvitation();
      setAccepted(result);
    } catch (caught) {
      if (caught instanceof VaiinillaApiError && caught.code === 'IDENTITY_NOT_REGISTERED') {
        setProfileRequired(true);
        profileForm.reset({ name: targetUser.displayName ?? '' });
        await loadLegalVersions();
        return;
      }
      throw caught;
    }
  }

  async function loadLegalVersions() {
    setLegalLoading(true);
    try {
      setLegalVersions(await api.getLegalVersions());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLegalLoading(false);
    }
  }

  async function submitProfile(values: Profile) {
    if (!currentUser || !invitationToken || !legalVersions) return;
    if (!legalReady) {
      setError('Los documentos legales aprobados todavía no están publicados.');
      return;
    }
    if (!termsAccepted || !privacyAccepted) {
      setError('Lee y acepta los Términos y el Aviso de privacidad para continuar.');
      return;
    }

    setBusy(true);
    resetMessages();
    try {
      const firebaseToken = await currentUser.getIdToken(true);
      await api.registerIdentity(firebaseToken, {
        nombre: values.name.trim(),
        terminos_version: legalVersions.terminos_version,
        privacidad_version: legalVersions.privacidad_version,
      });
      await updateFirebaseDisplayName(currentUser, values.name).catch(() => undefined);
      const result = await api.acceptInvitation(firebaseToken, invitationToken);
      clearPendingInvitation();
      setAccepted(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function changeAccount() {
    await signOut();
    setSignedUser(null);
    setEmailVerified(null);
    setResolver(null);
    setTotpCode('');
    setEmailSent(false);
    setResendSeconds(0);
    setProfileRequired(false);
    setLegalVersions(null);
    setTermsAccepted(false);
    setPrivacyAccepted(false);
    resetMessages();
  }

  return (
    <main className="invitation-page">
      <div className="invitation-shell">
        <section className="invitation-intro" aria-label="Invitación a Vaiinilla">
          <Link to="/acceso" aria-label="Vaiinilla, inicio">
            <Logo />
          </Link>
          <div>
            <p className="eyebrow">Acceso protegido</p>
            <h1>Tu lugar en el equipo empieza aquí.</h1>
            <p>
              Si todavía no tienes cuenta, créala aquí. Vaiinilla verificará tu correo,
              registrará tu identidad y activará solo el rol que te invitaron a usar.
            </p>
          </div>
          <div className="invitation-security-note">
            <ShieldCheck aria-hidden="true" />
            <span>El código privado del correo fue retirado de la dirección del navegador.</span>
          </div>
        </section>

        <section className="invitation-panel" aria-labelledby="invitation-title">
          <div className="invitation-card">
            <InvitationProgress current={progressStep} />
            <div className="invitation-card__icon">
              {resolver ? <KeyRound aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
            </div>
            <p className="eyebrow">Invitación de personal</p>
            <h2 id="invitation-title">
              {accepted
                ? 'Acceso activado'
                : profileRequired
                  ? 'Completa tu perfil'
                  : resolver
                    ? 'Confirma tu segundo factor'
                    : currentUser && !currentEmailVerified
                      ? 'Verifica tu correo'
                      : 'Acepta tu invitación'}
            </h2>

            {!ready && <p className="invitation-card__subtitle">Comprobando tu sesión segura…</p>}

            {ready && !invitationToken && (
              <>
                <p className="invitation-card__subtitle">
                  Este enlace no incluye un código válido o permaneció abierto demasiado tiempo.
                </p>
                <Feedback tone="error">Solicita al administrador que reenvíe la invitación.</Feedback>
                <Link className="button button--secondary mt-6 w-full" to="/acceso">
                  Volver al acceso
                </Link>
              </>
            )}

            {ready && invitationToken && !configured && (
              <Feedback tone="error">
                Firebase todavía no está configurado en esta Web. Revisa las variables VITE_FIREBASE_*.
              </Feedback>
            )}

            {error && <div className="mt-4"><Feedback tone="error">{error}</Feedback></div>}
            {notice && <div className="mt-4"><Feedback tone="info">{notice}</Feedback></div>}

            {ready && invitationToken && configured && accepted && (
              <div className="invitation-result">
                <Feedback tone="success">
                  La membresía de {accepted.membresia.rol} quedó activa correctamente.
                </Feedback>
                <p>Ya puedes seleccionar el establecimiento autorizado con esta misma cuenta.</p>
                <Link className="button button--primary w-full" to="/accesos">
                  Ver mis accesos <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            )}

            {ready && invitationToken && configured && !accepted && resolver && (
              <form className="invitation-form" onSubmit={(event) => { event.preventDefault(); void verifyTotp(); }}>
                <p className="invitation-card__subtitle">
                  Esta cuenta ya protege su acceso con TOTP. Captura el código actual para continuar.
                </p>
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
                <Button type="submit" className="w-full" loading={busy}>Confirmar identidad</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => void changeAccount()}>
                  Usar otra cuenta
                </Button>
              </form>
            )}

            {ready && invitationToken && configured && !accepted && !resolver && !currentUser && (
              <div className="invitation-auth">
                <div className="auth-mode" role="tablist" aria-label="Tipo de acceso">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'login'}
                    className={authMode === 'login' ? 'auth-mode__button auth-mode__button--active' : 'auth-mode__button'}
                    onClick={() => { setAuthMode('login'); resetMessages(); }}
                  >
                    Ya tengo cuenta
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === 'register'}
                    className={authMode === 'register' ? 'auth-mode__button auth-mode__button--active' : 'auth-mode__button'}
                    onClick={() => { setAuthMode('register'); resetMessages(); }}
                  >
                    Crear cuenta
                  </button>
                </div>

                {authMode === 'login' ? (
                  <form className="invitation-form" onSubmit={(event) => void loginForm.handleSubmit(submitCredentials)(event)}>
                    <p className="invitation-card__subtitle">Entra con el correo que recibió la invitación.</p>
                    <Field
                      label="Correo invitado"
                      type="email"
                      autoComplete="email"
                      placeholder="nombre@ejemplo.com"
                      error={loginForm.formState.errors.email?.message}
                      {...loginForm.register('email')}
                    />
                    <Field
                      label="Contraseña"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      error={loginForm.formState.errors.password?.message}
                      {...loginForm.register('password')}
                    />
                    <Button type="submit" className="w-full" loading={loginForm.formState.isSubmitting}>
                      Continuar
                    </Button>
                  </form>
                ) : (
                  <form className="invitation-form" onSubmit={(event) => void registrationForm.handleSubmit(submitRegistration)(event)}>
                    <p className="invitation-card__subtitle">
                      Usa el correo invitado. Después te enviaremos un enlace para verificarlo.
                    </p>
                    <Field
                      label="Correo invitado"
                      type="email"
                      autoComplete="email"
                      placeholder="nombre@ejemplo.com"
                      error={registrationForm.formState.errors.email?.message}
                      {...registrationForm.register('email')}
                    />
                    <Field
                      label="Crea una contraseña"
                      type="password"
                      autoComplete="new-password"
                      hint="Mínimo 8 caracteres."
                      error={registrationForm.formState.errors.password?.message}
                      {...registrationForm.register('password')}
                    />
                    <Field
                      label="Confirma la contraseña"
                      type="password"
                      autoComplete="new-password"
                      error={registrationForm.formState.errors.confirmPassword?.message}
                      {...registrationForm.register('confirmPassword')}
                    />
                    <Button type="submit" className="w-full" loading={busy || registrationForm.formState.isSubmitting}>
                      <UserPlus aria-hidden="true" /> Crear mi cuenta
                    </Button>
                  </form>
                )}
              </div>
            )}

            {ready && invitationToken && configured && !accepted && !resolver && currentUser && !profileRequired && (
              <div className="invitation-confirmation">
                <p className="invitation-card__subtitle">
                  {currentEmailVerified
                    ? 'Confirma que esta es la cuenta invitada. El acceso se activará con el rol enviado por el administrador.'
                    : 'Primero confirma que el correo te pertenece. Puedes crear la cuenta y verificarla completamente desde esta Web.'}
                </p>
                <SignedAccount user={currentUser} verified={currentEmailVerified} onChangeAccount={changeAccount} />

                {!currentEmailVerified ? (
                  <>
                    {!emailSent && (
                      <Button type="button" className="w-full" loading={busy} onClick={() => void sendVerification()}>
                        Enviar correo de verificación
                      </Button>
                    )}
                    {emailSent && (
                      <Button type="button" className="w-full" loading={busy} onClick={() => void refreshEmailStatus()}>
                        Ya verifiqué mi correo
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      disabled={resendSeconds > 0}
                      onClick={() => void sendVerification()}
                    >
                      {resendSeconds > 0 ? `Reenviar en ${formatWait(resendSeconds)}` : 'Reenviar correo'}
                    </Button>
                    <p className="invitation-helper">
                      Mantén esta pestaña abierta. El enlace regresará a Vaiinilla para continuar.
                    </p>
                  </>
                ) : (
                  <Button type="button" className="w-full" loading={busy} onClick={() => void continueWithCurrentUser()}>
                    Continuar con esta cuenta
                  </Button>
                )}
              </div>
            )}

            {ready && invitationToken && configured && !accepted && currentUser && profileRequired && (
              <form className="invitation-form" onSubmit={(event) => void profileForm.handleSubmit(submitProfile)(event)}>
                <p className="invitation-card__subtitle">
                  Solo falta tu nombre y el consentimiento legal vigente. Después activaremos la invitación automáticamente.
                </p>
                <SignedAccount user={currentUser} verified onChangeAccount={changeAccount} />
                <Field
                  label="Nombre completo"
                  type="text"
                  autoComplete="name"
                  placeholder="Tu nombre"
                  error={profileForm.formState.errors.name?.message}
                  {...profileForm.register('name')}
                />

                {legalLoading && <p className="invitation-helper">Consultando las versiones legales vigentes…</p>}
                {legalVersions && legalLinks && (
                  <div className="legal-consent">
                    {!legalReady && (
                      <Feedback tone="error">
                        Los textos legales versión {legalVersions.terminos_version} aún no están aprobados y publicados. El alta permanecerá bloqueada hasta resolverlo.
                      </Feedback>
                    )}
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        disabled={!legalReady}
                        onChange={(event) => setTermsAccepted(event.target.checked)}
                      />
                      <span>
                        Acepto los{' '}
                        <a href={legalLinks.terms} target="_blank" rel="noreferrer">
                          Términos y condiciones (versión {legalVersions.terminos_version})
                        </a>
                      </span>
                    </label>
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={privacyAccepted}
                        disabled={!legalReady}
                        onChange={(event) => setPrivacyAccepted(event.target.checked)}
                      />
                      <span>
                        He leído el{' '}
                        <a href={legalLinks.privacy} target="_blank" rel="noreferrer">
                          Aviso de privacidad (versión {legalVersions.privacidad_version})
                        </a>
                      </span>
                    </label>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  loading={busy || profileForm.formState.isSubmitting}
                  disabled={!legalReady || !termsAccepted || !privacyAccepted}
                >
                  Crear perfil y activar acceso
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InvitationProgress({ current }: { current: number }) {
  const steps = ['Cuenta', 'Correo', 'Perfil', 'Acceso'];
  return (
    <ol className="invitation-progress" aria-label={`Paso ${current} de 4`}>
      {steps.map((step, index) => {
        const number = index + 1;
        return (
          <li key={step} className={number <= current ? 'invitation-progress__step invitation-progress__step--active' : 'invitation-progress__step'}>
            <span>{number < current ? <Check aria-hidden="true" /> : number}</span>
            <small>{step}</small>
          </li>
        );
      })}
    </ol>
  );
}

function SignedAccount({
  user,
  verified,
  onChangeAccount,
}: {
  user: User;
  verified: boolean;
  onChangeAccount: () => Promise<void>;
}) {
  return (
    <div className="signed-account">
      <div>
        <span>Cuenta activa</span>
        <strong>{user.email ?? 'Correo no disponible'}</strong>
        <small>{verified ? 'Correo verificado' : 'Correo pendiente de verificación'}</small>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Cerrar sesión y usar otra cuenta"
        onClick={() => void onChangeAccount()}
      >
        <LogOut aria-hidden="true" />
      </button>
    </div>
  );
}

function localLegalPath(url: string, fallback: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname;
  } catch {
    return fallback;
  }
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

function authenticationMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) return errorMessage(error);
  return (
    {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Elige “Ya tengo cuenta”.',
      'auth/invalid-email': 'El correo no tiene un formato válido.',
      'auth/weak-password': 'Elige una contraseña más segura de al menos 8 caracteres.',
      'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
      'auth/too-many-requests': 'Hay demasiados intentos. Espera un momento antes de continuar.',
      'auth/invalid-verification-code': 'El código TOTP no es válido o ya cambió.',
      'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa tu conexión.',
      'auth/operation-not-allowed': 'Firebase no tiene habilitado el acceso con correo y contraseña.',
    }[error.code] ?? 'No fue posible confirmar la cuenta. Intenta nuevamente.'
  );
}
