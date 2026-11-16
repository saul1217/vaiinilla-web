// Caja › Alumnos sin teléfono (Doop C05 a C08; espejo de `domain/student-counter.ts` de Expo):
// buscar por nombre, matrícula o credencial, revisar alergias y tope del día, cobrar de su
// saldo (con PIN si su tutor lo puso) y hacerle su credencial QR o ligarle una tarjeta NFC.
import type { CatalogProduct } from '../types/api';

/** GET /alumnos: cada alumno con su saldo, su tope del día y lo que su tutor no autorizó. */
export interface StudentCard {
  usuario_id: string;
  nombre: string;
  matricula: string | null;
  grupo: string | null;
  tiene_cuenta?: boolean;
  saldo: string;
  gastado_hoy: string;
  limite_diario: string | null;
  alergenos: string[];
  nota_tutor: string | null;
  productos_bloqueados: number[];
  categorias_bloqueadas: number[];
  productos_con_alergeno: number[];
  productos_sin_revisar: number[];
  pide_pin: boolean;
  pedidos_hoy: StudentTodayOrder[];
}

export interface StudentTodayOrder {
  id: string;
  folio: number;
  estado: string;
  version: number;
  total: string;
  resumen?: string | null;
}

export interface StudentPurchaseItem {
  producto_id: number;
  cantidad: number;
  opcion_ids: number[];
}

/** POST /alumnos/:id/credenciales: `valor` solo viene al crear un QR (el texto a imprimir). */
export interface StudentCredential {
  id: string;
  tipo: 'qr' | 'nfc';
  valor: string | null;
}

export const MAX_PER_PRODUCT = 10;

const ALLERGENS: Record<string, string> = {
  gluten: 'Gluten',
  crustaceos: 'Crustáceos',
  huevo: 'Huevo',
  pescado: 'Pescado',
  cacahuate: 'Cacahuate',
  soya: 'Soya',
  lacteos: 'Lácteos',
  nueces: 'Nueces',
  apio: 'Apio',
  mostaza: 'Mostaza',
  ajonjoli: 'Ajonjolí',
  sulfitos: 'Sulfitos',
  altramuces: 'Altramuces',
  moluscos: 'Moluscos',
  lactosa: 'Lactosa',
  colorantes: 'Colorantes',
};

export function allergenLabel(code: string): string {
  const clean = code.trim();
  const known = ALLERGENS[clean.toLowerCase()];
  if (known) return known;
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase() : '';
}

/** «Alérgico a huevo, lactosa», o null si no tiene. */
export function allergyBanner(allergens: readonly string[]): string | null {
  const list = allergens.map(allergenLabel).filter(Boolean).join(', ').toLowerCase();
  return list ? `Alérgico a ${list}` : null;
}

export function firstName(card: Pick<StudentCard, 'nombre'>): string {
  return card.nombre.trim().split(/\s+/)[0] || card.nombre;
}

export function studentIdentity(card: Pick<StudentCard, 'matricula' | 'grupo'>): string {
  return [card.matricula?.trim(), card.grupo?.trim()].filter(Boolean).join(' · ');
}

/** "12.50" → 1250. Lo que no es número cuenta como 0. */
export function toCents(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  const safe = Math.max(0, Math.round(cents));
  return `${Math.floor(safe / 100)}.${String(safe % 100).padStart(2, '0')}`;
}

/** Lo máximo que puede gastar hoy: lo menor entre su saldo y lo que le falta para su tope. */
export function spendableCents(card: Pick<StudentCard, 'saldo' | 'limite_diario' | 'gastado_hoy'>): number {
  const balance = Math.max(0, toCents(card.saldo));
  if (card.limite_diario == null) return balance;
  const left = Math.max(0, toCents(card.limite_diario) - Math.max(0, toCents(card.gastado_hoy)));
  return Math.min(balance, left);
}

/** Por qué no se le puede vender, o null si sí. */
export function blockReason(product: Pick<CatalogProduct, 'id' | 'categoria_id'>, card: StudentCard): string | null {
  if (card.productos_bloqueados.includes(product.id)) return 'No lo autorizó su tutor';
  if (card.categorias_bloqueadas.includes(product.categoria_id)) return 'Categoría no autorizada';
  if (card.productos_con_alergeno.includes(product.id)) return 'Tiene un alérgeno del alumno';
  if (card.productos_sin_revisar.includes(product.id)) return 'Sin alérgenos revisados';
  return null;
}

/** Un producto con un grupo obligatorio pide elegir antes de agregarse. */
export function needsChoice(product: Pick<CatalogProduct, 'grupos_opcion'>): boolean {
  return product.grupos_opcion.some((group) => group.min_selecciones > 0);
}

/** Las opciones que quedan elegidas al abrir: las primeras que exige cada grupo. */
export function defaultChoices(product: Pick<CatalogProduct, 'grupos_opcion'>): number[] {
  return product.grupos_opcion.flatMap((group) => group.opciones.slice(0, group.min_selecciones).map((option) => option.id));
}

/** Toca una opción respetando los límites del grupo (una sola si el máximo es 1). */
export function toggleChoice(product: Pick<CatalogProduct, 'grupos_opcion'>, picked: readonly number[], optionId: number): number[] {
  const group = product.grupos_opcion.find((g) => g.opciones.some((option) => option.id === optionId));
  if (!group) return [...picked];
  const ids = new Set(group.opciones.map((option) => option.id));
  const inGroup = picked.filter((id) => ids.has(id));
  if (picked.includes(optionId)) {
    return inGroup.length > group.min_selecciones ? picked.filter((id) => id !== optionId) : [...picked];
  }
  if (group.max_selecciones === 1) return [...picked.filter((id) => !ids.has(id)), optionId];
  if (group.max_selecciones > 0 && inGroup.length >= group.max_selecciones) return [...picked];
  return [...picked, optionId];
}

export type Cart = Readonly<Record<number, number>>;
export type Choices = Readonly<Record<number, readonly number[]>>;

export function cartTotalCents(cart: Cart, products: readonly CatalogProduct[], choices: Choices): number {
  const byId = new Map(products.map((product) => [product.id, product]));
  let total = 0;
  for (const [id, quantity] of Object.entries(cart)) {
    const product = byId.get(Number(id));
    if (!product || quantity <= 0) continue;
    const extras = new Map(product.grupos_opcion.flatMap((group) => group.opciones.map((option) => [option.id, toCents(option.precio_extra)] as const)));
    const extra = (choices[product.id] ?? []).reduce((sum, optionId) => sum + (extras.get(optionId) ?? 0), 0);
    total += (toCents(product.precio_mostrador) + extra) * quantity;
  }
  return total;
}

export function purchaseItems(cart: Cart, choices: Choices): StudentPurchaseItem[] {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, cantidad]) => ({ producto_id: Number(id), cantidad, opcion_ids: [...(choices[Number(id)] ?? [])] }));
}

export function stepCart(cart: Cart, productId: number, delta: number): Record<number, number> {
  const next: Record<number, number> = { ...cart };
  const quantity = Math.min(MAX_PER_PRODUCT, Math.max(0, (cart[productId] ?? 0) + delta));
  if (quantity === 0) delete next[productId];
  else next[productId] = quantity;
  return next;
}

/** Con PIN de su tutor hacen falta sus 4 números. */
export function pinReady(card: Pick<StudentCard, 'pide_pin'>, pin: string): boolean {
  return !card.pide_pin || /^\d{4}$/.test(pin.trim());
}
