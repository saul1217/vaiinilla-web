import { centsToMoney, moneyToCents } from './money';

// Vista previa exacta del esquema aprobado. El backend repite el cálculo y es
// siempre la autoridad final del precio digital guardado.
export function calculateDigitalPrice(counterPrice: string): string | null {
  const cents = moneyToCents(counterPrice);
  if (cents === null) return null;

  const numerator = cents * 1030n + 348_000n;
  const digitalPesos = (numerator + 95_824n - 1n) / 95_824n;
  return centsToMoney(digitalPesos * 100n);
}
