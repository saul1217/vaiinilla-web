import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

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
const password = env.E2E_PASSWORD ?? '';
const accounts = {
  admin: env.E2E_ADMIN_EMAIL ?? '',
  cajero: env.E2E_CAJERO_EMAIL ?? '',
  cocina: env.E2E_COCINA_EMAIL ?? '',
  mesero: env.E2E_MESERO_EMAIL ?? '',
};

// El CORS del API de desarrollo solo admite http://127.0.0.1:5173 (no el 4173 de la config): `npm run dev -- --host 127.0.0.1`.
test.use({ baseURL: env.E2E_BASE_URL ?? 'http://127.0.0.1:5173' });

test.skip(!password, 'Falta .env.e2e.local con las cuentas QA de desarrollo.');

async function shot(page: Page, name: string, projectName: string) {
  await page.waitForTimeout(700); // deja terminar transiciones y animaciones de entrada
  await page.screenshot({ path: `test-results/legibilidad/${projectName}/${name}.png`, fullPage: true });
}

async function login(page: Page, email: string) {
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
  await page.getByRole('button', { name: 'Quitar artículo' }).first().click();
  await shot(page, 'pos-02-quitar-articulo', info.project.name);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cobrar', exact: true }).first().click();
  await shot(page, 'pos-03-cobrar', info.project.name);
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

test('Mesero: tablero de mesas', async ({ page }, info) => {
  await login(page, accounts.mesero);
  await page.locator('.staff-tile:not(.staff-tile--skeleton)').first().waitFor({ timeout: 20_000 });
  await shot(page, 'mesero-01-inicio', info.project.name);
  await page.locator('.staff-tile', { hasText: 'Mesa' }).filter({ hasText: 'pedido' }).first().click();
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
