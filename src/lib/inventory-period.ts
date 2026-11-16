// Fechas del historial y del reporte de inventario: días locales (YYYY-MM-DD) que viajan como el
// inicio y el fin de ese día en ISO.
export function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addLocalDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y!, m! - 1, d! + delta));
}

/** Del inicio de `from` al final de `to`, en la zona del navegador. */
export function periodRange(from: string, to: string): { desde: string; hasta: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return {
    desde: new Date(fy!, fm! - 1, fd, 0, 0, 0, 0).toISOString(),
    hasta: new Date(ty!, tm! - 1, td, 23, 59, 59, 999).toISOString(),
  };
}

export const MOVEMENT_LABEL: Record<string, string> = {
  venta: 'Venta',
  cancelacion: 'Cancelación',
  entrada: 'Entrada',
  merma: 'Merma',
  conteo: 'Conteo',
  ajuste: 'Ajuste',
  inicial: 'Alta',
};
