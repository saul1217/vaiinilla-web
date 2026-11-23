// Movimientos del cajón (Doop N11; DrawerPage de Expo y CashDrawerContent de Android):
// cuánto debe haber según el servidor, qué entró y salió en el turno, y las reglas para
// meter o sacar dinero con su motivo.
import type { CashDrawerMovement, CashDrawerSummary } from '../types/api';
import { moneyToCents } from './money';

/** Lo mismo que acepta el servidor para el motivo. */
export const CASH_REASON_MIN = 3;
export const CASH_REASON_MAX = 160;

export function isValidCashReason(reason: string): boolean {
  const clean = reason.trim();
  return clean.length >= CASH_REASON_MIN && clean.length <= CASH_REASON_MAX;
}

/** "150", "150.5" o "150.50" → "150.50"; null si no es un monto mayor a cero con hasta dos decimales. */
export function drawerAmountToWire(value: string): string | null {
  const cents = moneyToCents(value);
  if (cents === null || cents <= 0n) return null;
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** «$1,180.50»: el cajón se lee rápido, sin «MXN» en cada renglón. */
export function drawerMoney(value: string): string {
  const cents = moneyToCents(value.replace(/^-/, ''));
  if (cents === null) return `$${value}`;
  const pesos = new Intl.NumberFormat('es-MX').format(Number(cents / 100n));
  return `$${pesos}.${String(cents % 100n).padStart(2, '0')}`;
}

export function drawerMovementsNewestFirst(movements: CashDrawerMovement[]): CashDrawerMovement[] {
  return [...movements].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
}

/** Qué fue, con las mismas palabras que el corte. */
export function drawerMovementTitle(movement: CashDrawerMovement): string {
  const folio = movement.pedido?.folio != null ? ` #${movement.pedido.folio}` : '';
  const isRefund = movement.pedido != null || movement.devolucion_id != null;
  switch (movement.tipo) {
    case 'apertura':
      return 'Fondo al abrir';
    case 'cobro':
      return `Cobro en efectivo${folio}`;
    case 'propina':
      return `Propina en efectivo${folio}`;
    case 'wallet_recharge':
      return 'Recarga de saldo';
    case 'ajuste_entrada':
      return 'Entrada al cajón';
    case 'ajuste_salida':
      return isRefund ? `Devolución en efectivo${folio}` : 'Salida del cajón';
    default:
      return movement.sale ? 'Salida del cajón' : 'Entrada al cajón';
  }
}

function clock(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** El motivo, quién lo anotó y a qué hora. */
export function drawerMovementDetail(movement: CashDrawerMovement): string | null {
  const parts = [movement.motivo?.trim(), movement.registrado_por?.nombre?.trim(), clock(movement.creado_en)];
  return parts.filter(Boolean).join(' · ') || null;
}

const nonZero = (value: string) => (moneyToCents(value) ?? 0n) !== 0n;

/**
 * «Fondo $500.00 + efectivo $1,180.00 − salidas $250.00»: de dónde sale lo que debe haber.
 * Suma lo mismo que el servidor (propinas y recargas también entran al cajón).
 */
export function drawerFormula(summary: CashDrawerSummary): string {
  const parts = [`Fondo ${drawerMoney(summary.fondo)}`, `+ efectivo ${drawerMoney(summary.cobros_efectivo)}`];
  if (nonZero(summary.propinas)) parts.push(`+ propinas ${drawerMoney(summary.propinas)}`);
  if (nonZero(summary.recargas)) parts.push(`+ recargas ${drawerMoney(summary.recargas)}`);
  if (nonZero(summary.entradas)) parts.push(`+ entradas ${drawerMoney(summary.entradas)}`);
  if (nonZero(summary.salidas)) parts.push(`− salidas ${drawerMoney(summary.salidas)}`);
  if (nonZero(summary.devoluciones_efectivo)) parts.push(`− devoluciones ${drawerMoney(summary.devoluciones_efectivo)}`);
  return parts.join(' ');
}
