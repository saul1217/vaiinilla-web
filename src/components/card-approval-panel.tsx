// Super Admin: aprobar o revocar que una cafetería cobre con tarjeta (back #266, CAF-F03).
// Aprobar no prende la tarjeta: deja que el dueño la active cuando Stripe ya puede cobrar.
// Revocar la apaga y bloquea cobros nuevos; los pagos ya iniciados no se cancelan.
// Las dos acciones piden motivo (queda en el historial) y llevan Idempotency-Key. En un negocio
// suspendido no se aprueba, pero sí se puede revocar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Button, Feedback, Modal } from './ui';
import { api } from '../lib/api';
import { VaiinillaApiError, errorMessage } from '../lib/api-error';
import { cardApprovalLabel } from '../lib/card-payments';
import { createIdempotencyKey } from '../lib/idempotency';
import type { CardApprovalHistoryEntry } from '../types/api';

const MOTIVO_MAX = 500;

type Decision = 'aprobar' | 'revocar';

const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

function historyLabel(entry: CardApprovalHistoryEntry): string {
  if (entry.accion === 'aprobar') return 'Se aprobó';
  if (entry.accion === 'revocar') return 'Se revocó';
  if (entry.accion === 'backfill') return 'Heredada de la migración';
  return entry.accion;
}

export function CardApprovalPanel({
  token,
  establishmentId,
  establishmentName,
  suspended = false,
  commissionPassThrough = false,
  onChanged,
  onUnauthorized,
  onApprovalChange,
}: {
  token: string;
  establishmentId: string;
  establishmentName: string;
  suspended?: boolean;
  commissionPassThrough?: boolean;
  onChanged: (message: string) => Promise<void>;
  onUnauthorized: (establishmentId?: string) => void;
  onApprovalChange?: (approved: boolean | null) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['platform-card-approval', establishmentId];
  const [decision, setDecision] = useState<Decision | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: () => api.platformCardApproval(token, establishmentId),
  });

  useEffect(() => {
    if (query.error instanceof VaiinillaApiError && query.error.status === 401) onUnauthorized(establishmentId);
  }, [establishmentId, onUnauthorized, query.error]);

  const approval = query.data?.aprobacion;
  const commissionMustBeDisabled = commissionPassThrough || query.data?.stripe?.pasar_comision_al_cliente === true;
  useEffect(() => {
    onApprovalChange?.(query.isSuccess ? Boolean(approval?.vigente) : null);
  }, [approval?.vigente, onApprovalChange, query.isSuccess]);
  const history = query.data?.historial ?? [];
  const approvable = query.data?.aprobable !== false;
  const decidedAt = approval?.vigente ? formatDate(approval.aprobada_en) : formatDate(approval?.revocada_en);

  return (
    <section className="grid gap-3 rounded-2xl border border-ink/10 bg-cream p-4" aria-label="Aprobación de tarjeta">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Pagos con tarjeta</p>
          <div aria-live="polite">
            {query.isPending ? (
              <p className="text-sm text-muted">Consultando la aprobación…</p>
            ) : query.isError ? null : (
              <p className="text-sm font-extrabold text-ink">
                {cardApprovalLabel(approval)}
                {decidedAt ? <span className="font-normal text-muted"> · {decidedAt}</span> : null}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          className="stripe-panel__refresh"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          aria-label="Volver a consultar la aprobación de tarjeta"
        >
          <RefreshCw aria-hidden="true" className={query.isFetching ? 'spin' : ''} />
        </button>
      </div>

      {query.isError && (
        <Feedback tone="error">
          {errorMessage(query.error)} Vuelve a consultar con el botón de actualizar.
        </Feedback>
      )}

      {query.isSuccess && (
        <p className="text-xs leading-5 text-muted">
          {approval?.vigente
            ? 'El dueño puede activar la tarjeta cuando su cuenta de Stripe ya pueda cobrar.'
            : approvable
              ? 'Mientras no se apruebe, el dueño no puede activar la tarjeta.'
              : 'La aprobación de tarjeta solo aplica a cafeterías.'}
        </p>
      )}

      {suspended && query.isSuccess && !approval?.vigente && (
        <p className="text-xs leading-5 text-muted" role="status">
          Reactiva el establecimiento para poder aprobar la tarjeta.
        </p>
      )}
      {commissionMustBeDisabled && query.isSuccess && !approval?.vigente && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-xs leading-5 text-amber-950" role="status">
          Antes de aprobar, el dueño debe apagar «pasar comisión al cliente»: el menú de la cafetería ya incluye ese precio.
        </p>
      )}

      {query.isSuccess && (
        <div className="flex flex-wrap gap-2">
          {approval?.vigente ? (
            <Button
              ref={opener}
              type="button"
              variant="danger"
              onClick={() => setDecision('revocar')}
            >
              <ShieldOff aria-hidden="true" /> Revocar aprobación
            </Button>
          ) : (
            approvable && (
              <Button
                ref={opener}
                type="button"
                variant="primary"
                disabled={suspended}
                onClick={() => setDecision('aprobar')}
              >
                <ShieldCheck aria-hidden="true" /> Aprobar tarjeta
              </Button>
            )
          )}
        </div>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-ink">Historial ({history.length})</summary>
          <ul className="mt-2 grid gap-2">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-xl bg-white/60 p-2">
                <span className="font-bold text-ink">{historyLabel(entry)}</span>
                {formatDate(entry.creado_en) ? <span className="text-muted"> · {formatDate(entry.creado_en)}</span> : null}
                {entry.motivo ? <p className="mt-1 break-words text-muted">{entry.motivo}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      <DecisionModal
        key={decision ?? 'closed'}
        open={decision !== null}
        decision={decision ?? 'aprobar'}
        token={token}
        establishmentId={establishmentId}
        establishmentName={establishmentName}
        commissionPassThrough={commissionMustBeDisabled}
        returnFocusRef={opener}
        onOpenChange={(open) => { if (!open) setDecision(null); }}
        onUnauthorized={onUnauthorized}
        onDone={async (done) => {
          setDecision(null);
          await queryClient.invalidateQueries({ queryKey });
          await onChanged(
            done === 'aprobar'
              ? 'Tarjeta aprobada. El dueño ya puede activarla cuando su cuenta de Stripe esté lista.'
              : 'Aprobación de tarjeta revocada. Los cobros nuevos con tarjeta quedaron apagados.',
          );
        }}
      />
    </section>
  );
}

function DecisionModal({
  open,
  decision,
  token,
  establishmentId,
  establishmentName,
  commissionPassThrough,
  returnFocusRef,
  onOpenChange,
  onUnauthorized,
  onDone,
}: {
  open: boolean;
  decision: Decision;
  token: string;
  establishmentId: string;
  establishmentName: string;
  commissionPassThrough: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onUnauthorized: (establishmentId?: string) => void;
  onDone: (decision: Decision) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [touched, setTouched] = useState(false);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  // Una llave por intento: si se reintenta con el mismo motivo (p. ej., tras un error de red)
  // se repite la llave y el back no decide dos veces; si cambia el motivo, es otro intento.
  const attempt = useRef<{ motivo: string; key: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (reason: string) => {
      if (!attempt.current || attempt.current.motivo !== reason) {
        attempt.current = { motivo: reason, key: createIdempotencyKey() };
      }
      return api.decidePlatformCardApproval(token, establishmentId, decision, reason, attempt.current.key);
    },
    onSuccess: () => onDone(decision),
    onError: (error) => {
      if (error instanceof VaiinillaApiError && error.status === 401) onUnauthorized(establishmentId);
    },
  });
  const reason = motivo.trim();
  const missing = touched && reason.length === 0;
  const revoking = decision === 'revocar';

  return (
    <Modal
      open={open}
      onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}
      returnFocusRef={returnFocusRef}
      initialFocusRef={reasonInput}
      title={revoking ? '¿Revocar la aprobación de tarjeta?' : `Aprobar tarjeta en ${establishmentName}`}
      description={
        revoking
          ? 'Se desactivarán nuevos cobros con tarjeta. Los pagos ya iniciados no se cancelan.'
          : `Aprobar no prende la tarjeta: el dueño la activa cuando su cuenta de Stripe ya pueda cobrar.${commissionPassThrough ? ' Antes, debe apagar «pasar comisión al cliente» porque el menú ya incluye ese precio.' : ''}`
      }
    >
      {mutation.isError && <Feedback tone="error">{errorMessage(mutation.error)}</Feedback>}
      <form
        className="mt-5 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          setTouched(true);
          if (!reason || mutation.isPending) return;
          mutation.mutate(reason);
        }}
      >
        <label className="field">
          <span className="field__label">Motivo (queda en el historial)</span>
          <textarea
            ref={reasonInput}
            className="field__control min-h-28 resize-y"
            maxLength={MOTIVO_MAX}
            value={motivo}
            aria-invalid={missing || undefined}
            aria-describedby={missing ? 'card-approval-reason-error' : undefined}
            onChange={(event) => setMotivo(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          {missing && (
            <span id="card-approval-reason-error" className="field__error">
              Escribe el motivo para continuar.
            </span>
          )}
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button type="submit" variant={revoking ? 'danger' : 'primary'} loading={mutation.isPending}>
            {revoking ? 'Revocar aprobación' : 'Aprobar tarjeta'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
