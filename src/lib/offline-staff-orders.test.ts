import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import {
  DurableStorageError,
  MAXIMUM_AGE_MS,
  OfflineStaffQueue,
  SERVER_FAILURE_PROBLEM,
  TOO_OLD_PROBLEM,
  browserDurableStore,
  environmentOf,
  pendingOf,
  problemsOf,
  queueStorageKey,
  type DurableStore,
  type OfflineStaffScope,
} from './offline-staff-orders';
import { clearStaffOrderDraft, loadStaffOrderDraft, saveStaffOrderDraft } from './staff-order-draft';
import { BORRADOR_VACIO } from './staff-order';
import type { StaffOrderInput } from '../types/api';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();
const TOKEN = 'token-de-sesion-no-se-guarda';

const SCOPE_A: OfflineStaffScope = { env: environmentOf(baseUrl), establecimientoId: 'est-1', usuarioId: 'user-1' };
const SCOPE_B: OfflineStaffScope = { env: environmentOf(baseUrl), establecimientoId: 'est-2', usuarioId: 'user-1' };
const SCOPE_PROD: OfflineStaffScope = { ...SCOPE_A, env: environmentOf('https://api.vaiinilla.app/api/v1') };

const PEDIDO: StaffOrderInput = {
  metodo_pago: 'efectivo',
  destino: 'para_llevar',
  espacio_id: null,
  items: [{ producto_id: 101, cantidad: 1, opcion_ids: [] }],
};

let seq = 0;
const ids = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/**
 * Servidor de prueba con la idempotencia del backend: la misma llave con el mismo cuerpo
 * repite el resultado; con otro cuerpo responde 409 IDEMPOTENCY_KEY_REUSED. Cuenta cobros.
 */
function fakeBackend() {
  const byKey = new Map<string, { body: string; result: unknown }>();
  const state = { created: 0, charges: 0, keys: [] as string[], auth: [] as string[], loseNextResponse: false, down: false };
  server.use(
    http.post(`${baseUrl}/pedidos`, async ({ request }) => {
      if (state.down) return HttpResponse.error();
      const key = request.headers.get('Idempotency-Key') ?? '';
      state.keys.push(key);
      state.auth.push(request.headers.get('Authorization') ?? '');
      const raw = await request.text();
      const previous = byKey.get(key);
      if (previous) {
        if (previous.body !== raw) {
          return HttpResponse.json({ data: null, meta: {}, error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Llave usada con otro cuerpo.' } }, { status: 409 });
        }
        return HttpResponse.json({ data: previous.result, meta: {}, error: null }, { status: 201 });
      }
      const body = JSON.parse(raw) as StaffOrderInput;
      state.created += 1;
      if (body.cobrar_ahora) state.charges += 1;
      const result = { id: body.sin_conexion?.id ?? 'online', folio: 100 + state.created, estado: 'por_cobrar', version: 1, ...(body.cobrar_ahora ? { cobro: { estado: 'cobrado', monto_recibido: '50.00', cambio: '0.00' } } : {}) };
      byKey.set(key, { body: raw, result });
      if (state.loseNextResponse) {
        // El servidor registró el pedido y el cobro, pero la respuesta no llegó (proxy caído).
        state.loseNextResponse = false;
        return new HttpResponse('Bad gateway', { status: 502 });
      }
      return HttpResponse.json({ data: result, meta: {}, error: null }, { status: 201 });
    }),
  );
  return state;
}

const send = (body: StaffOrderInput, key: string) => api.createStaffOrder(TOKEN, body, key);

function queue(scope = SCOPE_A, now = () => Date.parse('2026-11-09T18:00:00Z')) {
  return new OfflineStaffQueue(browserDurableStore(window.localStorage), scope, { now, newId: ids, random: () => 0.123 });
}

function enqueue(q: OfflineStaffQueue, input: StaffOrderInput = PEDIDO, idempotencyKey = 'llave-1', cashSessionId: string | null = null) {
  return q.enqueue({ input, idempotencyKey, roleInitial: 'C', placeLabel: 'Para llevar', summary: '1× Taco', cashSessionId });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  window.localStorage.clear();
  seq = 0;
});

describe('cola de pedidos sin conexión', () => {
  it('guarda el pedido antes de mandarlo, con sin_conexion, sin token y separado por sesión', () => {
    const order = enqueue(queue(), { ...PEDIDO, cobrar_ahora: true }, 'llave-1', '11111111-1111-4111-8111-111111111111');
    expect(order.localFolio).toBe('C123-001');
    expect(order.body).toMatchObject({
      pago_diferido: false,
      cobrar_ahora: true,
      sin_conexion: { id: order.id, folio_local: 'C123-001', capturado_en: '2026-11-09T18:00:00.000Z', sesion_caja_id: '11111111-1111-4111-8111-111111111111' },
    });
    const raw = window.localStorage.getItem(queueStorageKey(SCOPE_A)) ?? '';
    expect(raw).toContain(order.id);
    expect(raw).not.toContain(TOKEN);
    expect(JSON.stringify(window.localStorage)).not.toContain(TOKEN);
    // Otro negocio y otro entorno no ven la cola.
    expect(pendingOf(queue(SCOPE_B).snapshot())).toHaveLength(0);
    expect(pendingOf(queue(SCOPE_PROD).snapshot())).toHaveLength(0);
  });

  it('sin cobro en Caja no manda sesion_caja_id y el folio local sigue el consecutivo', () => {
    const q = queue();
    const first = enqueue(q, PEDIDO, 'llave-1', 'sesion');
    const second = enqueue(q, PEDIDO, 'llave-2');
    expect(first.body.sin_conexion).not.toHaveProperty('sesion_caja_id');
    expect(second.localFolio).toBe('C123-002');
  });

  it('reconexión: sin red se queda guardado y al volver se manda una sola vez', async () => {
    const backend = fakeBackend();
    const q = queue();
    enqueue(q);
    backend.down = true;
    const offline = await q.flush(send);
    expect(offline.retryLater).toBe(true);
    expect(pendingOf(q.snapshot())).toHaveLength(1);

    backend.down = false;
    const online = await q.flush(send);
    expect(online.events).toEqual([expect.objectContaining({ type: 'sent', folio: 101 })]);
    expect(pendingOf(q.snapshot())).toHaveLength(0);
    expect(backend.created).toBe(1);
    expect(backend.auth.at(-1)).toBe(`Bearer ${TOKEN}`);
  });

  it('recarga: otra instancia sobre el mismo almacenamiento manda el mismo pedido con la misma llave', async () => {
    const backend = fakeBackend();
    const order = enqueue(queue(), PEDIDO, 'llave-recarga');
    // La página se recargó: la cola en memoria se perdió, el navegador la conserva.
    const reloaded = queue();
    expect(pendingOf(reloaded.snapshot()).map((o) => o.id)).toEqual([order.id]);
    await reloaded.flush(send);
    expect(backend.keys).toEqual(['llave-recarga']);
    expect(pendingOf(reloaded.snapshot())).toHaveLength(0);
  });

  it('respuesta perdida: el cobro quedó, el reintento repite el resultado y no cobra dos veces', async () => {
    const backend = fakeBackend();
    const q = queue();
    enqueue(q, { ...PEDIDO, cobrar_ahora: true }, 'llave-perdida', 'sesion-1');
    backend.loseNextResponse = true;
    const lost = await q.flush(send);
    expect(lost.retryLater).toBe(true);
    expect(pendingOf(q.snapshot())).toHaveLength(1);

    const retry = await queue().flush(send);
    expect(retry.events).toEqual([expect.objectContaining({ type: 'sent', folio: 101 })]);
    expect(backend.keys).toEqual(['llave-perdida', 'llave-perdida']);
    expect(backend.charges).toBe(1);
    expect(backend.created).toBe(1);
  });

  it('el intento con red sí llegó: la cola usa su llave, el servidor la reconoce y no se duplica', async () => {
    const backend = fakeBackend();
    // Intento con red: el servidor lo registra y cobra, pero la respuesta se pierde.
    backend.loseNextResponse = true;
    await expect(send({ ...PEDIDO, cobrar_ahora: true }, 'llave-online')).rejects.toBeTruthy();
    expect(backend.charges).toBe(1);
    // El formulario lo guarda sin conexión con la misma llave (el cuerpo ahora trae sin_conexion).
    const q = queue();
    enqueue(q, { ...PEDIDO, cobrar_ahora: true }, 'llave-online');
    const result = await q.flush(send);
    expect(result.events).toEqual([expect.objectContaining({ type: 'already-registered' })]);
    expect(q.snapshot().orders).toHaveLength(0);
    expect(backend.charges).toBe(1);
    expect(backend.created).toBe(1);
  });

  it('cambio de sesión: deja de mandar la cola anterior y cada sesión conserva lo suyo', async () => {
    const backend = fakeBackend();
    const a = queue(SCOPE_A);
    enqueue(a, PEDIDO, 'a-1');
    enqueue(a, PEDIDO, 'a-2');
    const b = queue(SCOPE_B);
    enqueue(b, PEDIDO, 'b-1');

    let current = true;
    const result = await a.flush(async (body, key) => {
      const created = await send(body, key);
      current = false; // Se abrió otra sesión mientras se mandaba el primero.
      return created;
    }, () => current);
    expect(result.aborted).toBe(true);
    expect(backend.keys).toEqual(['a-1']);
    expect(pendingOf(a.snapshot()).map((o) => o.idempotencyKey)).toEqual(['a-2']);
    expect(pendingOf(b.snapshot()).map((o) => o.idempotencyKey)).toEqual(['b-1']);
  });

  it('Caja cobró sin internet y el servidor no aplicó el cobro: queda a la vista y no se reenvía', async () => {
    server.use(http.post(`${baseUrl}/pedidos`, () => HttpResponse.json({
      data: { id: 'x', folio: 55, estado: 'por_cobrar', version: 1, cobro: { estado: 'pendiente', codigo: 'ESTABLISHMENT_NOT_RECEIVING', mensaje: 'No hay una sesión de caja abierta.' } },
      meta: {}, error: null,
    }, { status: 201 })));
    const q = queue();
    enqueue(q, { ...PEDIDO, cobrar_ahora: true });
    const result = await q.flush(send);
    expect(result.events).toEqual([expect.objectContaining({ type: 'cash-not-registered', folio: 55 })]);
    const [problem] = problemsOf(q.snapshot());
    expect(problem?.registeredFolio).toBe(55);
    expect(problem?.problem).toContain('Cobrado sin registrar');
    q.retry();
    expect(pendingOf(q.snapshot())).toHaveLength(0);
  });

  it('un rechazo 4xx se aparta con su motivo y Reintentar lo regresa a la fila', async () => {
    server.use(http.post(`${baseUrl}/pedidos`, () => HttpResponse.json({ data: null, meta: {}, error: { code: 'OFFLINE_ORDER_ID_TAKEN', message: 'Ese pedido ya existe con otra llave.' } }, { status: 409 })));
    const q = queue();
    enqueue(q);
    await q.flush(send);
    expect(problemsOf(q.snapshot())[0]?.problem).toBe('Ese pedido ya existe con otra llave.');
    q.retry();
    expect(pendingOf(q.snapshot())).toHaveLength(1);
    q.resolve(pendingOf(q.snapshot())[0]!.id);
    expect(q.snapshot().orders).toHaveLength(0);
  });

  it('un 401 o un 5xx con sobre no se aparta a la primera; al tercer 5xx sí', async () => {
    server.use(http.post(`${baseUrl}/pedidos`, () => HttpResponse.json({ data: null, meta: {}, error: { code: 'INTERNAL_ERROR', message: 'Falla' } }, { status: 500 })));
    const q = queue();
    enqueue(q);
    expect((await q.flush(send)).retryLater).toBe(true);
    expect((await q.flush(send)).retryLater).toBe(true);
    await q.flush(send);
    expect(problemsOf(q.snapshot())[0]?.problem).toBe(SERVER_FAILURE_PROBLEM);
  });

  it('más de 12 horas sin conexión: no se manda y se pide registrarlo a mano', async () => {
    const backend = fakeBackend();
    let now = Date.parse('2026-11-09T06:00:00Z');
    const q = queue(SCOPE_A, () => now);
    enqueue(q);
    now += MAXIMUM_AGE_MS + 1;
    await q.flush(send);
    expect(problemsOf(q.snapshot())[0]?.problem).toBe(TOO_OLD_PROBLEM);
    expect(backend.keys).toHaveLength(0);
  });
});

describe('almacenamiento durable', () => {
  it('si el navegador no deja guardar, lanza y no queda nada en memoria', () => {
    const broken = {
      getItem: () => null,
      setItem: () => { throw new DOMException('QuotaExceededError'); },
      removeItem: () => undefined,
    } as unknown as Storage;
    const q = new OfflineStaffQueue(browserDurableStore(broken), SCOPE_A, { newId: ids });
    expect(() => enqueue(q)).toThrow(DurableStorageError);
    expect(q.snapshot().orders).toHaveLength(0);
  });

  it('sin localStorage (bloqueado) también lanza en vez de seguir callado', () => {
    const store = browserDurableStore(null);
    expect(() => store.read('x')).toThrow(DurableStorageError);
    expect(() => store.write('x', '1')).toThrow(DurableStorageError);
  });

  it('una cola guardada ilegible no se pisa: se reporta', () => {
    window.localStorage.setItem(queueStorageKey(SCOPE_A), '{no es json');
    expect(() => queue().snapshot()).toThrow(DurableStorageError);
  });
});

describe('borrador del pedido', () => {
  it('conserva el borrador y la llave del intento por sesión, sin token', () => {
    const store: DurableStore = browserDurableStore(window.localStorage);
    saveStaffOrderDraft(store, SCOPE_A, { draft: { ...BORRADOR_VACIO, nombreCliente: 'Ana' }, llave: { huella: 'h', llave: 'llave-recarga' }, pagoAlFinalTocado: false });
    expect(loadStaffOrderDraft(store, SCOPE_A)?.llave?.llave).toBe('llave-recarga');
    expect(loadStaffOrderDraft(store, SCOPE_B)).toBeNull();
    expect(loadStaffOrderDraft(store, SCOPE_PROD)).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toContain(TOKEN);
    clearStaffOrderDraft(store, SCOPE_A);
    expect(loadStaffOrderDraft(store, SCOPE_A)).toBeNull();
  });
});
