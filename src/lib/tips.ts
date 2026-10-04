import { centsToMoney, moneyToCents } from './money';

/** Porcentajes sugeridos de propina. */
export const TIP_PERCENTS = [10, 15, 20] as const;

export type TipChoice = { kind: 'none' } | { kind: 'percent'; percent: number } | { kind: 'custom'; amount: string };

/** Propina de un porcentaje sobre `base`, redondeada al centavo (medio centavo hacia arriba). */
export function tipForPercent(base: string, percent: number): string {
  const cents = moneyToCents(base) ?? 0n;
  return centsToMoney((cents * BigInt(percent) + 50n) / 100n);
}

/** El monto de la propina elegida, con dos decimales; "0.00" si no hay o el texto no es válido. */
export function tipAmount(base: string, choice: TipChoice): string {
  if (choice.kind === 'percent') return tipForPercent(base, choice.percent);
  if (choice.kind === 'custom') return moneyToCents(choice.amount) === null ? '0.00' : choice.amount;
  return '0.00';
}

/** Suma dos montos con dos decimales. */
export function addMoney(a: string, b: string): string {
  return centsToMoney((moneyToCents(a) ?? 0n) + (moneyToCents(b) ?? 0n));
}

/** La propina no puede ser mayor a lo que se cobra (misma regla del servidor). */
export function tipExceedsTotal(total: string, tipValue: string): boolean {
  const totalCents = moneyToCents(total);
  const tipCents = moneyToCents(tipValue);
  if (totalCents === null || tipCents === null) return false;
  return tipCents > totalCents;
}
