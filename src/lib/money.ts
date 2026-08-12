const MONEY_PATTERN = /^\d+\.\d{2}$/;

export function moneyToCents(value: string): bigint | null {
  if (!MONEY_PATTERN.test(value)) return null;
  const [pesos = '0', centavos = '00'] = value.split('.');
  return BigInt(pesos) * 100n + BigInt(centavos);
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
