// Unidades y cantidades del inventario (espejo de `data/inventory.ts` de Expo).
import type { InventoryUnit } from '../types/api';

export const INVENTORY_UNITS: { wire: InventoryUnit; label: string; short: string }[] = [
  { wire: 'pieza', label: 'Piezas', short: 'pz' },
  { wire: 'botella', label: 'Botellas', short: 'bot' },
  { wire: 'ml', label: 'Mililitros', short: 'ml' },
  { wire: 'l', label: 'Litros', short: 'L' },
  { wire: 'g', label: 'Gramos', short: 'g' },
  { wire: 'kg', label: 'Kilos', short: 'kg' },
  { wire: 'oz', label: 'Onzas', short: 'oz' },
  { wire: 'porcion', label: 'Porciones', short: 'porc' },
];

export function unitShort(unit: string | undefined): string {
  return INVENTORY_UNITS.find((item) => item.wire === unit)?.short ?? unit ?? '';
}

/** «1,250.5 ml»: hasta 3 decimales, sin ceros de más. */
export function qtyLabel(value: number | null | undefined, unit: string | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(n)} ${unitShort(unit)}`.trim();
}

/** "1,5" o "1.5" → 1.5; vacío o no número → null. */
export function parseQty(text: string): number | null {
  const clean = text.trim().replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export type MovementKind = 'entrada' | 'merma' | 'ajuste';

export const MOVEMENT_COPY: Record<MovementKind, { title: string; amount: string; hint: string; done: string }> = {
  entrada: { title: 'Registrar entrada (compra)', amount: 'Cuánto entró', hint: 'Por ejemplo: compra en el mercado', done: 'Entrada registrada' },
  merma: { title: 'Registrar merma', amount: 'Cuánto se perdió', hint: 'Por ejemplo: se echó a perder', done: 'Merma registrada' },
  ajuste: { title: 'Ajustar existencia', amount: 'Cuánto sumar o restar (con − para restar)', hint: 'Por ejemplo: corrección de captura', done: 'Ajuste registrado' },
};

/** La cantidad es válida para el tipo: entrada y merma, mayor que cero; ajuste, distinta de cero. */
export function validMovement(kind: MovementKind, quantity: number | null): quantity is number {
  if (quantity === null) return false;
  return kind === 'ajuste' ? quantity !== 0 : quantity > 0;
}
