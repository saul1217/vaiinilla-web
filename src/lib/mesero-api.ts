// Tablero de Mesero: mesas ordenadas por urgencia (llamada > pedido listo > activa > libre).
// Contrato: docs/mesero-backend.md. Mientras el backend no tenga /espacios/tablero ni
// /llamadas, arma el tablero con GET /espacios + GET /pedidos?estado=listo y reporta
// callsEnabled: false; entregar reutiliza api.deliverOrder (mismo endpoint que Caja).
import { apiUrl } from './api';
import { VaiinillaApiError } from './api-error';
import { createIdempotencyKey } from './idempotency';
import type { ApiEnvelope, ApiErrorEnvelope, OrderDetail, OrderStatus, SpaceAvailability } from '../types/api';

export type CallReason = 'atencion' | 'utensilios' | 'problema' | 'cuenta';
export type CallStatus = 'pendiente' | 'en_camino' | 'atendida' | 'cancelada' | 'expirada';

export const CALL_REASON_LABEL: Record<CallReason, string> = {
  atencion: 'Necesita atención',
  utensilios: 'Pide cubiertos o servilletas',
  problema: 'Algo está mal con su pedido',
  cuenta: 'Pidió la cuenta',
};

export interface TableSpace {
  id: number;
  nombre: string;
  tipo: string;
}

export interface TableCall {
  id: string;
  espacio: TableSpace;
  pedido_id: string | null;
  motivo: CallReason;
  estado: CallStatus;
  cliente: { nombre: string } | null;
  tomada_por: { usuario_id: string; nombre: string } | null;
  creado_en: string;
  tomada_en: string | null;
  cerrada_en: string | null;
  version: number;
}

export interface BoardOrder {
  id: string;
  folio: number;
  estado: OrderStatus;
  version: number;
  /** Va a la cuenta del espacio (pagar al final). */
  pago_diferido?: boolean;
  /** Aún no se cobra: el badge dice Sin cobrar aunque el estado sea cobrado. */
  pago_pendiente?: boolean;
  cliente: { nombre: string } | null;
  items_resumen: string;
  actualizado_en: string;
}

export interface BoardTable {
  espacio: TableSpace;
  llamada: TableCall | null;
  pedidos: BoardOrder[];
}

export interface Board {
  tables: BoardTable[];
  /** false while the backend has no /espacios/tablero or /llamadas yet. */
  callsEnabled: boolean;
}

export const OPEN_CALL: CallStatus[] = ['pendiente', 'en_camino'];

async function request<T>(
  path: string,
  init: { token: string; method?: string; body?: unknown; idempotent?: boolean },
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json', Authorization: `Bearer ${init.token}` });
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (init.idempotent) headers.set('Idempotency-Key', createIdempotencyKey());
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new VaiinillaApiError(0, { code: 'BACKEND_UNAVAILABLE', message: 'Sin conexión con el servidor. Reintentando…' });
  }
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | ApiErrorEnvelope | null;
  if (!response.ok || !payload || payload.error) {
    const error = payload?.error ?? { code: 'HTTP_ERROR', message: 'El servidor no devolvió una respuesta válida.' };
    throw new VaiinillaApiError(response.status, error, Number(response.headers.get('Retry-After')) || undefined);
  }
  return payload.data;
}

const missing = (error: unknown) => error instanceof VaiinillaApiError && (error.status === 404 || error.status === 405 || error.status === 501);

function summarize(order: OrderDetail) {
  return order.items.map((item) => `${item.cantidad}× ${item.nombre_producto}`).join(', ');
}

export interface WaiterClient {
  board(): Promise<Board>;
  transitionCall(call: TableCall, target: 'en_camino' | 'atendida'): Promise<TableCall>;
}

export function createWaiterClient(getToken: () => Promise<string>): WaiterClient {
  let callsEnabled = true;
  let boardEndpoint = true;

  async function fallbackBoard(token: string): Promise<BoardTable[]> {
    const [spaces, ready, availability] = await Promise.all([
      request<TableSpace[]>('/espacios', { token }),
      request<OrderDetail[]>('/pedidos?estado=listo', { token }),
      request<SpaceAvailability[]>('/espacios/disponibilidad', { token }),
    ]);
    const sessionStarts = new Map(
      availability
        .filter((space) => space.inicio !== null)
        .map((space) => [space.espacio.id, Date.parse(space.inicio!)]),
    );
    return spaces.map((espacio) => ({
      espacio,
      llamada: null,
      pedidos: ready
        .filter((order) => {
          const inicio = sessionStarts.get(espacio.id);
          return order.destino === 'en_espacio'
            && order.espacio?.id === espacio.id
            && inicio !== undefined
            && Date.parse(order.creado_en) >= inicio;
        })
        .map((order) => ({
          id: order.id,
          folio: order.folio,
          estado: order.estado,
          version: order.version,
          cliente: order.usuario ? { nombre: order.usuario.nombre } : null,
          items_resumen: summarize(order),
          actualizado_en: order.actualizado_en,
        })),
    }));
  }

  return {
    async board() {
      const token = await getToken();
      let tables: BoardTable[];
      if (boardEndpoint) {
        try {
          tables = await request<BoardTable[]>('/espacios/tablero', { token });
        } catch (error) {
          if (!missing(error)) throw error;
          boardEndpoint = false;
          tables = await fallbackBoard(token);
        }
      } else {
        tables = await fallbackBoard(token);
      }
      if (!boardEndpoint && callsEnabled) {
        try {
          const calls = await request<TableCall[]>(`/llamadas?estado=${OPEN_CALL.join(',')}`, { token });
          tables = tables.map((table) => ({ ...table, llamada: calls.find((call) => call.espacio.id === table.espacio.id) ?? null }));
        } catch (error) {
          if (!missing(error)) throw error;
          callsEnabled = false;
        }
      }
      return { tables, callsEnabled: boardEndpoint || callsEnabled };
    },
    async transitionCall(call, target) {
      return request<TableCall>(`/llamadas/${call.id}/transiciones`, {
        token: await getToken(),
        method: 'POST',
        idempotent: true,
        body: { estado_objetivo: target, version_esperada: call.version },
      });
    },
  };
}
