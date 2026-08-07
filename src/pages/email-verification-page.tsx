import { FirebaseError } from 'firebase/app';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo, Spinner } from '../components/brand-mark';
import { firebaseConfigured, applyEmailVerificationCode } from '../lib/firebase';
import { readPendingInvitation } from '../lib/pending-invitation';

type VerificationState = 'checking' | 'success' | 'error';

interface EmailAction {
  code: string | null;
  mode: string | null;
}

function captureEmailAction(): EmailAction {
  const url = new URL(window.location.href);
  const action = {
    code: url.searchParams.get('oobCode')?.trim() || null,
    mode: url.searchParams.get('mode')?.trim() || null,
  };
  if (url.search) {
    window.history.replaceState(window.history.state, '', url.pathname);
  }
  return action;
}

export function EmailVerificationPage() {
  const [action] = useState(captureEmailAction);
  const [state, setState] = useState<VerificationState>('checking');
  const [message, setMessage] = useState('Estamos comprobando tu enlace seguro.');
  const hasPendingInvitation = Boolean(readPendingInvitation());

  useEffect(() => {
    let active = true;

    async function verify() {
      if (!firebaseConfigured) {
        setState('error');
        setMessage('Firebase no está configurado en esta Web.');
        return;
      }
      if (action.mode !== 'verifyEmail' || !action.code) {
        setState('error');
        setMessage('El enlace está incompleto o no corresponde a una verificación de correo.');
        return;
      }

      try {
        await applyEmailVerificationCode(action.code);
        if (!active) return;
        setState('success');
        setMessage('Tu correo quedó verificado correctamente.');
      } catch (error) {
        if (!active) return;
        setState('error');
        setMessage(verificationMessage(error));
      }
    }

    void verify();
    return () => {
      active = false;
    };
  }, [action]);

  return (
    <main className="verification-page">
      <section className="verification-card" aria-live="polite">
        <Link to="/acceso" aria-label="Vaiinilla, inicio">
          <Logo />
        </Link>

        <div className={`verification-icon verification-icon--${state}`}>
          {state === 'checking' && <Spinner />}
          {state === 'success' && <CheckCircle2 aria-hidden="true" />}
          {state === 'error' && <XCircle aria-hidden="true" />}
        </div>

        <p className="eyebrow">Verificación de correo</p>
        <h1>
          {state === 'checking'
            ? 'Un momento…'
            : state === 'success'
              ? 'Correo confirmado'
              : 'No pudimos verificarlo'}
        </h1>
        <p>{message}</p>

        {state === 'success' && hasPendingInvitation && (
          <Link className="button button--primary w-full" to="/invitaciones/aceptar">
            <MailCheck aria-hidden="true" /> Continuar con mi invitación
          </Link>
        )}
        {state === 'success' && !hasPendingInvitation && (
          <Link className="button button--primary w-full" to="/acceso">
            Ir al acceso
          </Link>
        )}
        {state === 'error' && (
          <Link className="button button--secondary w-full" to="/invitaciones/aceptar">
            Volver y solicitar otro correo
          </Link>
        )}
      </section>
    </main>
  );
}

function verificationMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return 'Ocurrió un error al validar el enlace. Solicita uno nuevo e inténtalo otra vez.';
  }
  return (
    {
      'auth/expired-action-code': 'El enlace ya expiró. Solicita un correo de verificación nuevo.',
      'auth/invalid-action-code': 'El enlace no es válido o ya fue utilizado.',
      'auth/user-disabled': 'Esta cuenta está deshabilitada.',
      'auth/user-not-found': 'La cuenta vinculada con el enlace ya no existe.',
      'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa tu conexión.',
    }[error.code] ?? 'No fue posible validar el enlace. Solicita uno nuevo e inténtalo otra vez.'
  );
}
