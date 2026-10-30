import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { OperationalStatus } from '../src/types/api';

const operationalStatus = {
  recibiendo_pedidos: false, sesion_caja_abierta: false,
  caja_en_linea: true, cocina_en_linea: true, tiempo_estimado_min: null,
  consultado_en: '2026-10-29T18:00:00.000Z', entrega_requiere_qr: false,
} satisfies OperationalStatus;

// Vite module mocks exercise real screens and the real switcher without Firebase.
for (const role of ['mesero', 'cajero', 'cocina']) {
  test(`${role}: ambos temas elegibles`, async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await page.route('**/src/context/auth-context.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const AuthProvider = ({children}) => children;
        export const useAuth = () => ({ready:true, configured:true, user:{uid:'qa'}, signOut:async()=>{}});`,
    }));
    await page.route('**/src/context/session-context.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const SessionProvider = ({children}) => children;
        const tenant = {token:'mock', context:{rol:${JSON.stringify(role)}, establecimiento_id:'qa'},
          access:{establecimiento:{nombre:'Tienda QA'}, rol:${JSON.stringify(role)}}};
        export const useSessions = () => ({tenant, tenantReady:true, platform:null, clearAll:()=>{}, clearTenant:()=>{}});`,
    }));
    await page.route('**/src/lib/api.ts*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const apiUrl = '/mock-api';
        export const api = {
          activeCashSession: async()=>null, operationalStatus:async()=>(${JSON.stringify(operationalStatus)}),
          listOrders:async()=>({orders:[],cursor:null}), heartbeat:async()=>{},
          spaceAvailability:async()=>[], pendingRefunds:async()=>[],
          unpaidAccounts:async()=>[], listBookingRefunds:async()=>[]
        };`,
    }));
    await page.route('**/mock-api/espacios/tablero', (route) => route.fulfill({
      json: { data: [1, 2, 3].map((id) => ({
        espacio: { id, nombre: `Mesa ${id}`, tipo: 'mesa' }, pedidos: [],
        llamada: id === 1 ? { id: 'call', motivo: 'cuenta', estado: 'pendiente', creado_en: new Date().toISOString() } : null,
      })) },
    }));
    await page.addInitScript(() => localStorage.setItem('vaiinilla.panel.admin-theme', 'claro'));
    await page.goto(role === 'cocina' ? '/app/cocina' : '/app/pos');
    const pageTitle = { mesero: 'Mesas', cajero: 'Caja', cocina: 'Cocina' }[role];
    await expect(page.getByRole('heading', { level: 1, name: pageTitle, exact: true })).toBeVisible();
    if (role === 'mesero') await expect(page.locator('.staff-board')).toBeVisible();
    await expect(page.locator('.operational-panel__updated')).toBeAttached();
    for (const theme of ['claro', 'oscuro']) {
      await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
      const filename = `${role}-${theme}-${info.project.name}.png`;
      const screenshotPath = process.env.QA_SCREENSHOT_DIR
        ? join(process.env.QA_SCREENSHOT_DIR, filename)
        : info.outputPath(filename);
      await mkdir(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
      if (theme === 'claro') {
        const menu = page.getByRole('button', { name: 'Abrir opciones de cuenta', exact: true });
        const mobileMenu = await menu.isVisible();
        await expect(page.locator(mobileMenu ? '.app-mobile-nav .app-link--active' : '.app-rail .app-link--active')).toBeVisible();
        if (mobileMenu) await menu.click();
        await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
        if (mobileMenu) await page.getByRole('button', { name: 'Cerrar ventana' }).click();
      }
    }
    expect(pageErrors).toEqual([]);
  });
}

// Slice 2 smoke cases use the same deterministic data as the opt-in captures.
for (const width of [320, 768]) {
  test(`mesero: teclado, hoja única y filtro vacío a ${width}px`, async ({ page }) => {
    const { installStaffR2Mocks } = await import('./fixtures/staff-r2');
    await page.setViewportSize({ width, height: 844 });
    await installStaffR2Mocks(page, 'mesero', 'oscuro');
    await page.goto('/app/pos');
    const tile = page.getByRole('button', { name: 'Mesa 3. Pedido listo', exact: true });
    await tile.click();
    await page.getByRole('button', { name: 'Cobrar cuenta' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const orders = page.getByRole('radio', { name: 'Por pedidos', exact: true });
    await orders.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Por monto', exact: true })).toBeChecked();
    await page.keyboard.press('End');
    await expect(page.getByRole('radio', { name: 'Partes iguales', exact: true })).toBeChecked();
    await page.keyboard.press('Home');
    await expect(orders).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tile).toBeFocused();
    await page.route('**/mock-api/espacios/tablero', (route) => route.fulfill({
      json: { data: [{ espacio: { id: 9, nombre: 'Terraza', tipo: 'mesa' }, pedidos: [], llamada: null }] },
    }));
    await page.reload();
    await page.getByRole('radio', { name: 'Por atender', exact: true }).click();
    await expect(page.getByText('Nada por atender', { exact: true })).toBeVisible();
    await expect(page.getByText('Sin mesas', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const theme of ['claro', 'oscuro'] as const) {
  test(`caja: ticket único y hojas de sesión/tablero (${theme})`, async ({ page }) => {
    const { installStaffR2Mocks } = await import('./fixtures/staff-r2');
    await installStaffR2Mocks(page, 'cajero', theme);
    await page.goto('/app/pos');
    await expect(page.locator('.cashier-queue__ticket')).toHaveCount(1);
    await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByLabel('Monto final (MXN)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Cerrar caja', exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Mesas y canchas', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Mesas y canchas', exact: true })).toBeVisible();
    await expect(page.locator('.staff-board')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

for (const theme of ['claro', 'oscuro']) {
  test(`cocina: selección, versiones, listo y rechazo parcial (${theme})`, async ({ page }) => {
    const { installKitchenSliceMocks } = await import('./fixtures/kitchen-slice');
    await page.setViewportSize({ width: 390, height: 844 });
    await installKitchenSliceMocks(page, theme);
    await page.goto('/app/cocina');
    const ticket = page.locator('.kitchen-work__ticket--selected');
    await expect(ticket.getByRole('heading', { name: '#72', exact: true })).toBeVisible();
    for (const text of ['Salsa aparte', 'Verde', 'Ya llegó', 'A123', 'Invitado']) await expect(ticket.getByText(text, { exact: true })).toBeVisible();
    const request = page.waitForRequest('**/mock-kitchen/transition');
    await ticket.getByRole('button', { name: 'Marcar como listo' }).click();
    expect((await request).postDataJSON()).toEqual({ token: 'capturas', id: 'kitchen-1', target: 'listo', version: 4 });
    await expect(ticket.getByRole('heading', { name: '#71', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver comanda 72' })).toBeVisible();
    await ticket.getByRole('button', { name: 'No se puede preparar' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCount(1);
    await expect(dialog.getByRole('radio', { name: /Agua/ })).toHaveCount(0);
    await dialog.getByRole('radio', { name: /Tacos/ }).click();
    await dialog.getByRole('button', { name: 'Faltan ingredientes', exact: true }).click();
    await expect(dialog.getByRole('textbox', { name: 'Motivo', exact: true })).toHaveValue('Faltan ingredientes');
    const partial = page.waitForRequest('**/mock-kitchen/item');
    await dialog.getByRole('button', { name: 'Quitar artículo', exact: true }).click();
    expect((await partial).postDataJSON()).toEqual({ token: 'capturas', id: 'kitchen-0', itemId: 1, version: 4, motivo: 'Faltan ingredientes' });
    await expect(dialog).toHaveCount(0);
    await expect(ticket.getByText('Quitado: Faltan ingredientes')).toBeVisible();
    await expect(ticket.getByText('Agua', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('cocina: cancelar restaura foco y el rechazo total deja la siguiente comanda', async ({ page }) => {
  const { installKitchenSliceMocks } = await import('./fixtures/kitchen-slice');
  await installKitchenSliceMocks(page, 'claro');
  await page.goto('/app/cocina');
  const ticket = page.locator('.kitchen-work__ticket--selected');
  const opener = ticket.getByRole('button', { name: 'No se puede preparar' });
  await opener.click();
  await page.getByRole('textbox', { name: 'Motivo', exact: true }).fill('Borrador');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(page.getByRole('textbox', { name: 'Motivo', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Se acabó el producto', exact: true }).click();
  const request = page.waitForRequest('**/mock-kitchen/reject');
  await page.getByRole('button', { name: 'Rechazar pedido', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ token: 'capturas', id: 'kitchen-1', version: 4, motivo: 'Se acabó el producto' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Pedido 72 rechazado. El cliente verá el motivo.')).toBeVisible();
  await expect(ticket.getByRole('heading', { name: '#71', exact: true })).toBeVisible();
});
