import { zodResolver } from '@hookform/resolvers/zod';
import { FirebaseError } from 'firebase/app';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Logo, Spinner } from '../components/brand-mark';
import { Button, Feedback, Field } from '../components/ui';
import {
  applyPasswordReset,
  firebaseConfigured,
  inspectPasswordResetCode,
} from '../lib/firebase';

const passwordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmation: z.string().min(1, 'Confirma la nueva contraseña.'),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ['confirmation'],
    message: 'Las contraseñas no coinciden.',
  });

type PasswordValues = z.infer<typeof passwordSchema>;
type RecoveryState = 'checking' | 'ready' | 'success' | 'error';

function captureResetAction() {
  const url = new URL(window.location.href);
  const result = {
    code: url.searchParams.get('oobCode')?.trim() || null,
    mode: url.searchParams.get('mode')?.trim() || null,
  };
  if (url.search) window.history.replaceState(window.history.state, '', url.pathname);
  return result;
}

export function PasswordRecoveryPage() {
  const [action] = useState(captureResetAction);
  const [state, setState] = useState<RecoveryState>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('Comprobando el enlace seguro…');
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  useEffect(() => {
    let active = true;
    async function inspect() {
      if (!firebaseConfigured) {
        setState('error');
        setMessage('Firebase no está configurado en esta Web.');
        return;
      }
      if (action.mode !== 'resetPassword' || !action.code) {
        setState('error');
        setMessage('El enlace está incompleto o no corresponde a una recuperación.');
        return;
      }
      try {
        const actionEmail = await inspectPasswordResetCode(action.code);
        if (!active) return;
        setEmail(actionEmail);
        setState('ready');
        setMessage('Crea una contraseña nueva para recuperar tu cuenta.');
      } catch (error) {
        if (!active) return;
        setState('error');
        setMessage(recoveryMessage(error));
      }
    }
    void inspect();
    return () => {
      active = false;
    };
  }, [action]);

  async function submit(values: PasswordValues) {
    if (!action.code) return;
    try {
      await applyPasswordReset(action.code, values.password);
      setState('success');
      setMessage('Tu contraseña se actualizó. Ya puedes iniciar sesión.');
    } catch (error) {
      setState('error');
      setMessage(recoveryMessage(error));
    }
  }

  return (
    <main className="verification-page">
      <section className="verification-card" aria-live="polite">
        <Link to="/acceso" aria-label="Vaiinilla, inicio"><Logo /></Link>
        <div className={`verification-icon verification-icon--${state}`}>
          {state === 'checking' && <Spinner />}
          {state === 'ready' && <KeyRound aria-hidden="true" />}
          {state === 'success' && <CheckCircle2 aria-hidden="true" />}
          {state === 'error' && <XCircle aria-hidden="true" />}
        </div>
        <p className="eyebrow">Recuperación de acceso</p>
        <h1>
          {state === 'checking'
            ? 'Un momento…'
            : state === 'ready'
              ? 'Nueva contraseña'
              : state === 'success'
                ? 'Acceso recuperado'
                : 'Enlace no disponible'}
        </h1>
        <p>{message}</p>

        {state === 'ready' && (
          <form className="invitation-form text-left" onSubmit={(event) => void form.handleSubmit(submit)(event)}>
            {email && <Feedback tone="info">Cuenta: {email}</Feedback>}
            <Field
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              error={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <Field
              label="Confirma la contraseña"
              type="password"
              autoComplete="new-password"
              error={form.formState.errors.confirmation?.message}
              {...form.register('confirmation')}
            />
            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Guardar nueva contraseña
            </Button>
          </form>
        )}
        {(state === 'success' || state === 'error') && (
          <Link className="button button--secondary w-full" to="/acceso">
            Volver al acceso
          </Link>
        )}
      </section>
    </main>
  );
}

function recoveryMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return 'No fue posible usar el enlace. Solicita una recuperación nueva.';
  }
  return (
    {
      'auth/expired-action-code': 'El enlace ya expiró. Solicita una recuperación nueva.',
      'auth/invalid-action-code': 'El enlace no es válido o ya fue utilizado.',
      'auth/user-disabled': 'Esta cuenta está deshabilitada.',
      'auth/user-not-found': 'La cuenta vinculada con el enlace ya no existe.',
      'auth/weak-password': 'Elige una contraseña más segura.',
      'auth/network-request-failed': 'No fue posible contactar Firebase. Revisa tu conexión.',
    }[error.code] ?? 'No fue posible usar el enlace. Solicita una recuperación nueva.'
  );
}
