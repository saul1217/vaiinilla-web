import { api } from './api';
import { VaiinillaApiError } from './api-error';
import {
  isNotFound,
  isVersionConflict,
  operationLabel,
  reasonLabel,
  splitTransition,
  transitionBlockDetails,
} from './config-transition';
import type {
  BusinessSettingsInput,
  ConfigurationTransitionChanges,
  ConfigurationTransitionOperation,
  ConfigurationTransitionPreflight,
  CatalogProductInput,
  InventoryUnit,
  InvitationRole,
  RecipeLineInput,
  SpaceType,
  StoreAssistantProposal,
} from '../types/api';

// Lee la propuesta del asistente (POST /establecimiento/asistente) y la aplica paso por paso con las rutas de
// siempre, igual que Android (AdminStoreViewModel.acceptProposal y RemoteAdminBusinessRepositories.applyAssistantStep).
// El servidor ya depuró la propuesta, pero aquí se vuelve a leer con cuidado: lo que no cuadre se descarta y no se
// escribe. Nada se aplica sin que el usuario marque la sección y toque «Aplicar».

export interface AssistantSpaceGroup { tipo: SpaceType; prefijo: string; cantidad: number; precio_hora: string | null }
export interface AssistantProduct { nombre: string; precio: string; descripcion: string | null; prepara: 'cocina' | 'caja' | 'ninguna' }
export interface AssistantCategory { categoria: string; categoria_id: number | null; productos: AssistantProduct[] }
export interface AssistantSupply { nombre: string; unidad: InventoryUnit; existencia_inicial: number | null; minimo: number | null; costo_unitario: number | null }
export interface AssistantRecipeLine { insumo_id: number | null; insumo: string; unidad: string; cantidad: number }
export interface AssistantRecipe { producto_id: number | null; producto: string; lineas: AssistantRecipeLine[] }
export interface AssistantMovement { insumo_id: number; insumo: string; unidad: string; tipo: 'entrada' | 'merma' | 'conteo'; cantidad: number; costo_unitario: number | null; nota: string | null }
export interface AssistantInvite { email: string; rol: InvitationRole }
export interface AssistantBooking { espacio_id: number; espacio: string; inicio: string; inicio_local: string; duracion_min: number; nombre_cliente: string | null; jugadores: number | null }

/** Las secciones que la web revisa y aplica, en el orden en que se aplican. */
export const SECTION_ORDER = ['cambios', 'espacios', 'menu', 'insumos', 'recetas', 'movimientos', 'reservas', 'personal'] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  cambios: 'Ajustes del negocio',
  espacios: 'Mesas o lugares',
  menu: 'Menú',
  insumos: 'Insumos',
  recetas: 'Recetas',
  movimientos: 'Movimientos de inventario',
  reservas: 'Reservas',
  personal: 'Invitaciones al personal',
};

/** Secciones que el servidor puede mandar y la web todavía no aplica: se enseñan y no se escriben. */
export const UNSUPPORTED_LABELS: Record<string, string> = {
  fotos: 'Fotos de la tienda',
  fotos_productos: 'Fotos de productos',
  horario_pistas: 'Horario para rentar',
  cambios_productos: 'Cambios en productos',
  cambios_insumos: 'Cambios en insumos',
  cambios_espacios: 'Cambios en mesas o lugares',
  cambios_personal: 'Cambios de puesto',
  cancelar_pedidos: 'Pedidos por cancelar',
};

export interface ParsedProposal {
  cambios: BusinessSettingsInput;
  motivos: Record<string, string>;
  espacios: AssistantSpaceGroup[];
  menu: AssistantCategory[];
  insumos: AssistantSupply[];
  recetas: AssistantRecipe[];
  movimientos: AssistantMovement[];
  reservas: AssistantBooking[];
  personal: AssistantInvite[];
  /** Secciones que vinieron pero no se aplican aquí, con cuántos elementos traen. */
  unsupported: { key: string; label: string; count: number }[];
}

const SPACE_TYPES: SpaceType[] = ['mesa', 'barra', 'cancha', 'drive_thru', 'asiento'];
const UNITS: InventoryUnit[] = ['pieza', 'ml', 'l', 'g', 'kg', 'oz', 'botella', 'porcion'];
const ROLES: InvitationRole[] = ['admin', 'cajero', 'cocina', 'mesero'];
const MOVEMENTS = ['entrada', 'merma', 'conteo'] as const;
const PRICE = /^\d{1,7}(\.\d{1,2})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Los campos de ajustes que el asistente nunca debe cambiar desde una propuesta. */
const BLOCKED_SETTINGS = new Set(['asistente_modo', 'tipos_disponibles', 'tienda_url', 'imagen_url', 'logo_url']);

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : []);
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
};
const positive = (value: unknown, { zero = false } = {}): number | null =>
  typeof value === 'number' && Number.isFinite(value) && (zero ? value >= 0 : value > 0) ? value : null;
const id = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null);
const price = (value: unknown): string | null => {
  const raw = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.trim() : '';
  return PRICE.test(raw) ? raw : null;
};

function sectionCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isObject(value)) return Object.keys(value).length;
  return 0;
}

export function parseProposal(raw: StoreAssistantProposal | null | undefined): ParsedProposal | null {
  if (!isObject(raw)) return null;
  const cambios: BusinessSettingsInput = {};
  if (isObject(raw.cambios))
    for (const [key, value] of Object.entries(raw.cambios))
      if (!BLOCKED_SETTINGS.has(key)) (cambios as Raw)[key] = value;
  const motivos: Record<string, string> = {};
  if (isObject(raw.motivos))
    for (const [key, value] of Object.entries(raw.motivos)) {
      const reason = text(value, 300);
      if (reason) motivos[key] = reason;
    }

  const espacios = list(raw.espacios).flatMap((g): AssistantSpaceGroup[] => {
    const prefijo = text(g.prefijo, 40);
    const cantidad = id(g.cantidad);
    if (!SPACE_TYPES.includes(g.tipo as SpaceType) || !prefijo || !cantidad || cantidad > 200) return [];
    return [{ tipo: g.tipo as SpaceType, prefijo, cantidad, precio_hora: g.tipo === 'cancha' ? price(g.precio_hora) : null }];
  });

  const menu = list(raw.menu).flatMap((c): AssistantCategory[] => {
    const categoria = text(c.categoria, 80);
    const productos = list(c.productos).flatMap((p): AssistantProduct[] => {
      const nombre = text(p.nombre, 120);
      const precio = price(p.precio);
      if (!nombre || !precio) return [];
      const prepara = p.prepara === 'caja' || p.prepara === 'ninguna' ? p.prepara : 'cocina';
      return [{ nombre, precio, descripcion: text(p.descripcion, 300), prepara }];
    });
    return categoria && productos.length ? [{ categoria, categoria_id: id(c.categoria_id), productos }] : [];
  });

  const insumos = list(raw.insumos).flatMap((i): AssistantSupply[] => {
    const nombre = text(i.nombre, 80);
    if (!nombre || !UNITS.includes(i.unidad as InventoryUnit)) return [];
    return [{
      nombre,
      unidad: i.unidad as InventoryUnit,
      existencia_inicial: positive(i.existencia_inicial, { zero: true }),
      minimo: positive(i.minimo, { zero: true }),
      costo_unitario: positive(i.costo_unitario, { zero: true }),
    }];
  });

  const recetas = list(raw.recetas).flatMap((r): AssistantRecipe[] => {
    const producto = text(r.producto, 120);
    const lineas = list(r.lineas).flatMap((l): AssistantRecipeLine[] => {
      const insumo = text(l.insumo, 80);
      const cantidad = positive(l.cantidad);
      return insumo && cantidad ? [{ insumo_id: id(l.insumo_id), insumo, unidad: text(l.unidad, 20) ?? '', cantidad }] : [];
    });
    return producto && lineas.length ? [{ producto_id: id(r.producto_id), producto, lineas }] : [];
  });

  const movimientos = list(raw.movimientos).flatMap((m): AssistantMovement[] => {
    const insumoId = id(m.insumo_id);
    const tipo = MOVEMENTS.find((t) => t === m.tipo);
    const cantidad = tipo ? positive(m.cantidad, { zero: tipo === 'conteo' }) : null;
    if (!insumoId || !tipo || cantidad === null) return [];
    return [{
      insumo_id: insumoId,
      insumo: text(m.insumo, 80) ?? `Insumo ${insumoId}`,
      unidad: text(m.unidad, 20) ?? '',
      tipo,
      cantidad,
      costo_unitario: tipo === 'entrada' ? positive(m.costo_unitario, { zero: true }) : null,
      nota: text(m.nota, 200),
    }];
  });

  const reservas = list(raw.reservas).flatMap((b): AssistantBooking[] => {
    const espacioId = id(b.espacio_id);
    const inicio = text(b.inicio, 40);
    const duracion = id(b.duracion_min);
    if (!espacioId || !inicio || Number.isNaN(Date.parse(inicio)) || !duracion || duracion % 30 !== 0 || duracion > 480) return [];
    const jugadores = id(b.jugadores);
    return [{
      espacio_id: espacioId,
      espacio: text(b.espacio, 80) ?? `Lugar ${espacioId}`,
      inicio,
      inicio_local: text(b.inicio_local, 40) ?? inicio,
      duracion_min: duracion,
      nombre_cliente: text(b.nombre_cliente, 120),
      jugadores: jugadores && jugadores <= 100 ? jugadores : null,
    }];
  });

  // Los correos llegan ya puestos por el servidor desde los tokens [correoN] que dio el dueño.
  const personal = list(raw.personal).flatMap((p): AssistantInvite[] => {
    const email = text(p.email, 254);
    return email && EMAIL.test(email) && ROLES.includes(p.rol as InvitationRole) ? [{ email, rol: p.rol as InvitationRole }] : [];
  });

  const unsupported = Object.entries(UNSUPPORTED_LABELS)
    .map(([key, label]) => ({ key, label, count: sectionCount(raw[key]) }))
    .filter((section) => section.count > 0);

  const parsed: ParsedProposal = { cambios, motivos, espacios, menu, insumos, recetas, movimientos, reservas, personal, unsupported };
  return availableSections(parsed).length || unsupported.length ? parsed : null;
}

export function sectionItems(proposal: ParsedProposal, key: SectionKey): number {
  if (key === 'cambios') return Object.keys(proposal.cambios).length;
  if (key === 'menu') return proposal.menu.reduce((sum, c) => sum + c.productos.length, 0);
  return proposal[key].length;
}

export function availableSections(proposal: ParsedProposal): SectionKey[] {
  return SECTION_ORDER.filter((key) => sectionItems(proposal, key) > 0);
}

/** Un paso al aplicar; cada uno con su llave para que reintentar no duplique nada en el servidor. */
export type AssistantStep =
  | { section: 'cambios'; label: string; cambios: BusinessSettingsInput }
  | { section: 'espacios'; label: string; group: AssistantSpaceGroup }
  | { section: 'menu'; label: string; category: AssistantCategory }
  | { section: 'insumos'; label: string; supply: AssistantSupply }
  | { section: 'recetas'; label: string; recipe: AssistantRecipe }
  | { section: 'movimientos'; label: string; movement: AssistantMovement }
  | { section: 'reservas'; label: string; booking: AssistantBooking }
  | { section: 'personal'; label: string; invite: AssistantInvite };

const MOVEMENT_LABELS = { entrada: 'entrada', merma: 'merma', conteo: 'conteo' } as const;

/**
 * Los pasos en el orden de Android: ajustes y lugares, menú, insumos, recetas (pueden usar lo recién creado),
 * movimientos, reservas y al final el equipo. Solo de las secciones marcadas.
 */
export function proposalSteps(proposal: ParsedProposal, selected: ReadonlySet<SectionKey>): (AssistantStep & { id: string })[] {
  const steps: AssistantStep[] = [];
  const on = (key: SectionKey) => selected.has(key);
  if (on('cambios') && Object.keys(proposal.cambios).length) steps.push({ section: 'cambios', label: 'Ajustes del negocio', cambios: proposal.cambios });
  if (on('espacios')) proposal.espacios.forEach((group) => steps.push({ section: 'espacios', label: `${group.prefijo} 1 a ${group.prefijo} ${group.cantidad}`, group }));
  if (on('menu')) proposal.menu.forEach((category) => steps.push({ section: 'menu', label: `Menú: ${category.categoria}`, category }));
  if (on('insumos')) proposal.insumos.forEach((supply) => steps.push({ section: 'insumos', label: `Insumo: ${supply.nombre}`, supply }));
  if (on('recetas')) proposal.recetas.forEach((recipe) => steps.push({ section: 'recetas', label: `Receta de ${recipe.producto}`, recipe }));
  if (on('movimientos')) proposal.movimientos.forEach((movement) => steps.push({ section: 'movimientos', label: `${movement.insumo}: ${MOVEMENT_LABELS[movement.tipo]}`, movement }));
  if (on('reservas')) proposal.reservas.forEach((booking) => steps.push({ section: 'reservas', label: `Renta de ${booking.espacio}`, booking }));
  if (on('personal')) proposal.personal.forEach((invite) => steps.push({ section: 'personal', label: `Invitar a ${invite.email}`, invite }));
  // El id no depende de qué otras secciones se marcaron: la llave de un paso es la misma en cada intento.
  const seen = new Map<SectionKey, number>();
  return steps.map((step) => {
    const n = seen.get(step.section) ?? 0;
    seen.set(step.section, n + 1);
    return { ...step, id: `${step.section}-${n}` };
  });
}

/** Llave estable de un paso: un UUID derivado (SHA-256) de la llave de la propuesta y el paso, como en Android. */
export async function stepKey(base: string, ...parts: string[]): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(['assistant', base, ...parts].join('|'))));
  const hex = Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Igual que el servidor compara nombres: sin acentos, sin mayúsculas y sin espacios en las orillas. */
export function nameKey(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().trim();
}

/** La receta de hoy con las líneas base del asistente agregadas o cambiadas; lo demás se queda. */
export function mergeRecipe(current: RecipeLineInput[], lines: { insumo_id: number; cantidad: number }[]): RecipeLineInput[] {
  const incoming = new Set(lines.map((line) => line.insumo_id));
  const kept = current
    .filter((line) => !(line.opcion_id === null && incoming.has(line.insumo_id)))
    .map(({ insumo_id, cantidad, opcion_id }) => ({ insumo_id, cantidad, opcion_id }));
  return [...kept, ...lines.map((line) => ({ insumo_id: line.insumo_id, cantidad: line.cantidad, opcion_id: null }))];
}

/** Algunas cosas de un paso fallaron y otras no (por ejemplo dos productos de una categoría). */
export class AssistantPartialFailure extends Error {
  constructor(readonly failed: string[], readonly firstError?: unknown) {
    super(`No se pudo guardar: ${failed.join(', ')}.`);
  }
}

/** La revisión previa (preflight) no permite el cambio de tipo o modo; trae motivos y operaciones. */
export class AssistantTransitionBlocked extends Error {
  constructor(readonly preflight: ConfigurationTransitionPreflight) {
    super('El cambio de tipo o modo está bloqueado.');
  }
}

/** El cambio de tipo o modo no se aplicó; los demás ajustes sí se guardaron. */
export class AssistantTransitionFailure extends Error {
  constructor(readonly fields: string[], readonly reason: unknown) {
    super(transitionFailureMessage(fields, reason));
  }
}

function blockSummary(reasons: string[], operations: ConfigurationTransitionOperation[], total: number): string {
  const parts = reasons.filter((code) => code !== 'OPERATIONS_IN_FLIGHT').map(reasonLabel);
  if (operations.length) {
    const shown = operations.slice(0, 5).map((op) => `${operationLabel(op.code)}${op.referencia ? ` ${op.referencia}` : ''}${op.estado ? ` (${op.estado})` : ''}`);
    const more = total > shown.length ? ` y ${total - shown.length} más` : '';
    parts.push(`Cierra antes: ${shown.join(', ')}${more}.`);
  } else if (reasons.includes('OPERATIONS_IN_FLIGHT')) {
    parts.push(reasonLabel('OPERATIONS_IN_FLIGHT'));
  }
  return parts.join(' ');
}

function transitionFailureMessage(fields: string[], cause: unknown): string {
  const what = `No se cambió ${fields.join(', ')}; lo demás sí se guardó.`;
  if (cause instanceof AssistantTransitionBlocked) {
    const { reason_codes, operaciones } = cause.preflight;
    return `${what} ${blockSummary(reason_codes, operaciones?.items ?? [], operaciones?.total ?? 0)} Luego toca «Reintentar» para volver a revisarlo.`;
  }
  const blocked = transitionBlockDetails(cause);
  if (blocked) return `${what} ${blockSummary(blocked.reason_codes, blocked.operaciones, blocked.total)} Luego toca «Reintentar» para volver a revisarlo.`;
  if (isVersionConflict(cause)) return `${what} La configuración cambió en otra sesión: toca «Reintentar» para volver a revisarlo.`;
  if (isNotFound(cause)) return `${what} Este servidor todavía no tiene el cambio con revisión previa (404). Inténtalo más tarde.`;
  return `${what} ${cause instanceof Error && cause.message ? cause.message : 'Revisa tu conexión e inténtalo de nuevo.'}`;
}

const ALREADY_DONE = new Set(['INVITATION_PENDING_EXISTS', 'MEMBERSHIP_ROLE_EXISTS', 'INSUMO_NAME_CONFLICT']);
const VALIDATION_STATUS = new Set([400, 409, 422]);

export function isAlreadyDone(error: unknown): boolean {
  return error instanceof VaiinillaApiError && ALREADY_DONE.has(error.code);
}

/** Aplica un paso con las rutas de siempre. `key` es la llave estable del paso. */
export async function applyStep(token: string, step: AssistantStep, key: string): Promise<void> {
  switch (step.section) {
    case 'cambios':
      return applySettings(token, step.cambios, key);
    case 'espacios': {
      const { group } = step;
      await api.createSpaceBatch(token, { tipo: group.tipo, prefijo: group.prefijo, desde: 1, hasta: group.cantidad }, key);
      if (group.precio_hora) await setHourlyPrice(token, group, group.precio_hora, key);
      return;
    }
    case 'menu':
      return applyMenu(token, step.category, key);
    case 'insumos': {
      const { supply } = step;
      try {
        await api.createInventorySupply(token, {
          nombre: supply.nombre,
          unidad: supply.unidad,
          minimo: supply.minimo ?? 0,
          ...(supply.costo_unitario !== null ? { costo_unitario: supply.costo_unitario } : {}),
          ...(supply.existencia_inicial !== null ? { existencia_inicial: supply.existencia_inicial } : {}),
        }, key);
      } catch (error) {
        // Ya hay uno con ese nombre (por ejemplo al reintentar): ya quedó.
        if (!isAlreadyDone(error)) throw error;
      }
      return;
    }
    case 'recetas':
      return applyRecipe(token, step.recipe, key);
    case 'movimientos': {
      const { movement } = step;
      await api.registerInventoryMovement(token, {
        id: key,
        insumo_id: movement.insumo_id,
        tipo: movement.tipo,
        cantidad: movement.cantidad,
        ...(movement.costo_unitario !== null ? { costo_unitario: movement.costo_unitario } : {}),
        ...(movement.nota ? { nota: movement.nota } : {}),
      });
      return;
    }
    case 'reservas': {
      const { booking } = step;
      const created = await api.createStaffBooking(token, {
        espacio_id: booking.espacio_id,
        inicio: booking.inicio,
        duracion_min: booking.duracion_min,
        ...(booking.nombre_cliente ? { nombre_cliente: booking.nombre_cliente } : {}),
        ...(booking.jugadores ? { jugadores: booking.jugadores } : {}),
      }, await stepKey(key, 'reserva'));
      await api.markBookingCashLater(token, created.id, await stepKey(key, 'por-cobrar'));
      return;
    }
    case 'personal':
      try {
        await api.createInvitation(token, { email: step.invite.email, rol: step.invite.rol }, key);
      } catch (error) {
        if (!isAlreadyDone(error)) throw error;
      }
      return;
  }
}

/**
 * Los ajustes de la propuesta. El tipo y los modos del negocio (campos de transición) van por
 * preflight + transición versionada, nunca por el PATCH; lo demás va en un PATCH y, si el servidor
 * rechaza el contenido, uno por uno para no perder los demás. Si la transición se bloquea, los
 * ajustes ordinarios se guardan igual y el paso falla con los motivos: reintentarlo repite la
 * revisión (preflight) con la versión nueva, no reenvía a ciegas.
 */
async function applySettings(token: string, cambios: BusinessSettingsInput, key: string): Promise<void> {
  const current = await api.businessSettings(token);
  const { transition, ordinary } = splitTransition(cambios, current);
  let transitionError: unknown = null;
  if (transition) {
    try {
      await applyTransition(token, transition, key);
    } catch (error) {
      transitionError = error;
    }
  }
  if (Object.keys(ordinary).length) await applyOrdinarySettings(token, ordinary);
  if (transitionError) throw new AssistantTransitionFailure(Object.keys(transition ?? {}), transitionError);
}

async function applyTransition(token: string, cambios: ConfigurationTransitionChanges, key: string): Promise<void> {
  const preflight = await api.preflightBusinessTransition(token, { cambios });
  if (!preflight.permitido) throw new AssistantTransitionBlocked(preflight);
  // La llave depende de la versión revisada: repetir con la misma versión es idempotente y una
  // versión nueva (después de volver a revisar) no choca con la llave anterior.
  const transitionKey = await stepKey(key, 'transicion', String(preflight.version_actual));
  await api.applyBusinessTransition(token, { version_esperada: preflight.version_actual, cambios }, transitionKey);
}

async function applyOrdinarySettings(token: string, cambios: BusinessSettingsInput): Promise<void> {
  try {
    await api.saveBusinessSettings(token, cambios);
    return;
  } catch (error) {
    if (!(error instanceof VaiinillaApiError) || !VALIDATION_STATUS.has(error.status)) throw error;
  }
  const failed: string[] = [];
  let cause: unknown;
  for (const [field, value] of Object.entries(cambios)) {
    try {
      await api.saveBusinessSettings(token, { [field]: value });
    } catch (error) {
      failed.push(field);
      cause ??= error;
    }
  }
  if (failed.length) throw new AssistantPartialFailure(failed, cause);
}

/** Pone el precio por hora a las canchas del grupo que aún no tienen (las nuevas y las que ya estaban). */
async function setHourlyPrice(token: string, group: AssistantSpaceGroup, hourly: string, key: string): Promise<void> {
  const names = new Set(Array.from({ length: group.cantidad }, (_, i) => `${group.prefijo} ${i + 1}`));
  const spaces = await api.listManagedSpaces(token);
  const failed: string[] = [];
  let cause: unknown;
  for (const space of spaces.filter((s) => names.has(s.nombre) && s.tipo === group.tipo && s.activo && s.precio_hora === null)) {
    try {
      await api.updateSpace(token, space.id, { precio_hora: hourly }, await stepKey(key, 'precio', String(space.id)));
    } catch (error) {
      failed.push(`precio de ${space.nombre}`);
      cause ??= error;
    }
  }
  if (failed.length) throw new AssistantPartialFailure(failed, cause);
}

/** La categoría (si no existe) y sus productos uno por uno; si alguno falla sigue con los demás. */
async function applyMenu(token: string, category: AssistantCategory, key: string): Promise<void> {
  const categoryId = category.categoria_id
    ?? (await api.createCategory(token, { nombre: category.categoria, orden: 0 }, await stepKey(key, 'categoria'))).id;
  const failed: string[] = [];
  let cause: unknown;
  for (const [index, product] of category.productos.entries()) {
    const input: CatalogProductInput = {
      categoria_id: categoryId,
      // El backend acepta también 'ninguna' (ya está listo); el tipo de la web solo conoce cocina y caja.
      estacion_preparacion: product.prepara as CatalogProductInput['estacion_preparacion'],
      nombre: product.nombre,
      descripcion: product.descripcion,
      ingredientes: null,
      alergenos: null,
      tiempo_estimado_min: product.prepara === 'ninguna' ? 0 : 10,
      precio_mostrador: product.precio,
      disponible: true,
      grupos_opcion: [],
    };
    try {
      await api.createProduct(token, input, await stepKey(key, 'producto', String(index)));
    } catch (error) {
      failed.push(product.nombre);
      cause ??= error;
    }
  }
  if (failed.length) throw new AssistantPartialFailure(failed, cause);
}

/**
 * Lo nuevo de la misma propuesta (producto o insumo sin id) se busca por nombre: se creó en un paso anterior.
 * La receta se lee, se le agregan o cambian estas líneas y se guarda completa, porque el PUT la reemplaza.
 */
async function applyRecipe(token: string, recipe: AssistantRecipe, key: string): Promise<void> {
  let supplies: Map<string, number> | null = null;
  const supplyId = async (line: AssistantRecipeLine): Promise<number> => {
    if (line.insumo_id) return line.insumo_id;
    supplies ??= new Map((await api.inventorySupplies(token)).map((s) => [nameKey(s.nombre), s.id]));
    const found = supplies.get(nameKey(line.insumo));
    if (!found) throw new Error(`Falta dar de alta ${line.insumo}.`);
    return found;
  };
  const productId = recipe.producto_id
    ?? (await api.inventoryProducts(token)).find((p) => nameKey(p.nombre) === nameKey(recipe.producto))?.id;
  if (!productId) throw new Error(`${recipe.producto} todavía no está en tu menú.`);
  const lines = [];
  for (const line of recipe.lineas) lines.push({ insumo_id: await supplyId(line), cantidad: line.cantidad });
  const current = await api.productRecipe(token, productId);
  await api.saveProductRecipe(token, productId, mergeRecipe(current, lines), key);
}

/** El texto que ve el usuario cuando un paso falla. */
export function stepErrorMessage(error: unknown): string {
  if (error instanceof AssistantPartialFailure || error instanceof AssistantTransitionFailure) return error.message;
  if (error instanceof VaiinillaApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';
}
