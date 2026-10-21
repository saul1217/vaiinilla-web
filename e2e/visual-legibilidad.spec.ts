import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Credenciales de la tienda QA de desarrollo: `.env.e2e.local` (fuera de git).
function loadEnv(): Record<string, string> {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env.e2e.local'), 'utf8').split('\n');
    return Object.fromEntries(
      lines.filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };
// Cada cuenta QA tiene su propia contraseña (no hay una compartida).
const accounts = {
  admin: { email: env.E2E_ADMIN_EMAIL ?? '', password: env.E2E_ADMIN_PASSWORD ?? '' },
  cajero: { email: env.E2E_CAJERO_EMAIL ?? '', password: env.E2E_CAJERO_PASSWORD ?? '' },
  cocina: { email: env.E2E_COCINA_EMAIL ?? '', password: env.E2E_COCINA_PASSWORD ?? '' },
  mesero: { email: env.E2E_MESERO_EMAIL ?? '', password: env.E2E_MESERO_PASSWORD ?? '' },
};

// El CORS del API de desarrollo solo admite http://127.0.0.1:5173 (no el 4173 de la config): `npm run dev -- --host 127.0.0.1`.
test.use({ baseURL: env.E2E_BASE_URL ?? 'http://127.0.0.1:5173' });

test.skip(Object.values(accounts).some((a) => !a.email || !a.password), 'Falta .env.e2e.local con las cuentas QA de desarrollo.');

async function shot(page: Page, name: string, projectName: string) {
  await page.waitForTimeout(700); // deja terminar transiciones y animaciones de entrada
  await page.screenshot({ path: `test-results/legibilidad/${projectName}/${name}.png`, fullPage: true });
}

async function login(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/accesos$|\/app/);
  if (page.url().endsWith('/accesos')) {
    await page.locator('button.access-card:not(.access-card--skeleton)').first().click();
  }
  await expect(page).toHaveURL(/\/app/);
}

test('acceso: formulario vacío y error de credenciales', async ({ page }, info) => {
  await page.goto('/acceso');
  await shot(page, 'acceso-01-formulario', info.project.name);
  await page.getByLabel('Correo').fill('nadie@vaiinilla.test');
  await page.getByLabel('Contraseña').fill('incorrecta-1');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.locator('.feedback, [role="alert"]').first().waitFor({ timeout: 15_000 });
  await shot(page, 'acceso-02-error', info.project.name);
});

test('Caja (POS) con tema oscuro del personal', async ({ page }, info) => {
  await login(page, accounts.cajero);
  await page.goto('/app/pos');
  await expect(page.locator('html')).toHaveAttribute('data-staff-ui', 'nueva');
  await page.waitForLoadState('networkidle');
  await shot(page, 'pos-01-inicio', info.project.name);
  // «Quitar artículo» solo existe dentro del diálogo que abre «Rechazar o quitar» en un pedido en efectivo,
  // y «Cobrar» queda deshabilitado sin sesión de Caja abierta. Se fotografía lo que el estado de la tienda permita.
  await expect(page.getByRole('heading', { name: 'Caja en control.' })).toBeVisible({ timeout: 20_000 });
  const rechazar = page.getByRole('button', { name: 'Rechazar o quitar' }).first();
  if (await rechazar.count()) {
    await rechazar.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await shot(page, 'pos-02-quitar-articulo', info.project.name);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const cobrar = page.getByRole('button', { name: 'Cobrar', exact: true }).first();
  if ((await cobrar.count()) && (await cobrar.isEnabled())) {
    await cobrar.click();
    await shot(page, 'pos-03-cobrar', info.project.name);
  }
});

test('Cocina con tema oscuro del personal', async ({ page }, info) => {
  await login(page, accounts.cocina);
  await page.goto('/app/cocina');
  await expect(page.locator('html')).toHaveAttribute('data-staff-ui', 'nueva');
  await page.waitForLoadState('networkidle');
  await shot(page, 'cocina-01-tablero', info.project.name);
  const tickets = page.locator('.kitchen-ticket');
  for (let index = 0; index < (await tickets.count()); index += 1) {
    await tickets.nth(index).screenshot({ path: `test-results/legibilidad/${info.project.name}/cocina-ticket-${index + 1}.png` });
  }
});

// La tienda de CI no trae mesas sembradas. Con la cuenta admin se crean por API (lote) solo si no hay ninguna.
async function sembrarMesas(browser: Browser) {
  const context = await browser.newContext({ baseURL: env.E2E_BASE_URL ?? 'http://127.0.0.1:5173' });
  try {
    const page = await context.newPage();
    await login(page, accounts.admin);
    const [listado] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/espacios/administracion'), { timeout: 30_000 }),
      page.goto('/app/espacios'),
    ]);
    const authorization = (await listado.allHeaders())['authorization'];
    expect(authorization, 'El panel no envió Authorization al listar espacios.').toBeTruthy();
    const headers = { Authorization: authorization, Accept: 'application/json' };
    const respuesta = await context.request.get(listado.url(), { headers });
    expect(respuesta.ok(), `Listar espacios respondió ${respuesta.status()}.`).toBeTruthy();
    const { data } = (await respuesta.json()) as { data: unknown[] };
    if (data.length > 0) return;
    const base = listado.url().split('/espacios/administracion')[0];
    const alta = await context.request.post(`${base}/espacios/lote`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { tipo: 'mesa', prefijo: 'Mesa', desde: 1, hasta: 4 },
    });
    expect(
      alta.ok(),
      `Crear mesas de CI respondió ${alta.status()}: el admin de CI no pudo sembrarlas. Respuesta: ${await alta.text()}`,
    ).toBeTruthy();
  } finally {
    await context.close();
  }
}

test('Mesero: tablero de mesas', async ({ page, browser }, info) => {
  await sembrarMesas(browser);
  await login(page, accounts.mesero);
  // Distingue "no carga" de "la tienda no tiene mesas" para que el fallo diga la causa y no sea un timeout ciego.
  const tile = page.locator('.staff-tile:not(.staff-tile--skeleton)').first();
  const sinMesas = page.getByText('Sin mesas', { exact: true });
  const error = page.locator('.feedback--error, [role="alert"]').first();
  await expect(tile.or(sinMesas).or(error)).toBeVisible({ timeout: 20_000 });
  expect(await sinMesas.count(), 'La tienda de CI no tiene espacios (datos sembrados), no es la interfaz.').toBe(0);
  expect(await tile.count(), 'El tablero del mesero devolvió un error en vez de mesas.').toBeGreaterThan(0);
  await shot(page, 'mesero-01-inicio', info.project.name);
  // Prefiere una mesa con pedidos; si no hay, abre la primera.
  const conPedidos = page.locator('.staff-tile--active, .staff-tile--ready, .staff-tile--call').first();
  await ((await conPedidos.count()) ? conPedidos : tile).click();
  await shot(page, 'mesero-02-mesa', info.project.name);
});

test('Administración: pantallas clave en tema claro', async ({ page }, info) => {
  await login(page, accounts.admin);
  for (const [route, name] of [
    ['/app/pedidos', 'admin-01-pedidos'],
    ['/app/menu', 'admin-02-menu'],
    ['/app/espacios', 'admin-03-espacios'],
    ['/app/flujo', 'admin-04-flujo'],
  ] as const) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await shot(page, name, info.project.name);
  }
});
