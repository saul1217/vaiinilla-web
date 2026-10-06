/** Pesos enteros o con hasta dos decimales: "60", "60.5", "60.50". */
export const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

export function moneyToCents(value: string): bigint | null {
  const clean = value.trim();
  if (!MONEY_PATTERN.test(clean)) return null;
  const [pesos = '0', centavos = ''] = clean.split('.');
  return BigInt(pesos) * 100n + BigInt(centavos.padEnd(2, '0'));
}

export function centsToMoney(value: bigint): string {
  const safe = value < 0n ? 0n : value;
  return `${safe / 100n}.${String(safe % 100n).padStart(2, '0')}`;
}

export function calculateChange(received: string, total: string): string | null {
  const receivedCents = moneyToCents(received);
  const totalCents = moneyToCents(total);
  if (receivedCents === null || totalCents === null || receivedCents < totalCents) return null;
  return centsToMoney(receivedCents - totalCents);
}

export function formatMoney(value: string): string {
  return `$${value} MXN`;
}

/**
 * Tolerante al formato al perder el foco o pegar: "200" → "200.00",
 * "200.5" → "200.50". Lo demás se deja igual para que el validador hable.
 */
export function normalizeMoneyInput(value: string): string {
  const clean = value.trim();
  if (/^\d+$/.test(clean)) return `${clean}.00`;
  if (/^\d+\.\d$/.test(clean)) return `${clean}0`;
  return value;
}
