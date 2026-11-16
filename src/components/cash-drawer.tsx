// Movimientos del cajón (Doop N11): cuánto debe haber según el servidor, lo que entró y salió
// en el turno, y meter o sacar dinero con su motivo para que el cierre no «falte» sin explicación.
// Contrato: GET y POST /sesiones-caja/:id/movimientos de vaiinilla_back (roles cajero y admin).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { AppSheet } from './app-sheet';
import { Button, Feedback, Field } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import {
  CASH_REASON_MAX,
  drawerAmountToWire,
  drawerFormula,
  drawerMoney,
  drawerMovementDetail,
  drawerMovementTitle,
  drawerMovementsNewestFirst,
  isValidCashReason,
} from '../lib/cash-drawer';
import { createIdempotencyKey } from '../lib/idempotency';
import type { CashDrawerMovement } from '../types/api';

type MovementType = 'entrada' | 'salida';

export function CashDrawer({
  token,
  sessionId,
  open,
  onOpenChange,
}: {
  token: string;
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<MovementType | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['cash-drawer', sessionId],
    enabled: open && Boolean(token) && Boolean(sessionId),
    queryFn: () => api.cashDrawer(token, sessionId),
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setAdding(null);
      setNotice(null);
    }
  };

  const movements = report.data ? drawerMovementsNewestFirst(report.data.movimientos) : [];

  return (
    <AppSheet
      open={open}
      onOpenChange={close}
      title={adding === 'entrada' ? 'Meter dinero' : adding === 'salida' ? 'Sacar dinero' : 'Movimientos del cajón'}
      description={adding ? 'Queda en el corte junto con tu nombre.' : 'Lo que entró y salió del cajón en este turno.'}
    >
      {adding ? (
        <MovementForm
          token={token}
          sessionId={sessionId}
          type={adding}
          onCancel={() => setAdding(null)}
          onSaved={async (text) => {
            setAdding(null);
            setNotice(text);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['cash-drawer', sessionId] }),
              queryClient.invalidateQueries({ queryKey: ['cash-session'] }),
            ]);
          }}
        />
      ) : (
        <div className="cash-drawer">
          {notice && <Feedback tone="success">{notice}</Feedback>}
          <section className="cash-drawer__expected" aria-label="Debe haber en el cajón">
            <span>Debe haber en el cajón</span>
            <strong>{report.data ? drawerMoney(report.data.resumen.efectivo_esperado) : '—'}</strong>
            <small>
              {report.data
                ? drawerFormula(report.data.resumen)
                : report.isError
                  ? 'No se pudo consultar el cajón.'
                  : 'Consultando el cajón…'}
            </small>
          </section>

          {report.isError && (
            <Feedback tone="error">
              {errorMessage(report.error)}{' '}
              <button type="button" className="text-link" onClick={() => void report.refetch()}>
                Reintentar
              </button>
            </Feedback>
          )}

          {report.data && movements.length === 0 && (
            <p className="cash-drawer__empty">Aún no hay movimientos en este turno.</p>
          )}

          {movements.length > 0 && (
            <>
              <h3 className="cash-drawer__caption">Este turno · más nuevo arriba</h3>
              <ul className="cash-drawer__list" aria-label="Movimientos del turno">
                {movements.map((movement) => (
                  <MovementRow key={movement.id} movement={movement} />
                ))}
              </ul>
            </>
          )}

          <div className="cash-drawer__actions">
            <Button variant="secondary" disabled={!report.data} onClick={() => { setNotice(null); setAdding('salida'); }}>
              Sacar dinero
            </Button>
            <Button variant="dark" disabled={!report.data} onClick={() => { setNotice(null); setAdding('entrada'); }}>
              Meter dinero
            </Button>
          </div>
          <p className="cash-drawer__hint">Cada salida pide motivo; así al cerrar no «falta» nada sin explicación.</p>
        </div>
      )}
    </AppSheet>
  );
}

function MovementRow({ movement }: { movement: CashDrawerMovement }) {
  const out = movement.sale;
  const detail = drawerMovementDetail(movement);
  return (
    <li className={`cash-drawer__row ${out ? 'cash-drawer__row--out' : ''}`}>
      <span className="cash-drawer__sign" aria-hidden="true">
        {out ? <Minus /> : <Plus />}
      </span>
      <div>
        <strong>{drawerMovementTitle(movement)}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <span className="cash-drawer__amount">
        <span className="sr-only">{out ? 'Salió' : 'Entró'} </span>
        {out ? '−' : '+'}
        {drawerMoney(movement.monto)}
      </span>
    </li>
  );
}

function MovementForm({
  token,
  sessionId,
  type,
  onCancel,
  onSaved,
}: {
  token: string;
  sessionId: string;
  type: MovementType;
  onCancel: () => void;
  onSaved: (notice: string) => Promise<void>;
}) {
  const entering = type === 'entrada';
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Un reintento del mismo movimiento repite la llave para que el servidor no lo anote dos veces;
  // si cambia el monto o el motivo, es otro movimiento y lleva otra llave.
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const wire = drawerAmountToWire(amount);
  const reasonOk = isValidCashReason(reason);
  const amountError = amount.trim() && !wire ? 'Un monto mayor a cero, con hasta dos decimales.' : undefined;

  const save = useMutation({
    mutationFn: async () => {
      if (!wire || !reasonOk) throw new Error('Falta el monto o el motivo.');
      const motivo = reason.trim();
      const signature = `${sessionId}|${type}|${wire}|${motivo}`;
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: createIdempotencyKey() };
      await api.registerCashDrawerMovement(token, sessionId, { tipo: type, monto: wire, motivo }, attempt.current.key);
      return wire;
    },
    onSuccess: async (saved) => {
      attempt.current = null;
      await onSaved(`${entering ? 'Entrada' : 'Salida'} de ${drawerMoney(saved)} anotada.`);
    },
  });

  const label = !wire ? 'Escribe el monto' : !reasonOk ? 'Escribe el motivo' : `Anotar ${entering ? 'entrada' : 'salida'} de ${drawerMoney(wire)}`;

  return (
    <form
      className="operation-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (wire && reasonOk && !save.isPending) save.mutate();
      }}
    >
      <Field
        id="cash-drawer-amount"
        label={entering ? 'Cuánto metes (MXN)' : 'Cuánto sacas (MXN)'}
        inputMode="decimal"
        placeholder="0.00"
        autoComplete="off"
        value={amount}
        disabled={save.isPending}
        error={amountError}
        onChange={(event) => setAmount(event.target.value)}
      />
      <Field
        id="cash-drawer-reason"
        label="Motivo"
        placeholder={entering ? 'Ej. cambio del banco' : 'Ej. compra de hielo'}
        autoComplete="off"
        maxLength={CASH_REASON_MAX}
        value={reason}
        disabled={save.isPending}
        hint="De 3 a 160 letras."
        onChange={(event) => setReason(event.target.value)}
      />
      {save.isError && <Feedback tone="error">{errorMessage(save.error)}</Feedback>}
      <div className="form-actions">
        <Button type="button" variant="secondary" disabled={save.isPending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant={entering ? 'primary' : 'danger'} loading={save.isPending} disabled={!wire || !reasonOk}>
          {save.isPending ? 'Anotando…' : label}
        </Button>
      </div>
    </form>
  );
}
