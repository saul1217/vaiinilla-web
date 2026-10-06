import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Check, CheckCircle2, ChevronDown, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
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
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>{label}</label>
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
    </div>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id, label, error, hint, className = '', children, ...props },
  ref,
) {
  const fieldId = id ?? props.name;
  const descriptionId = `${fieldId}-description`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>{label}</label>
      <select
        ref={ref}
        id={fieldId}
        className={`field__control ${error ? 'field__control--error' : ''} ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptionId : undefined}
        {...props}
      >
        {children}
      </select>
      {(error || hint) && (
        <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
});

export interface CustomSelectOption {
  value: string;
  label: string;
  group?: string;
}

interface CustomSelectProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  error?: string;
  hint?: string;
  disabled?: boolean;
}

/** Desplegable propio (mismo campo, sin el menú del sistema): botón + listbox con
 * resortes del sistema, navegable por teclado y con la flecha siempre a la orilla. */
export function CustomSelect({ id, label, value, onChange, options, error, hint, disabled }: CustomSelectProps) {
  const fallbackId = useId();
  const fieldId = id ?? fallbackId;
  const descriptionId = `${fieldId}-description`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const sections = useMemo(() => {
    const grouped: { group?: string; options: CustomSelectOption[] }[] = [];
    for (const option of options) {
      const last = grouped[grouped.length - 1];
      if (last && last.group === option.group) last.options.push(option);
      else grouped.push({ group: option.group, options: [option] });
    }
    return grouped;
  }, [options]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open ]);

  function moveFocus(from: HTMLElement, direction: 1 | -1) {
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = items.indexOf(from as HTMLButtonElement);
    const next = items[(index + direction + items.length) % items.length];
    next?.focus();
  }

  return (
    <div className="field">
      <span className="field__label" id={`${fieldId}-label`}>{label}</span>
      <div className={`custom-select ${open ? 'custom-select--open' : ''}`} ref={rootRef}>
        <button
          type="button"
          id={fieldId}
          className={`field__control custom-select__trigger ${error ? 'field__control--error' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${fieldId}-label ${fieldId}`}
          aria-describedby={error || hint ? descriptionId : undefined}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="custom-select__value">{selected?.label ?? 'Seleccionar'}</span>
          <ChevronDown aria-hidden="true" className="custom-select__chevron" />
        </button>
        {open && (
          <ul
            className="custom-select__list"
            role="listbox"
            aria-labelledby={`${fieldId}-label`}
            tabIndex={-1}
            onKeyDown={(event) => {
              const focused = document.activeElement as HTMLElement | null;
              if (event.key === 'ArrowDown' && focused) {
                event.preventDefault();
                moveFocus(focused, 1);
              } else if (event.key === 'ArrowUp' && focused) {
                event.preventDefault();
                moveFocus(focused, -1);
              }
            }}
          >
            {sections.map((section) => (
              <li key={section.group ?? 'opciones'} role="presentation">
                {section.group !== undefined && <p className="custom-select__group">{section.group}</p>}
                {section.options.map((option) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={`custom-select__option ${option.value === value ? 'custom-select__option--selected' : ''}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === value && <Check aria-hidden="true" className="size-4 shrink-0" />}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(error || hint) && (
        <span id={descriptionId} className={error ? 'field__error' : 'field__hint'}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

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
          <div className="pr-14">
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
