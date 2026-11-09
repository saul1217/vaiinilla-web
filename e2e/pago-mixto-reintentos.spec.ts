import { expect, test, type Page } from '@playwright/test';

const orderId = 'pedido-mixto-qa';
const total = '100.00';
const order = {
  id: orderId, folio: 789, fecha_operativa: '2026-11-06', estado: 'por_cobrar', metodo_pago: 'efectivo',
  destino: 'para_llevar', espacio: null, subtotal: total, ahorro_combinado: '0.00', cashback_otorgado: '0.00',
  total, monto_pagado: '0.00', saldo_pendiente: total, version: 1, creado_en: '2026-11-06T12:00:00Z',
  actualizado_en: '2026-11-06T12:00:00Z', notas_cocina: null, usuario: { nombre: 'Cliente QA', matricula: null },
  items: [{ id: 1, producto_id: 1, nombre_producto: 'Pedido QA', estacion_preparacion: 'caja', cantidad: 1,
    precio_digital_unitario: total, subtotal: total, opciones: [] }],
};

type PaymentState = { remaining: string; charges: number; attempts: { key: string; body: unknown; auth?: string }[]; responses: Map<string, unknown> };
type PrepareOptions = { loseFirstResponse?: boolean; state?: PaymentState; clearStorage?: boolean; usuarioId?: string; establecimientoId?: string; missingEndpoint?: boolean };
/** El intento guardado del pedido para el usuario y la tienda dados (la llave incluye entorno, tienda y usuario). */
function storedAttempt(page: Page, usuarioId = 'qa-user', establecimientoId = 'qa') {
  return page.evaluate(({ usuarioId, establecimientoId, orderId }) => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? '';
      if (key.startsWith('vaiinilla:mixed-payment:v2:') && key.endsWith(`|${establecimientoId}|${usuarioId}|${orderId}`)) return localStorage.getItem(key);
    }
    return null;
  }, { usuarioId, establecimientoId, orderId });
}

async function prepare(page: Page, options: PrepareOptions = {}) {
  const state = options.state ?? { remaining: total, charges: 0, attempts: [], responses: new Map<string, unknown>() };
  await page.route('**/src/context/auth-context.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const AuthProvider = ({children}) => children;
    export const useAuth = () => ({ready:true, configured:true, user:{uid:'qa', displayName:'Cajero QA', emailVerified:true}, signOut:async()=>{}});
  ` }));
  await page.route('**/src/context/session-context.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const SessionProvider = ({children}) => children;
    const tenant = {token:'qa-token-${options.usuarioId ?? 'qa-user'}', context:{rol:'cajero', establecimiento_id:'${options.establecimientoId ?? 'qa'}', usuario_id:'${options.usuarioId ?? 'qa-user'}', modo_restringido:null},
      access:{establecimiento:{id:'${options.establecimientoId ?? 'qa'}', nombre:'Caja QA', slug:'qa'}, rol:'cajero', estado_establecimiento:'activo'}};
    export const useSessions = () => ({tenant, tenantReady:true, platform:null, clearAll:()=>{}, clearTenant:()=>{}});
  ` }));
  await page.route('**/src/lib/features.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: `export const CASHBACK_ENABLED=false; export const CORTES_REPORTE_ENABLED=false; export const isPosMixedPaymentsEnabled=()=>true;` }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const envelope = (data: unknown) => ({ data, meta: {}, error: null });
    if (request.method() === 'GET' && path === '/sesiones-caja/activa') return route.fulfill({ json: envelope({ id: 'caja-qa', fecha_operativa: '2026-11-06', monto_inicial: '500.00', monto_final: null, abierta_en: '2026-11-06T12:00:00Z', cerrada_en: null, cierre_automatico: false }) });
    if (request.method() === 'GET' && path === '/estado-operativo') return route.fulfill({ json: envelope({ recibiendo_pedidos: true, sesion_caja_abierta: true, caja_en_linea: true, cocina_en_linea: true, tiempo_estimado_min: 5, consultado_en: '2026-11-06T12:00:00Z', entrega_requiere_qr: false }) });
    if (request.method() === 'GET' && path === '/pedidos') return route.fulfill({ json: { data: [{ ...order, monto_pagado: (100 - Number(state.remaining)).toFixed(2), saldo_pendiente: state.remaining }], meta: { cursor: null }, error: null } });
    if (request.method() === 'POST' && path === '/latidos') return route.fulfill({ status: 204, body: '' });
    if (request.method() === 'POST' && path === `/pedidos/${orderId}/pagos-mixtos`) {
      if (options.missingEndpoint) {
        state.attempts.push({ key: request.headers()['idempotency-key'] ?? '', body: request.postDataJSON() });
        return route.fulfill({ status: 404, json: { data: null, meta: {}, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } } });
      }
      const key = request.headers()['idempotency-key'] ?? '';
      const body = request.postDataJSON() as { metodo_pago: 'efectivo' | 'terminal'; monto: string; monto_recibido?: string };
      state.attempts.push({ key, body, auth: request.headers()['authorization'] });
      if (!state.responses.has(key)) {
        state.charges += 1;
        const amount = Number(body.monto);
        state.remaining = (Number(state.remaining) - amount).toFixed(2);
        state.responses.set(key, envelope({ pago: { metodo_pago: body.metodo_pago, monto: body.monto }, restante: state.remaining, liquidada: state.remaining === '0.00', pedido: order }));
        if (options.loseFirstResponse && state.charges === 1) return route.abort('failed');
      }
      return route.fulfill({ status: 201, json: state.responses.get(key) });
    }
    return route.fulfill({ status: 200, json: envelope([]) });
  });
  if (options.clearStorage !== false) await page.evaluate(() => localStorage.clear()).catch(() => {});
  await page.goto('/app/pos');
  await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible();
  return state;
}

async function startAttempt(page: Page, amount: string, method: 'Efectivo' | 'Terminal' = 'Terminal') {
  await page.getByRole('button', { name: /Pago mixto/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: method }).click();
  await dialog.getByLabel('Monto de este pago (MXN)').fill(amount);
  if (method === 'Efectivo') await dialog.getByLabel('Efectivo recibido (MXN)').fill(amount);
  await dialog.getByRole('button', { name: 'Registrar pago' }).click();
  return dialog;
}

test('Caja: recarga tras perder respuesta reintenta el mismo intento y cobra una vez', async ({ page }) => {
  const state = await prepare(page, { loseFirstResponse: true });
  await startAttempt(page, '35.00');
  await expect.poll(() => state.charges).toBe(1);
  await page.reload();
  await expect.poll(() => state.attempts.length).toBe(2);
  await expect.poll(() => storedAttempt(page)).toContain('completedRemaining');
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[1].key).toBe(state.attempts[0].key);
  expect(state.attempts[1].body).toEqual(state.attempts[0].body);
  expect(state.charges).toBe(1);
});

test('Caja: dos pestañas reintentan una intención pendiente sin duplicar el cobro', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const sharedState: PaymentState = { remaining: total, charges: 0, attempts: [], responses: new Map<string, unknown>() };
  const state = await prepare(first, { loseFirstResponse: true, state: sharedState });
  const second = await context.newPage();
  await prepare(second, { state: sharedState, clearStorage: false });
  await startAttempt(first, '35.00');
  await expect.poll(() => state.charges).toBe(1);
  const retry = await second.getByRole('button', { name: /Pago mixto/ }).click().then(() => second.getByRole('dialog'));
  await expect(retry.getByRole('button', { name: 'Reintentar el mismo pago' })).toBeVisible();
  await retry.getByRole('button', { name: 'Reintentar el mismo pago' }).click();
  await expect.poll(() => state.attempts.length).toBe(2);
  expect(state.attempts[1].key).toBe(state.attempts[0].key);
  expect(state.charges).toBe(1);
  await context.close();
});

test('Caja: editar monto y método tras perder respuesta conserva body y clave originales', async ({ page }) => {
  const state = await prepare(page, { loseFirstResponse: true });
  await startAttempt(page, '35.00', 'Terminal');
  await expect.poll(() => state.charges).toBe(1);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Reintentar el mismo pago' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Efectivo' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'Terminal' })).toBeDisabled();
  await expect(dialog.getByLabel('Monto de este pago (MXN)')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Reintentar el mismo pago' }).click();
  await expect(page.getByText(/Restan/)).toBeVisible();
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[1].key).toBe(state.attempts[0].key);
  expect(state.attempts[1].body).toEqual(state.attempts[0].body);
  expect(state.charges).toBe(1);
});

test('Caja: servidor idempotente devuelve respuesta repetida sin segundo cobro', async ({ page }) => {
  const state = await prepare(page, { loseFirstResponse: true });
  await startAttempt(page, '100.00');
  await expect.poll(() => state.charges).toBe(1);
  await page.reload();
  await expect.poll(() => state.attempts.length).toBe(2);
  await expect.poll(() => storedAttempt(page)).toContain('completedRemaining');
  expect(state.attempts).toHaveLength(2);
  expect(state.attempts[1].key).toBe(state.attempts[0].key);
  expect(state.charges).toBe(1);
  expect(state.remaining).toBe('0.00');
});

test('Caja: en móvil los controles del pago mixto miden al menos 44 px y no desbordan', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await prepare(page);
  await page.getByRole('button', { name: /Pago mixto/ }).click();
  const dialog = page.getByRole('dialog');
  const targets = [
    dialog.getByRole('radio', { name: 'Efectivo' }),
    dialog.getByRole('radio', { name: 'Terminal' }),
    dialog.getByRole('button', { name: 'Cancelar' }),
    dialog.getByRole('button', { name: 'Registrar pago' }),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('Caja: otro cajero u otra tienda en el mismo navegador no reenvía el intento pendiente', async ({ page }) => {
  const state = await prepare(page, { loseFirstResponse: true });
  await startAttempt(page, '35.00');
  await expect.poll(() => state.charges).toBe(1);
  expect(await storedAttempt(page)).not.toContain('completedRemaining');

  // Mismo navegador, otra sesión: otro usuario de la misma tienda y luego la misma persona en otra tienda.
  for (const owner of [{ usuarioId: 'otro-cajero' }, { establecimientoId: 'otra-tienda' }]) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await prepare(page, { state, clearStorage: false, ...owner });
    await page.getByRole('button', { name: /Pago mixto/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Reintentar el mismo pago' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
  }
  expect(state.attempts).toHaveLength(1);
  expect(state.charges).toBe(1);
  expect(await storedAttempt(page)).not.toContain('completedRemaining');
});

test('Caja: si el servidor no tiene el pago mixto (404) se ve un solo cobro y no se reintenta', async ({ page }) => {
  const state = await prepare(page, { missingEndpoint: true });
  const dialog = await startAttempt(page, '100.00');
  await expect(dialog.getByText(/todavía no está disponible en el servidor/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmar cobro' })).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
  await expect(dialog.getByText('Pago mixto no disponible')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Confirmar cobro' })).toHaveCount(1);
  await expect(page.getByRole('dialog').getByLabel('Monto de este pago (MXN)')).toHaveCount(0);
  expect(state.attempts).toHaveLength(1);
});
