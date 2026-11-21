// Lo que Cocina tiene en Expo y Android además de la fila: deshacer «lista» (Doop N02), el aviso
// de insumos (AI3) y los días para «Para mañana» (K05). Reglas puras, sin React.
import type { InventoryAlertSupply, InventoryAlerts } from '../types/api';

/** Cuánto se puede deshacer una marca de «lista» antes de mandarla al servidor. */
export const UNDO_WINDOW_MS = 10_000;

export interface PendingReady {
  orderId: string;
  folio: number;
  version: number;
  deadlineMs: number;
}

/** Las marcas de «lista» que aún se pueden deshacer. Sin relojes: quien la usa pasa la hora. */
export class PendingReadyQueue {
  private items = new Map<string, PendingReady>();

  add(order: { id: string; folio: number; version: number }, nowMs: number): PendingReady {
    const item = { orderId: order.id, folio: order.folio, version: order.version, deadlineMs: nowMs + UNDO_WINDOW_MS };
    this.items.delete(order.id);
    this.items.set(order.id, item);
    return item;
  }

  /** true si la marca seguía en espera y ya no se manda. */
  undo(orderId: string): boolean {
    return this.items.delete(orderId);
  }

  has(orderId: string): boolean {
    return this.items.has(orderId);
  }

  /** Las que ya vencieron, en el orden en que se marcaron; salen de la cola. */
  takeDue(nowMs: number): PendingReady[] {
    const due = [...this.items.values()].filter((item) => item.deadlineMs <= nowMs);
    due.forEach((item) => this.items.delete(item.orderId));
    return due;
  }

  /** Todas, para mandarlas ya (al salir de la pantalla). */
  takeAll(): PendingReady[] {
    const all = [...this.items.values()];
    this.items.clear();
    return all;
  }

  list(): PendingReady[] {
    return [...this.items.values()];
  }
}

export function namesLabel(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

function qty(value: number | string, unit: string): string {
  const n = Number(value);
  const text = Number.isFinite(n) ? n.toLocaleString('es-MX', { maximumFractionDigits: 2 }) : String(value);
  return `${text} ${unit}`;
}

export function inventoryAlertsEmpty(alerts: InventoryAlerts): boolean {
  return alerts.agotados.length === 0 && alerts.para_manana.length === 0 && alerts.bajo_minimo.length === 0;
}

/** «Se acabó: Papa y Zanahoria», «Tortilla no alcanza para mañana» o «2 insumos bajo el mínimo». */
export function inventoryAlertHeadline(alerts: InventoryAlerts): string {
  const missing = [...new Set(alerts.agotados.flatMap((item) => item.faltan))];
  if (alerts.agotados.length > 0) return `Se acabó: ${namesLabel(missing.length ? missing : alerts.agotados.map((item) => item.nombre))}`;
  if (alerts.para_manana.length === 1) return `${alerts.para_manana[0]!.nombre} no alcanza para mañana`;
  if (alerts.para_manana.length > 1) return `${alerts.para_manana.length} cosas no alcanzan para mañana`;
  if (alerts.bajo_minimo.length === 1) return `${alerts.bajo_minimo[0]!.nombre} está bajo el mínimo`;
  return `${alerts.bajo_minimo.length} insumos bajo el mínimo`;
}

export function inventoryAlertDetail(alerts: InventoryAlerts): string {
  const parts: string[] = [];
  if (alerts.agotados.length > 0) {
    const products = alerts.agotados.map((item) => item.nombre);
    parts.push(`${namesLabel(products)} ya ${products.length === 1 ? 'salió' : 'salieron'} del menú.`);
    if (alerts.para_manana.length > 0) parts.push(`Para mañana falta ${namesLabel(alerts.para_manana.map((item) => item.nombre))}.`);
  } else if (alerts.para_manana.length > 1) {
    parts.push(`${namesLabel(alerts.para_manana.map((item) => item.nombre))}.`);
  } else if (alerts.para_manana.length === 1) {
    const s = alerts.para_manana[0]!;
    parts.push(`Tienes ${qty(s.existencia, s.unidad)}; mañana se usan unos ${qty(s.consumo_diario ?? 0, s.unidad)}.`);
  } else if (alerts.bajo_minimo.length === 1) {
    const s = alerts.bajo_minimo[0]!;
    parts.push(`Tienes ${qty(s.existencia, s.unidad)} y el mínimo es ${qty(s.minimo ?? 0, s.unidad)}.`);
  }
  return parts.join(' ');
}

/** El primer proveedor con nombre o teléfono entre lo que no alcanza o está bajo el mínimo. */
export function inventoryAlertSupplier(alerts: InventoryAlerts): { nombre: string | null; telefono: string | null } | null {
  const supply = [...alerts.para_manana, ...alerts.bajo_minimo].find(
    (item: InventoryAlertSupply) => item.proveedor?.nombre || item.proveedor?.telefono,
  );
  return supply?.proveedor ? { nombre: supply.proveedor.nombre ?? null, telefono: supply.proveedor.telefono ?? null } : null;
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface ReservedDayOption {
  fecha: string;
  label: string;
}

/** Los días desde mañana (por la fecha local de este equipo) para ver lo apartado: «Mañana», «jue 19 nov»… */
export function reservedDayOptions(now = new Date(), count = 7): ReservedDayOption[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 + i);
    const fecha = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const short = `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
    return { fecha, label: i === 0 ? `Mañana · ${short}` : short };
  });
}
