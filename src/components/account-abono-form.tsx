import { useMutation } from '@tanstack/react-query';
import { CreditCard, Minus, Plus, ReceiptText, Wallet } from 'lucide-react';
import { useState } from 'react';
import { RollingMoney } from './rolling-money';
import { Button, Feedback, Field } from './ui';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api-error';
import { partAmountCents } from '../lib/account-split';
import { calculateChange, centsToMoney, formatMoney, moneyToCents } from '../lib/money';
import type { AbonoMode, AccountAbonoResult, AccountPaymentMethod } from '../types/api';

const MONEY_PATTERN = /^\d+\.\d{2}$/;
const MAX_PARTS = 50;

/**
 * Abona a la cuenta por un monto libre o por partes iguales, en efectivo o con la
 * terminal. Al cubrir todo lo que falta, el backend liquida la cuenta.
 */
export function AccountAbonoForm({
  token,
  spaceId,
  restante,
  mode,
  onDone,
  onCancel,
}: {
  token: string;
  spaceId: number;
  /** Lo que falta por cobrar, con dos decimales ("200.00"). */
  restante: string;
  mode: AbonoMode;
  onDone: (result: AccountAbonoResult) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<AccountPaymentMethod>('efectivo');
  const [amount, setAmount] = useState(restante);
  const [parts, setParts] = useState(2);
  const [received, setReceived] = useState('');

  const restanteCents = moneyToCents(restante) ?? 0n;
  const chargeCents =
    mode === 'partes' ? partAmountCents(restanteCents, parts) : MONEY_PATTERN.test(amount) ? (moneyToCents(amount) ?? 0n) : 0n;
  const charge = centsToMoney(chargeCents);
  const tooMuch = chargeCents > restanteCents;
  const change = method === 'efectivo' && MONEY_PATTERN.test(received) ? calculateChange(received, charge) : null;
  const canConfirm = chargeCents > 0n && !tooMuch && (method === 'terminal' || change !== null);

  const abonar = useMutation({
    mutationFn: () =>
      api.abonarSpaceAccount(token, spaceId, {
        metodo: method,
        modo: mode,
        monto: mode === 'monto' ? amount : undefined,
        partes: mode === 'partes' ? parts : undefined,
        montoRecibido: method === 'efectivo' ? received : undefined,
        restanteEsperado: restante,
      }),
    onSuccess: onDone,
  });

  return (
    <div className="transaction-form">
      {abonar.isError && <Feedback tone="error">{errorMessage(abonar.error)}</Feedback>}
      <p className="space-account__hint">
        Falta por cobrar {formatMoney(restante)}. Los pedidos quedan cobrados cuando se cubre todo.
      </p>

      {mode === 'monto' ? (
        <Field
          name="abono-amount"
          label="Monto de este pago"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value.trim())}
          error={tooMuch ? 'Es más de lo que falta.' : undefined}
          hint="Usa pesos con dos decimales, por ejemplo 100.00."
        />
      ) : (
        <div className="split-parts" role="group" aria-label="Personas que faltan por pagar">
          <span className="field__label">Personas que faltan por pagar</span>
          <div className="split-parts__stepper">
            <Button
              type="button"
              variant="secondary"
              aria-label="Una persona menos"
              disabled={parts <= 1}
              onClick={() => setParts((n) => Math.max(1, n - 1))}
            >
              <Minus aria-hidden="true" className="size-5" />
            </Button>
            <strong key={parts} className="split-parts__count" aria-live="polite">{parts}</strong>
            <Button
              type="button"
              variant="secondary"
              aria-label="Una persona más"
              disabled={parts >= MAX_PARTS}
              onClick={() => setParts((n) => Math.min(MAX_PARTS, n + 1))}
            >
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <span className="field__hint">
            {parts === 1 ? 'Último pago: cubre todo lo que falta.' : 'Se redondea hacia abajo; el último pago cubre los centavos.'}
          </span>
        </div>
      )}

      <div className="pay-method" role="radiogroup" aria-label="Forma de pago" data-method={method}>
        <span className="pay-method__indicator" aria-hidden="true" />
        <button type="button" role="radio" aria-checked={method === 'efectivo'} onClick={() => setMethod('efectivo')}>
          <Wallet aria-hidden="true" className="size-5" /> Efectivo
        </button>
        <button type="button" role="radio" aria-checked={method === 'terminal'} onClick={() => setMethod('terminal')}>
          <CreditCard aria-hidden="true" className="size-5" /> Terminal
        </button>
      </div>
      <p className="space-account__charge">
        <ReceiptText aria-hidden="true" className="size-5" /> Este pago <strong><RollingMoney value={charge} /></strong>
      </p>
      {method === 'efectivo' ? (
        <Field
          name="abono-cash-received"
          label="Efectivo recibido"
          inputMode="decimal"
          placeholder="500.00"
          value={received}
          onChange={(event) => setReceived(event.target.value.trim())}
          hint={change !== null ? `Cambio: ${formatMoney(change)}` : 'Usa pesos con dos decimales, por ejemplo 500.00.'}
          error={MONEY_PATTERN.test(received) && change === null ? 'El efectivo no alcanza.' : undefined}
        />
      ) : (
        <p className="space-account__hint">Cobra {formatMoney(charge)} en la terminal y confirma cuando se apruebe.</p>
      )}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="button" variant="dark" loading={abonar.isPending} disabled={!canConfirm} onClick={() => abonar.mutate()}>
          Confirmar pago
        </Button>
      </div>
    </div>
  );
}
