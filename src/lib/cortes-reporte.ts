// Cortes de caja y reporte contable: lectura del contrato del backend
// (docs/cortes-y-reportes.md del backend), llaves de caché aisladas por sesión y
// clasificación de errores. Igual que CashCutRepository.kt de Android.
import { VaiinillaApiError } from './api-error';

type Json = Record<string, unknown>;

const obj = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(obj) : []);
const amount = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '0.00');
const count = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export interface CutCash {
  fondo: string;
  cobrosEfectivo: string;
  propinas: string;
  recargas: string;
  entradas: string;
  salidas: string;
  devoluciones: string;
  esperado: string;
  contado: string | null;
  diferencia: string | null;
  arqueo: 'cuadra' | 'sobra' | 'falta' | null;
}

export interface CutShift {
  id: string;
  fecha: string;
  abiertaEn: string | null;
  cerradaEn: string | null;
  abiertaPor: string | null;
  cerradaPor: string | null;
  efectivo: CutCash;
}

export interface SalesBreakdown {
  resumen: {
    ventas: string;
    pedidos: number;
    ticketPromedio: string;
    articulos: number;
    importeArticulos: string;
    descuentos: string;
    envios: string;
    rentas: string;
  };
  formasPago: { metodo: string; pedidos: number; monto: string }[];
  propinas: { total: string; efectivo: string; terminal: string };
  cancelados: { pedidos: number; monto: string };
  devoluciones: { articulosRechazados: string; reembolsosReserva: string; devolucionesEntregadas: string };
  porCategoria: { categoria: string; cantidad: number; importe: string }[];
  porProducto: { producto: string; categoria: string; cantidad: number; importe: string }[];
  porPersonal: { usuarioId: string | null; nombre: string | null; rol: string | null; pedidos: number; ventas: string; ticketPromedio: string | null }[];
  porEspacio: { espacioId: string | null; nombre: string | null; tipo: string | null; pedidos: number; ventas: string; rentas: string; consumo: string }[];
  porDia: { fecha: string; pedidos: number; ventas: string }[];
}

export interface DayCut {
  fecha: string;
  final: boolean;
  turnos: CutShift[];
  efectivo: CutCash;
  sinTurno: { pedidos: number; ventas: string };
  desglose: SalesBreakdown;
}

export interface ShiftCut {
  final: boolean;
  turno: CutShift;
  desglose: SalesBreakdown;
}

export interface AccountingReport {
  negocio: string | null;
  desde: string;
  hasta: string;
  desglose: SalesBreakdown;
}

function parseCash(raw: unknown): CutCash {
  const c = obj(raw);
  const arqueo = c.arqueo === 'cuadra' || c.arqueo === 'sobra' || c.arqueo === 'falta' ? c.arqueo : null;
  return {
    fondo: amount(c.fondo),
    cobrosEfectivo: amount(c.cobros_efectivo),
    propinas: amount(c.propinas),
    recargas: amount(c.recargas),
    entradas: amount(c.entradas),
    salidas: amount(c.salidas),
    devoluciones: amount(c.devoluciones_efectivo),
    esperado: amount(c.efectivo_esperado),
    contado: c.contado == null ? null : amount(c.contado),
    diferencia: c.diferencia == null ? null : amount(c.diferencia),
    arqueo,
  };
}

function parseShift(raw: unknown): CutShift {
  const t = obj(raw);
  return {
    id: textOrNull(t.id) ?? '',
    fecha: textOrNull(t.fecha_operativa) ?? '',
    abiertaEn: textOrNull(t.abierta_en),
    cerradaEn: textOrNull(t.cerrada_en),
    abiertaPor: textOrNull(obj(t.abierta_por).nombre),
    cerradaPor: textOrNull(obj(t.cerrada_por).nombre),
    efectivo: parseCash(t.efectivo),
  };
}

export function parseBreakdown(raw: unknown): SalesBreakdown {
  const d = obj(raw);
  const r = obj(d.resumen);
  const p = obj(d.propinas);
  const c = obj(d.cancelados);
  const dv = obj(d.devoluciones);
  return {
    resumen: {
      ventas: amount(r.ventas),
      pedidos: count(r.pedidos),
      ticketPromedio: amount(r.ticket_promedio),
      articulos: count(r.articulos),
      importeArticulos: amount(r.importe_articulos),
      descuentos: amount(r.descuentos),
      envios: amount(r.envios),
      rentas: amount(r.rentas),
    },
    formasPago: list(d.formas_pago).map((m) => ({ metodo: textOrNull(m.metodo) ?? '', pedidos: count(m.pedidos), monto: amount(m.monto) })),
    propinas: { total: amount(p.total), efectivo: amount(p.efectivo), terminal: amount(p.terminal) },
    cancelados: { pedidos: count(c.pedidos), monto: amount(c.monto) },
    devoluciones: {
      articulosRechazados: amount(dv.articulos_rechazados),
      reembolsosReserva: amount(dv.reembolsos_reserva),
      devolucionesEntregadas: amount(dv.devoluciones_entregadas),
    },
    porCategoria: list(d.por_categoria).map((x) => ({ categoria: textOrNull(x.categoria) ?? 'Sin categoría', cantidad: count(x.cantidad), importe: amount(x.importe) })),
    porProducto: list(d.por_producto).map((x) => ({
      producto: textOrNull(x.producto) ?? 'Sin nombre',
      categoria: textOrNull(x.categoria) ?? 'Sin categoría',
      cantidad: count(x.cantidad),
      importe: amount(x.importe),
    })),
    porPersonal: list(d.por_personal).map((x) => ({
      usuarioId: textOrNull(x.usuario_id),
      nombre: textOrNull(x.nombre),
      rol: textOrNull(x.rol),
      pedidos: count(x.pedidos),
      ventas: amount(x.ventas),
      ticketPromedio: x.ticket_promedio == null ? null : amount(x.ticket_promedio),
    })),
    porEspacio: list(d.por_espacio).map((x) => ({
      espacioId: typeof x.espacio_id === 'string' || typeof x.espacio_id === 'number' ? String(x.espacio_id) : null,
      nombre: textOrNull(x.nombre),
      tipo: textOrNull(x.tipo),
      pedidos: count(x.pedidos),
      ventas: amount(x.ventas),
      rentas: amount(x.rentas),
      consumo: amount(x.consumo),
    })),
    porDia: list(d.por_dia).map((x) => ({ fecha: textOrNull(x.fecha) ?? '', pedidos: count(x.pedidos), ventas: amount(x.ventas) })),
  };
}

export function parseDayCut(raw: unknown): DayCut {
  const d = obj(raw);
  const sinTurno = obj(d.sin_turno);
  return {
    fecha: textOrNull(d.fecha) ?? '',
    final: d.tipo === 'final',
    turnos: list(d.turnos).map(parseShift).filter((t) => t.id !== ''),
    efectivo: parseCash(d.efectivo),
    sinTurno: { pedidos: count(sinTurno.pedidos), ventas: amount(sinTurno.ventas) },
    desglose: parseBreakdown(d),
  };
}

export function parseShiftCut(raw: unknown): ShiftCut {
  const d = obj(raw);
  return { final: d.tipo === 'final', turno: parseShift(d.turno), desglose: parseBreakdown(d) };
}

export function parseAccountingReport(raw: unknown): AccountingReport {
  const d = obj(raw);
  const periodo = obj(d.periodo);
  return {
    negocio: textOrNull(d.negocio),
    desde: textOrNull(periodo.desde) ?? '',
    hasta: textOrNull(periodo.hasta) ?? '',
    desglose: parseBreakdown(d),
  };
}

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  terminal: 'Terminal',
  stripe: 'Tarjeta en línea',
  saldo: 'Saldo',
  transferencia: 'Transferencia',
};
const ROLES: Record<string, string> = { admin: 'Administración', cajero: 'Caja', mesero: 'Mesero', cocina: 'Cocina' };
const TIPOS_ESPACIO: Record<string, string> = {
  mesa: 'Mesa',
  cancha: 'Pista o cancha',
  barra: 'Barra',
  asiento: 'Asiento',
  drive_thru: 'Autoservicio',
};

export const paymentMethodLabel = (code: string) => METODOS[code] ?? (code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Sin método');
export const staffRoleLabel = (code: string | null) => (code ? ROLES[code] ?? '' : '');
export const spaceTypeLabel = (code: string | null) => (code ? TIPOS_ESPACIO[code] ?? code : '');

/**
 * La sesión dueña de los datos. Las llaves de caché la incluyen completa: negocio,
 * membresía e identidad. Un cambio de negocio, de rol o de persona nunca reutiliza la
 * caché del anterior, aunque compartan fecha.
 */
export interface CortesScope {
  establecimientoId: string;
  membresiaId: string;
  usuarioId: string;
}

export const CORTES_QUERY_ROOT = 'cortes-reporte' as const;

const scopeKey = (scope: CortesScope) => [CORTES_QUERY_ROOT, scope.establecimientoId, scope.membresiaId, scope.usuarioId] as const;

export const cortesKeys = {
  scope: scopeKey,
  dayCut: (scope: CortesScope, fecha: string) => [...scopeKey(scope), 'corte-dia', fecha] as const,
  shiftCut: (scope: CortesScope, sessionId: string) => [...scopeKey(scope), 'corte-turno', sessionId] as const,
  accounting: (scope: CortesScope, desde: string, hasta: string) => [...scopeKey(scope), 'contable', desde, hasta] as const,
};

export type CortesErrorKind = 'unsupported' | 'unauthenticated' | 'forbidden' | 'not-found' | 'server' | 'network' | 'unknown';

/**
 * Un 404 de ruta (código NOT_FOUND o sin cuerpo JSON) significa que el backend todavía
 * no tiene los cortes (migración 170). El 404 SESSION_NOT_FOUND es otra cosa: ese turno
 * no existe en este negocio.
 */
export function classifyCortesError(error: unknown): CortesErrorKind {
  if (error instanceof VaiinillaApiError) {
    if (error.status === 404) return error.code === 'SESSION_NOT_FOUND' ? 'not-found' : 'unsupported';
    if (error.status === 401) return 'unauthenticated';
    if (error.status === 403) return 'forbidden';
    if (error.status >= 500) return 'server';
    return 'unknown';
  }
  // fetch rechaza con TypeError cuando no hay red o el servidor no contesta.
  if (error instanceof TypeError) return 'network';
  return 'unknown';
}
