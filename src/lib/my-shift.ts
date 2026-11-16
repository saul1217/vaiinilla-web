// «Mi turno» (Doop N07; StaffShift.kt de Android): reglas de presentación de lo que contesta
// `GET /reportes/mi-turno`. La propina es del negocio: la pantalla informa, no reparte.
import { moneyToCents } from './money';

const WEEKDAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** «$1,180.50»: sin «MXN», para leerse de un vistazo. */
export function shiftMoney(value: string): string {
  const cents = moneyToCents(value);
  if (cents === null) return `$${value}`;
  return `$${new Intl.NumberFormat('es-MX').format(Number(cents / 100n))}.${String(cents % 100n).padStart(2, '0')}`;
}

/** La inicial del día de una fecha `YYYY-MM-DD`, leída como fecha local (no UTC). */
export function weekdayLetter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY_LETTERS[new Date(y, m - 1, d).getDay()] ?? '';
}

/** Alto de cada barra de la semana, de 0 a 100, relativo al mejor día. Sin propinas, todas en 0. */
export function weekBarHeights(days: { propinas: string }[]): number[] {
  const cents = days.map((day) => Number(moneyToCents(day.propinas) ?? 0n));
  const max = Math.max(0, ...cents);
  return cents.map((value) => (max === 0 ? 0 : Math.round((value / max) * 100)));
}

/** «2.5 min» de respuesta promedio a las llamadas; «—» si hoy no atendió ninguna. */
export function responseLabel(minutes: string | null): string {
  if (minutes == null) return '—';
  const value = Number(minutes);
  if (!Number.isFinite(value)) return '—';
  if (value < 1) return 'menos de 1 min';
  return `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} min`;
}

/** La fecha de hoy en el formato del servidor, según el reloj de este equipo. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
