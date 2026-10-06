import { Button, Field } from './ui';
import { formatMoney } from '../lib/money';
import { TIP_PERCENTS, tipAmount, type TipChoice } from '../lib/tips';

/**
 * Propina al cobrar: sin propina, 10/15/20 % del monto que se cobra o un monto libre.
 * La propina es del negocio y no paga comisión.
 */
export function TipPicker({
  base,
  value,
  onChange,
  error,
}: {
  base: string;
  value: TipChoice;
  onChange: (next: TipChoice) => void;
  /** La propina no puede ser mayor a lo que se cobra. */
  error?: string | null;
}) {
  const amount = tipAmount(base, value);
  const isOn = (choice: TipChoice) =>
    choice.kind === value.kind && (choice.kind !== 'percent' || (value.kind === 'percent' && value.percent === choice.percent));
  return (
    <div className="tip-picker" role="group" aria-label="Propina">
      <span className="field__label">Propina</span>
      <div className="space-account__chips">
        <Button type="button" variant={isOn({ kind: 'none' }) ? 'dark' : 'secondary'} aria-pressed={isOn({ kind: 'none' })} onClick={() => onChange({ kind: 'none' })}>
          Sin propina
        </Button>
        {TIP_PERCENTS.map((percent) => {
          const choice: TipChoice = { kind: 'percent', percent };
          return (
            <Button key={percent} type="button" variant={isOn(choice) ? 'dark' : 'secondary'} aria-pressed={isOn(choice)} onClick={() => onChange(choice)}>
              {percent}%
            </Button>
          );
        })}
        <Button
          type="button"
          variant={value.kind === 'custom' ? 'dark' : 'secondary'}
          aria-pressed={value.kind === 'custom'}
          onClick={() => onChange({ kind: 'custom', amount: value.kind === 'custom' ? value.amount : '' })}
        >
          Otro
        </Button>
      </div>
      {value.kind === 'custom' && (
        <Field
          name="tip-amount"
          label="Monto de la propina"
          inputMode="decimal"
          placeholder="20.00"
          value={value.amount}
          onChange={(event) => onChange({ kind: 'custom', amount: event.target.value.trim() })}
          hint="Por ejemplo 20 o 20.50."
        />
      )}
      {amount !== '0.00' && !error && <p className="space-account__hint">Propina {formatMoney(amount)}: es del negocio y no paga comisión.</p>}
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}
