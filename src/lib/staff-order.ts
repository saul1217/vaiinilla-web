import type { CatalogOptionGroup, CatalogProduct, SpaceAvailability, StaffOrderInput } from '../types/api';
import { centsToMoney, moneyToCents, normalizeMoneyInput } from './money';

export const MAX_LINE_QUANTITY = 20;
export const MAX_ORDER_LINES = 50;

export interface StaffOrderLine {
  producto: CatalogProduct;
  cantidad: number;
  opcionIds: number[];
}

export interface StaffOrderDraft {
  destino: 'para_llevar' | 'en_espacio';
  espacioId: number | null;
  lineas: StaffOrderLine[];
  nombreCliente: string;
  pagoAlFinal: boolean;
  cobrarAhora: boolean;
  montoRecibido: string;
}

export const BORRADOR_VACIO: StaffOrderDraft = {
  destino: 'para_llevar',
  espacioId: null,
  lineas: [],
  nombreCliente: '',
  pagoAlFinal: false,
  cobrarAhora: false,
  montoRecibido: '',
};

/** Las canchas que se rentan se cobran con su renta; no se les abre un pedido de mostrador. */
export function espaciosParaPedido(disponibilidad: SpaceAvailability[]): SpaceAvailability[] {
  return disponibilidad
    .filter((fila) => !(fila.espacio.tipo === 'cancha' && fila.precio_hora !== null))
    .sort((a, b) =>
      a.espacio.nombre.localeCompare(b.espacio.nombre, 'es', { numeric: true }),
    );
}

export function errorDeGrupo(grupo: CatalogOptionGroup, opcionIds: number[]): string | null {
  const elegidas = grupo.opciones.filter((opcion) => opcionIds.includes(opcion.id)).length;
  if (elegidas < grupo.min_selecciones) {
    return `${grupo.nombre}: elige al menos ${grupo.min_selecciones}.`;
  }
  if (elegidas > grupo.max_selecciones) {
    return `${grupo.nombre}: elige como máximo ${grupo.max_selecciones}.`;
  }
  return null;
}

/**
 * Elegir una opción respeta el grupo: en uno de elección única, la nueva reemplaza a la
 * anterior (y la quita si el grupo admite cero); en uno abierto, nunca pasa del máximo.
 */
export function alternarOpcion(
  opcionIds: number[],
  grupo: CatalogOptionGroup,
  opcionId: number,
): number[] {
  const delGrupo = grupo.opciones.map((opcion) => opcion.id);
  const elegida = opcionIds.includes(opcionId);
  if (grupo.max_selecciones === 1) {
    const sinGrupo = opcionIds.filter((id) => !delGrupo.includes(id));
    if (!elegida) return [...sinGrupo, opcionId];
    return grupo.min_selecciones === 0 ? sinGrupo : opcionIds;
  }
  if (elegida) return opcionIds.filter((id) => id !== opcionId);
  const enGrupo = opcionIds.filter((id) => delGrupo.includes(id)).length;
  return enGrupo >= grupo.max_selecciones ? opcionIds : [...opcionIds, opcionId];
}

/** Al agregar un producto, un grupo obligatorio de elección única ya trae su primera opción. */
export function opcionesIniciales(producto: CatalogProduct): number[] {
  return producto.grupos_opcion
    .filter((grupo) => grupo.min_selecciones >= 1 && grupo.max_selecciones === 1)
    .map((grupo) => grupo.opciones[0]?.id)
    .filter((id): id is number => id !== undefined);
}

export function erroresDeLinea(linea: StaffOrderLine): string[] {
  return linea.producto.grupos_opcion
    .map((grupo) => errorDeGrupo(grupo, linea.opcionIds))
    .filter((error): error is string => error !== null);
}

export function totalLineaCents(linea: StaffOrderLine): bigint {
  const extras = linea.producto.grupos_opcion
    .flatMap((grupo) => grupo.opciones)
    .filter((opcion) => linea.opcionIds.includes(opcion.id))
    .reduce((suma, opcion) => suma + (moneyToCents(opcion.precio_extra) ?? 0n), 0n);
  const base = moneyToCents(linea.producto.precio_mostrador) ?? 0n;
  return (base + extras) * BigInt(linea.cantidad);
}

/** Solo para mostrar al staff: el total que cobra el servidor es la autoridad. */
export function totalPedidoCents(lineas: StaffOrderLine[]): bigint {
  return lineas.reduce((suma, linea) => suma + totalLineaCents(linea), 0n);
}

export function erroresDePedido(draft: StaffOrderDraft): string[] {
  const errores: string[] = [];
  if (draft.lineas.length === 0) errores.push('Agrega al menos un producto.');
  if (draft.lineas.length > MAX_ORDER_LINES) {
    errores.push(`Un pedido admite hasta ${MAX_ORDER_LINES} productos.`);
  }
  if (draft.destino === 'en_espacio' && draft.espacioId === null) {
    errores.push('Elige la mesa o el espacio.');
  }
  if (draft.pagoAlFinal && draft.destino !== 'en_espacio') {
    errores.push('Pagar al final solo aplica en una mesa.');
  }
  if (draft.pagoAlFinal && draft.cobrarAhora) {
    errores.push('Elige pagar al final o cobrar ahora, no ambos.');
  }
  draft.lineas.forEach((linea) => errores.push(...erroresDeLinea(linea)));

  if (draft.cobrarAhora && draft.montoRecibido.trim() !== '') {
    const recibido = moneyToCents(normalizeMoneyInput(draft.montoRecibido));
    if (recibido === null) {
      errores.push('Escribe el efectivo recibido, por ejemplo 500 o 500.50.');
    } else if (recibido < totalPedidoCents(draft.lineas)) {
      errores.push('El efectivo recibido es menor al total del pedido.');
    }
  }
  return errores;
}

export function construirPedidoStaff(draft: StaffOrderDraft): StaffOrderInput {
  const nombre = draft.nombreCliente.trim();
  const montoRecibido =
    draft.cobrarAhora && draft.montoRecibido.trim() !== ''
      ? normalizeMoneyInput(draft.montoRecibido)
      : null;
  return {
    metodo_pago: 'efectivo',
    destino: draft.destino,
    espacio_id: draft.destino === 'en_espacio' ? draft.espacioId : null,
    items: draft.lineas.map((linea) => ({
      producto_id: linea.producto.id,
      cantidad: linea.cantidad,
      opcion_ids: [...linea.opcionIds].sort((a, b) => a - b),
    })),
    ...(nombre ? { nombre_cliente: nombre } : {}),
    ...(draft.pagoAlFinal ? { pago_diferido: true } : {}),
    ...(draft.cobrarAhora ? { cobrar_ahora: true } : {}),
    ...(montoRecibido ? { monto_recibido: montoRecibido } : {}),
  };
}

export function totalPedidoTexto(lineas: StaffOrderLine[]): string {
  return centsToMoney(totalPedidoCents(lineas));
}

export interface LlaveDeEnvio {
  huella: string;
  llave: string;
}

/**
 * Reutiliza la llave si el pedido no cambió (un reintento tras error de red debe ser
 * seguro) y pide una nueva si cambió: reusar una llave con otro cuerpo responde 409.
 */
export function llaveParaEnvio(
  anterior: LlaveDeEnvio | null,
  huella: string,
  nuevaLlave: () => string,
): LlaveDeEnvio {
  if (anterior && anterior.huella === huella) return anterior;
  return { huella, llave: nuevaLlave() };
}
