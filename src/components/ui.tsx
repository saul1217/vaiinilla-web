import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Spinner } from './brand-mark';

type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = '', variant = 'primary', loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`button button--${variant} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { id, label, error, hint, className = '', ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const descriptionId = `${fieldId}-description`;
  return (
    <label className="field" htmlFor={fieldId}>
      <span className="field__label">{label}</span>
      <input
        ref={ref}
        id={fieldId}
        className={`field__control ${error ? 'field__control--error' : ''} ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptionId : undefined}
        {...props}
      />
      {(error || hint) && (
        <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </span>
      )}
    </label>
  );
});

export function Feedback({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}) {
  return (
    <div className={`feedback feedback--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'success' ? (
        <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${contentClassName}`}>
          <div className="pr-10">
            <Dialog.Title className="text-xl font-bold text-ink">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close className="dialog-close" aria-label="Cerrar ventana">
            <X aria-hidden="true" className="size-5" />
          </Dialog.Close>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-ink sm:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h2 className="mt-4 text-lg font-bold text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
