const PRICE_PATTERN = /^\d{1,5}(\.\d{1,2})?$/;

/** Devuelve el precio listo para enviar (`"300.00"`, o `null` si se vacía) o `undefined` si es inválido. */
export function parseHourlyPrice(raw: string): string | null | undefined {
  const value = raw.trim().replace(/^\$/, '');
  if (value === '') return null;
  if (!PRICE_PATTERN.test(value) || Number(value) <= 0) return undefined;
  return Number(value).toFixed(2);
}
