import { Check, Clipboard, ExternalLink, MailCheck, ScanLine, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { legalDocumentsReady } from '../content/legal-documents';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import {
  beginTotpEnrollment,
  completeTotpEnrollment,
  firebaseSignOut,
  hasTotpEnrollment,
  updateFirebaseDisplayName,
  type TotpEnrollment,
} from '../lib/firebase';
import { unpublishedLegalTestingEnabled } from '../lib/legal-testing';
import type { LegalVersions } from '../types/api';
import { Button, Feedback, Field } from './ui';

type PreparationStep = 'email' | 'identity' | 'totp' | 'complete';

interface PlatformAccountPreparationProps {
  user: User;
  onExit: () => Promise<void>;
}

export function PlatformAccountPreparation({ user, onExit }: PlatformAccountPreparationProps) {
  const [step, setStep] = useState<PreparationStep>(user.emailVerified ? 'identity' : 'email');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [name, setName] = useState(user.displayName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [legalVersions, setLegalVersions] = useState<LegalVersions | null>(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [totpEnrollment, setTotpEnrollment] = useState<TotpEnrollment | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);

  const email = user.email ?? 'Correo no disponible';
  const legalDocumentsPublished = Boolean(
    legalVersions &&
      legalDocumentsReady(
        legalVersions.terminos_version,
        legalVersions.privacidad_version,
      ),
  );
  const legalReady = legalDocumentsPublished || unpublishedLegalTestingEnabled;
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

  useEffect(() => {
    let active = true;
    api
      .getLegalVersions()
      .then((versions) => {
        if (active) setLegalVersions(versions);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLegalLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function sendVerification() {
    setBusy(true);
    resetMessages();
    try {
      await api.requestEmailVerification(await user.getIdToken(true));
      setEmailSent(true);
      setResendSeconds(60);
      setNotice(`Enviamos el enlace de verificación a ${email}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function refreshVerification() {
    setBusy(true);
    resetMessages();
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError('El correo todavía aparece pendiente. Abre el enlace recibido y vuelve a intentarlo.');
        return;
      }
      await user.getIdToken(true);
      setNotice('Correo verificado. Continúa con tu identidad.');
      setStep('identity');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setNameError('Captura el nombre completo de la persona responsable.');
      return;
    }
    if (!legalVersions || !legalReady || !termsAccepted || !privacyAccepted) {
      setError('Confirma las condiciones de identidad antes de continuar.');
      return;
    }

    setBusy(true);
    setNameError(null);
    resetMessages();
    try {
      await updateFirebaseDisplayName(user, cleanName);
      await api.registerIdentity(await user.getIdToken(true), {
        nombre: cleanName,
        terminos_version: legalVersions.terminos_version,
        privacidad_version: legalVersions.privacidad_version,
      });
      if (hasTotpEnrollment(user)) {
        await firebaseSignOut();
        setStep('complete');
        return;
      }
      setNotice('Identidad registrada. Ahora protege la cuenta con Google Authenticator.');
      setStep('totp');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function startTotpEnrollment() {
    setBusy(true);
    resetMessages();
    try {
      const enrollment = await beginTotpEnrollment(user);
      const image = await toDataURL(enrollment.qrCodeUri, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#16150F', light: '#FBF9F2' },
      });
      setTotpEnrollment(enrollment);
      setQrCode(image);
      setNotice('Escanea el código o captura la clave manual en tu aplicación autenticadora.');
    } catch (caught) {
      setError(totpMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function finishTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totpEnrollment || !/^\d{6}$/.test(totpCode)) {
      setTotpError('Captura los 6 dígitos que muestra Google Authenticator.');
      return;
    }

    setBusy(true);
    setTotpError(null);
    resetMessages();
    try {
      await completeTotpEnrollment(user, totpEnrollment, totpCode);
      await firebaseSignOut();
      setTotpEnrollment(null);
      setQrCode(null);
      setTotpCode('');
      setStep('complete');
    } catch (caught) {
      setTotpError(totpMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!totpEnrollment) return;
    try {
      await navigator.clipboard.writeText(totpEnrollment.secretKey);
      setNotice('Clave copiada. Guárdala únicamente en la aplicación autenticadora.');
    } catch {
      setError('No fue posible copiar la clave. Selecciónala manualmente.');
    }
  }

  return (
    <div className="platform-preparation">
      <div className="auth-card__icon">
        {step === 'email' && <MailCheck aria-hidden="true" />}
        {step === 'identity' && <UserRoundCheck aria-hidden="true" />}
        {step === 'totp' && <ScanLine aria-hidden="true" />}
        {step === 'complete' && <ShieldCheck aria-hidden="true" />}
      </div>
      <p className="eyebrow">Preparación de cuenta existente</p>
      <h2>{stepTitle(step)}</h2>
      <p className="auth-card__subtitle">{stepDescription(step, email)}</p>

      <PreparationProgress step={step} />

      {error && <Feedback tone="error">{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}

      {step === 'email' && (
        <div className="preparation-panel space-y-4">
          <AccountSummary email={email} status="Pendiente de verificación" />
          {!emailSent ? (
            <Button type="button" className="w-full" loading={busy} onClick={() => void sendVerification()}>
              Enviar correo de verificación
            </Button>
          ) : (
            <Button type="button" className="w-full" loading={busy} onClick={() => void refreshVerification()}>
              Ya verifiqué mi correo
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy || resendSeconds > 0}
            onClick={() => void sendVerification()}
          >
            {resendSeconds > 0 ? `Reenviar en ${resendSeconds} s` : 'Reenviar correo'}
          </Button>
          <p className="preparation-help">
            Abre el enlace recibido y regresa a esta pestaña. Verificar el correo no concede permisos de Super Admin.
          </p>
        </div>
      )}

      {step === 'identity' && (
        <form className="preparation-panel space-y-4" onSubmit={(event) => void submitIdentity(event)}>
          <AccountSummary email={email} status="Correo verificado" />
          <Field
            label="Nombre completo"
            name="platform-preparation-name"
            type="text"
            autoComplete="name"
            value={name}
            error={nameError ?? undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
          />

          {legalLoading && <p className="preparation-help">Consultando las versiones legales vigentes…</p>}
          {legalVersions && legalLinks && (
            <div className="legal-consent">
              {!legalDocumentsPublished && !unpublishedLegalTestingEnabled && (
                <Feedback tone="error">
                  Los documentos legales todavía no están publicados. El alta permanece bloqueada.
                </Feedback>
              )}
              {!legalDocumentsPublished && unpublishedLegalTestingEnabled && (
                <Feedback tone="info">
                  <strong>Modo de prueba activo.</strong> Esta identidad quedará registrada en la base de datos real para la validación interna.
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
                  {legalDocumentsPublished ? 'Acepto los ' : 'Confirmo la prueba interna con los '}
                  <a href={legalLinks.terms} target="_blank" rel="noreferrer">
                    Términos versión {legalVersions.terminos_version}
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
                  {legalDocumentsPublished ? 'He leído el ' : 'Confirmo la prueba interna sin un '}
                  <a href={legalLinks.privacy} target="_blank" rel="noreferrer">
                    Aviso de privacidad publicado
                  </a>
                </span>
              </label>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            loading={busy}
            disabled={!legalReady || !termsAccepted || !privacyAccepted}
          >
            Registrar identidad y continuar
          </Button>
        </form>
      )}

      {step === 'totp' && (
        <div className="preparation-panel space-y-4">
          {!totpEnrollment && (
            <>
              <div className="preparation-security-note">
                <ShieldCheck aria-hidden="true" />
                <p>La aplicación autenticadora será obligatoria cada vez que esta cuenta intente entrar a Plataforma.</p>
              </div>
              <Button type="button" className="w-full" loading={busy} onClick={() => void startTotpEnrollment()}>
                Configurar Google Authenticator
              </Button>
            </>
          )}

          {totpEnrollment && qrCode && (
            <form className="space-y-4" onSubmit={(event) => void finishTotp(event)}>
              <div className="totp-setup">
                <p className="totp-setup__step">1. Escanea este código con Google Authenticator.</p>
                <img src={qrCode} alt={`Código QR para proteger la cuenta ${email}`} width="240" height="240" />
                <a className="button button--secondary w-full" href={totpEnrollment.qrCodeUri}>
                  <ExternalLink aria-hidden="true" /> Abrir aplicación autenticadora
                </a>
              </div>
              <div className="totp-secret">
                <span>Clave manual</span>
                <code>{totpEnrollment.secretKey}</code>
                <Button type="button" variant="ghost" onClick={() => void copySecret()}>
                  <Clipboard aria-hidden="true" /> Copiar clave
                </Button>
              </div>
              <Field
                label="2. Código actual de 6 dígitos"
                name="platform-totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={totpCode}
                error={totpError ?? undefined}
                className="tracking-[0.35em]"
                onChange={(event) => {
                  setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  setTotpError(null);
                }}
              />
              <Button type="submit" className="w-full" loading={busy}>
                Confirmar Google Authenticator
              </Button>
            </form>
          )}
        </div>
      )}

      {step === 'complete' && (
        <div className="preparation-panel space-y-4">
          <Feedback tone="success">
            La cuenta quedó verificada, registrada y protegida con TOTP.
          </Feedback>
          <div className="preparation-security-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              Todavía no tiene permisos de Super Admin. El administrador debe autorizarla mediante el procedimiento manual auditado.
            </p>
          </div>
          <Button type="button" className="w-full" onClick={() => void onExit()}>
            Volver al acceso
          </Button>
        </div>
      )}

      {step !== 'complete' && (
        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={() => void onExit()}>
          Usar otra cuenta
        </Button>
      )}
    </div>
  );
}

function PreparationProgress({ step }: { step: PreparationStep }) {
  const steps: Array<{ id: Exclude<PreparationStep, 'complete'>; label: string }> = [
    { id: 'email', label: 'Correo' },
    { id: 'identity', label: 'Identidad' },
    { id: 'totp', label: 'Protección' },
  ];
  const current = step === 'complete' ? steps.length : steps.findIndex((item) => item.id === step);

  return (
    <ol className="preparation-progress" aria-label={`Preparación: paso ${Math.min(current + 1, 3)} de 3`}>
      {steps.map((item, index) => (
        <li key={item.id} className={index <= current ? 'preparation-progress__step preparation-progress__step--active' : 'preparation-progress__step'}>
          <span>{index < current || step === 'complete' ? <Check aria-hidden="true" /> : index + 1}</span>
          <small>{item.label}</small>
        </li>
      ))}
    </ol>
  );
}

function AccountSummary({ email, status }: { email: string; status: string }) {
  return (
    <div className="preparation-account">
      <span>Cuenta existente</span>
      <strong>{email}</strong>
      <small>{status}</small>
    </div>
  );
}

function stepTitle(step: PreparationStep): string {
  return {
    email: 'Verifica tu correo',
    identity: 'Confirma tu identidad',
    totp: 'Protege la cuenta',
    complete: 'Preparación terminada',
  }[step];
}

function stepDescription(step: PreparationStep, email: string): string {
  return {
    email: `Enviaremos un enlace a ${email}. Solo quien controla ese buzón puede continuar.`,
    identity: 'Registra a la persona responsable antes de configurar el segundo factor.',
    totp: 'Vincula una aplicación compatible con TOTP. Google Authenticator funciona correctamente.',
    complete: 'La cuenta está lista para que un administrador decida si concede la autoridad global.',
  }[step];
}

function localLegalPath(url: string, fallback: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return fallback;
  }
}

function totpMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No fue posible configurar Google Authenticator.';
  const code = 'code' in error ? String(error.code) : '';
  return (
    {
      'auth/invalid-verification-code': 'El código no es válido o ya cambió. Captura el código actual.',
      'auth/requires-recent-login': 'La sesión perdió vigencia. Vuelve al acceso e inicia sesión nuevamente.',
      'auth/maximum-second-factor-count-exceeded': 'Esta cuenta ya alcanzó el límite de factores permitidos.',
      'auth/second-factor-already-in-use': 'Esta aplicación autenticadora ya está vinculada.',
      'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa la conexión.',
    }[code] ?? error.message
  );
}
