import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './brand-mark';

/*
 * Componentes base con el diseño de la app de Android (ui/components de
 * vaiinilla-android). Los estilos están en styles/vai-components.css y los
 * tokens en styles/android-tokens.css. Las pantallas nuevas (hotel, escuela,
 * saldo, agenda, reparto, boliche) se arman con estas piezas.
 */

export type VaiButtonVariant = 'primary' | 'accent' | 'secondary' | 'coral' | 'quiet';

interface VaiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: tinta (EditorialPrimaryButton). accent: la acción principal, lima. secondary: papel. coral: aviso. */
  variant?: VaiButtonVariant;
  block?: boolean;
  loading?: boolean;
}

export const VaiButton = forwardRef<HTMLButtonElement, VaiButtonProps>(function VaiButton(
  { variant = 'primary', block = false, loading = false, className = '', type = 'button', disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`vai-button vai-button--${variant}${block ? ' vai-button--block' : ''} ${className}`.trim()}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'section' | 'article' | 'div';
  tone?: 'surface' | 'hero' | 'flat';
  title?: ReactNode;
  description?: ReactNode;
}

export function Card({ as: Tag = 'section', tone = 'surface', title, description, className = '', children, ...props }: CardProps) {
  const toneClass = tone === 'surface' ? '' : ` vai-card--${tone}`;
  return (
    <Tag className={`vai-card${toneClass} ${className}`.trim()} {...props}>
      {title && <h2 className="vai-card__title">{title}</h2>}
      {description && <p className="vai-card__description">{description}</p>}
      {children}
    </Tag>
  );
}

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  selected: boolean;
  onClick: () => void;
}

/** ChoiceChip de Android: la opción elegida se rellena de tinta. Mide al menos 44 px. */
export function Chip({ selected, onClick, className = '', type = 'button', children, ...props }: ChipProps) {
  return (
    <button type={type} className={`vai-chip ${className}`.trim()} aria-pressed={selected} onClick={onClick} {...props}>
      {children}
    </button>
  );
}

export function ChipRow({ label, scroll = false, children }: { label: string; scroll?: boolean; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`vai-chip-row${scroll ? ' vai-chip-row--scroll' : ''}`}>
      {children}
    </div>
  );
}

/** La burbuja coral del carrito. `label` es lo que lee el lector de pantalla. */
export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="vai-badge" aria-label={label}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function VaiEmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="vai-empty">
      <div className="vai-empty__icon" aria-hidden="true">{icon}</div>
      <h2 className="vai-empty__title">{title}</h2>
      <p className="vai-empty__message">{message}</p>
      {action && <div className="vai-empty__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ shape = 'line', className = '' }: { shape?: 'line' | 'title' | 'card'; className?: string }) {
  return <span aria-hidden="true" className={`vai-skeleton vai-skeleton--${shape} ${className}`.trim()} />;
}

/**
 * Carga inicial: pinta la estructura final con esqueletos (como Skeleton.kt) en vez
 * de un vacío falso. Los bloques se ocultan al lector; solo se anuncia `label`.
 */
export function LoadingState({ label = 'Cargando…', cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div className="vai-loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton shape="title" />
      {Array.from({ length: cards }, (_, index) => <Skeleton key={index} shape="card" />)}
    </div>
  );
}
