import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, MixedPaymentPendingError } from './api';
import {
  MIXED_PAYMENT_ATTEMPT_TTL_MS,
  mixedPaymentStorageKey,
  type MixedPaymentAttempt,
} from './mixed-payment-attempts';

const baseUrl = 'https://vaiinillaback-development.up.railway.app/api/v1';
const server = setupServer();

const orderA = '3d196e4d-9082-4b5d-aa7a-65f0e21ac654';
const orderB = '9a1f3c55-0d6b-4b8e-8a43-0f6b6f2a7c11';
const cajeraTiendaUno = { establecimientoId: 'tienda-1', usuarioId: 'usuario-ana' };
const cajeroTiendaUno = { establecimientoId: 'tienda-1', usuarioId: 'usuario-beto' };
const anaTiendaDos = { establecimientoId: 'tienda-2', usuarioId: 'usuario-ana' };

function ok(restante: string, metodo: 'efectivo' | 'terminal' = 'terminal', monto = '35.00') {
  return HttpResponse.json({
    data: { pago: { metodo_pago: metodo, monto }, restante, liquidada: restante === '0.00', pedido: { id: orderA } },
    meta: {}, error: null,
  }, { status: 201 });
}

function stored(owner: { establecimientoId: string; usuarioId: string }, orderId: string): MixedPaymentAttempt | null {
  const raw = localStorage.getItem(mixedPaymentStorageKey({ apiUrl: baseUrl, ...owner }, orderId));
  return raw ? JSON.parse(raw) as MixedPaymentAttempt : null;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('pago mixto: intentos por entorno, negocio y usuario', () => {
  it('registra un pago con llave UUID y solo agrega efectivo recibido para efectivo', async () => {
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, async ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer token-ana');
      expect(request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i);
      await expect(request.json()).resolves.toEqual({ metodo_pago: 'efectivo', monto: '35.00', monto_recibido: '40.00' });
      return ok('65.00', 'efectivo');
    }));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, {
      metodoPago: 'efectivo', monto: '35.00', montoRecibido: '40.00',
    }, '100.00')).resolves.toMatchObject({ restante: '65.00', liquidada: false });
    expect(stored(cajeraTiendaUno, orderA)).toMatchObject({
      scope: { apiUrl: baseUrl, establecimientoId: 'tienda-1', usuarioId: 'usuario-ana' },
      orderId: orderA,
      completedRemaining: '65.00',
    });
  });

  it('no guarda ni manda nada sin negocio o usuario de la sesión', async () => {
    let calls = 0;
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, () => { calls += 1; return ok('65.00'); }));
    await expect(api.payOrderMixed('token', { establecimientoId: 'tienda-1', usuarioId: '' }, orderA, {
      metodoPago: 'terminal', monto: '35.00',
    }, '100.00')).rejects.toThrow(/sesión de Caja/);
    expect(calls).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('respuesta perdida: el reintento del mismo pago usa la misma llave', async () => {
    const keys: string[] = [];
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key') ?? '');
      return keys.length === 1 ? HttpResponse.error() : ok('65.00');
    }));
    const input = { metodoPago: 'terminal' as const, monto: '35.00' };
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, input, '100.00')).rejects.toThrow();
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).toMatchObject({ body: { metodo_pago: 'terminal', monto: '35.00' } });
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, input, '100.00')).resolves.toMatchObject({ restante: '65.00' });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).toBeNull();
  });

  it('con un pago sin confirmar no deja mandar otro distinto del mismo pedido', async () => {
    let calls = 0;
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, () => { calls += 1; return HttpResponse.error(); }));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00')).rejects.toThrow();
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, {
      metodoPago: 'efectivo', monto: '99.00', montoRecibido: '99.00',
    }, '100.00')).rejects.toBeInstanceOf(MixedPaymentPendingError);
    expect(calls).toBe(1);
  });

  it('tras un 409 conserva la llave y no genera un segundo cobro', async () => {
    const keys: string[] = [];
    let charges = 0;
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, ({ request }) => {
      const key = request.headers.get('Idempotency-Key') ?? '';
      keys.push(key);
      if (keys.filter((seen) => seen === key).length === 1) {
        charges += 1;
        return HttpResponse.error();
      }
      return HttpResponse.json({ data: null, meta: {}, error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'En proceso' } }, { status: 409 });
    }));
    const input = { metodoPago: 'terminal' as const, monto: '36.00' };
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, input, '100.00')).rejects.toThrow();
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, input, '100.00')).rejects.toMatchObject({ status: 409 });
    expect(keys[1]).toBe(keys[0]);
    expect(charges).toBe(1);
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).not.toBeNull();
  });

  it('un 422 cierra el intento y la corrección usa una llave nueva', async () => {
    const keys: string[] = [];
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key') ?? '');
      if (keys.length === 1) return HttpResponse.json({ data: null, meta: {}, error: { code: 'AMOUNT_EXCEEDS_BALANCE', message: 'No' } }, { status: 422 });
      return ok('65.00');
    }));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '136.00' }, '100.00')).rejects.toMatchObject({ status: 422 });
    expect(localStorage.length).toBe(0);
    await api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00');
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('dos pestañas a la vez: la segunda, con el saldo viejo, no cobra otra vez', async () => {
    let charges = 0;
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, async () => {
      charges += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return ok('65.00');
    }));
    const [primera, segunda] = await Promise.allSettled([
      api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00'),
      api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'efectivo', monto: '100.00', montoRecibido: '100.00' }, '100.00'),
    ]);
    expect(primera.status).toBe('fulfilled');
    expect(segunda.status).toBe('rejected');
    expect(segunda.status === 'rejected' ? String(segunda.reason) : '').toMatch(/cambió en otra pestaña/);
    expect(charges).toBe(1);
    await api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '65.00' }, '65.00');
    expect(charges).toBe(2);
  });

  it('otro usuario o tienda en el mismo navegador no ve ni reenvía el intento de Ana', async () => {
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, () => HttpResponse.error()));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00')).rejects.toThrow();
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).not.toBeNull();
    expect(api.pendingMixedPayment(cajeroTiendaUno, orderA)).toBeNull();
    expect(api.pendingMixedPayment(anaTiendaDos, orderA)).toBeNull();

    const keys: string[] = [];
    server.use(http.post(`${baseUrl}/pedidos/:id/pagos-mixtos`, ({ request }) => {
      keys.push(request.headers.get('Authorization') ?? '');
      return ok('65.00');
    }));
    await expect(api.recoverPendingMixedPayments('token-beto', cajeroTiendaUno)).resolves.toEqual([]);
    await expect(api.recoverPendingMixedPayments('token-ana-t2', anaTiendaDos)).resolves.toEqual([]);
    expect(keys).toEqual([]);
    // Beto cobra el mismo pedido con su propia llave, sin tocar el intento de Ana.
    await api.payOrderMixed('token-beto', cajeroTiendaUno, orderA, { metodoPago: 'efectivo', monto: '10.00', montoRecibido: '10.00' }, '100.00');
    expect(stored(cajeraTiendaUno, orderA)?.completedRemaining).toBeUndefined();
    expect(stored(cajeroTiendaUno, orderA)?.idempotencyKey).not.toBe(stored(cajeraTiendaUno, orderA)?.idempotencyKey);
  });

  it('recupera solo los intentos propios, uno por uno, con su misma llave', async () => {
    server.use(http.post(`${baseUrl}/pedidos/:id/pagos-mixtos`, () => HttpResponse.error()));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00')).rejects.toThrow();
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderB, { metodoPago: 'terminal', monto: '20.00' }, '50.00')).rejects.toThrow();
    await expect(api.payOrderMixed('token-beto', cajeroTiendaUno, orderA, { metodoPago: 'terminal', monto: '5.00' }, '100.00')).rejects.toThrow();
    const keyA = stored(cajeraTiendaUno, orderA)!.idempotencyKey;
    const keyB = stored(cajeraTiendaUno, orderB)!.idempotencyKey;

    const seen: Array<{ auth: string | null; key: string | null; path: string }> = [];
    let inFlight = 0;
    server.use(http.post(`${baseUrl}/pedidos/:id/pagos-mixtos`, async ({ request, params }) => {
      inFlight += 1;
      expect(inFlight).toBe(1);
      seen.push({ auth: request.headers.get('Authorization'), key: request.headers.get('Idempotency-Key'), path: String(params.id) });
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return ok('10.00');
    }));
    const recovered = await api.recoverPendingMixedPayments('token-ana', cajeraTiendaUno);
    expect(recovered.map((item) => item.orderId).sort()).toEqual([orderA, orderB].sort());
    expect(seen).toHaveLength(2);
    expect(seen.every((call) => call.auth === 'Bearer token-ana')).toBe(true);
    expect(new Set(seen.map((call) => call.key))).toEqual(new Set([keyA, keyB]));
    // El de Beto sigue pendiente y solo es suyo.
    expect(api.pendingMixedPayment(cajeroTiendaUno, orderA)).not.toBeNull();
  });

  it('descarta lo guardado si no es de este dueño, está alterado o venció', async () => {
    let calls = 0;
    server.use(http.post(`${baseUrl}/pedidos/:id/pagos-mixtos`, () => { calls += 1; return ok('10.00'); }));
    const own = mixedPaymentStorageKey({ apiUrl: baseUrl, ...cajeraTiendaUno }, orderA);
    const base: MixedPaymentAttempt = {
      version: 2,
      scope: { apiUrl: 'https://otro-entorno.example/api/v1', ...cajeraTiendaUno },
      orderId: orderA,
      idempotencyKey: '0b6c7f7e-3f7a-4c39-9d2a-5b0b9b1d7a10',
      body: { metodo_pago: 'terminal', monto: '35.00' },
      expectedRemaining: '100.00',
      createdAt: Date.now(),
    };
    localStorage.setItem(own, JSON.stringify(base));
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).toBeNull();
    expect(localStorage.getItem(own)).toBeNull();

    localStorage.setItem(own, JSON.stringify({ ...base, scope: { apiUrl: baseUrl, ...cajeraTiendaUno }, orderId: orderB }));
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).toBeNull();

    localStorage.setItem(own, '{no es json');
    expect(api.pendingMixedPayment(cajeraTiendaUno, orderA)).toBeNull();

    localStorage.setItem(own, JSON.stringify({ ...base, scope: { apiUrl: baseUrl, ...cajeraTiendaUno }, createdAt: Date.now() - MIXED_PAYMENT_ATTEMPT_TTL_MS - 1 }));
    await expect(api.recoverPendingMixedPayments('token-ana', cajeraTiendaUno)).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it('la recuperación no crea un intento si otra pestaña ya lo resolvió', async () => {
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, () => HttpResponse.error()));
    await expect(api.payOrderMixed('token-ana', cajeraTiendaUno, orderA, { metodoPago: 'terminal', monto: '35.00' }, '100.00')).rejects.toThrow();
    let calls = 0;
    server.use(http.post(`${baseUrl}/pedidos/${orderA}/pagos-mixtos`, async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ok('65.00');
    }));
    const [deUna, deOtra] = await Promise.all([
      api.recoverPendingMixedPayments('token-ana', cajeraTiendaUno),
      api.recoverPendingMixedPayments('token-ana', cajeraTiendaUno),
    ]);
    expect(calls).toBe(1);
    expect(deUna.length + deOtra.length).toBe(1);
  });

  it('recuerda el 404 del endpoint por negocio y usuario, no para otros', () => {
    expect(api.isMixedPaymentUnavailable(cajeraTiendaUno)).toBe(false);
    api.markMixedPaymentUnavailable(cajeraTiendaUno);
    expect(api.isMixedPaymentUnavailable(cajeraTiendaUno)).toBe(true);
    expect(api.isMixedPaymentUnavailable(anaTiendaDos)).toBe(false);
    expect(api.isMixedPaymentUnavailable(cajeroTiendaUno)).toBe(false);
  });
});
