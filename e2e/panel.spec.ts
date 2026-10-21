import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// QA-047. Panel contra el stack de QA (QA-044): cuentas por entorno o `.env.e2e.local` (fuera de git).
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
  mesero: env.E2E_MESERO_EMAIL ?? '',
};

test.use({ baseURL: env.E2E_BASE_URL ?? 'http://127.0.0.1:5173' });
test.skip(!password, 'Falta E2E_PASSWORD y las cuentas QA (ver .env.e2e.local).');
// Decisión de QA del 20 oct 2026: solo Chromium de escritorio.
test.skip(({ isMobile }) => isMobile, 'El E2E del panel corre solo en Chromium de escritorio.');

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

test.describe('Mesero', () => {
  test('el tablero carga y ofrece el interruptor de avisos', async ({ page }) => {
    test.skip(!accounts.mesero, 'Falta E2E_MESERO_EMAIL.');
    await login(page, accounts.mesero);
    await expect(page.locator('.staff-tile:not(.staff-tile--skeleton)').first()).toBeVisible({ timeout: 20_000 });
    // Si el navegador no soporta avisos el interruptor no se muestra.
    const toggle = page.locator('.waiter-alerts__enable');
    if (await toggle.count()) await expect(toggle).toHaveAttribute('aria-pressed', /true|false/);
  });

  test('un aviso pendiente nombra la mesa y se retira al tocarlo', async ({ page }) => {
    test.skip(!accounts.mesero, 'Falta E2E_MESERO_EMAIL.');
    await login(page, accounts.mesero);
    await page.locator('.staff-tile:not(.staff-tile--skeleton)').first().waitFor({ timeout: 20_000 });
    const alert = page.locator('.waiter-alert').first();
    // Los avisos dependen del estado vivo del stack: sin pedido listo ni llamada no hay nada que tocar.
    test.skip((await alert.count()) === 0, 'No hay avisos activos en el stack de QA.');
    const title = (await alert.locator('strong').innerText()).trim();
    expect(title).toMatch(/listo|está llamando/);
    await alert.click();
    await expect(page.locator('.waiter-alert strong', { hasText: title })).toHaveCount(0);
  });

  // QA-040: pendiente de decisión. Al decidirse, cambiar `test.fixme` por `test` y ajustar lo esperado.
  test.fixme('el mesero que libera una reserva la cancela y la cancha queda libre', async ({ page }) => {
    await login(page, accounts.mesero);
    await page.goto('/app/espacios');
    const card = page.getByRole('region', { name: 'Reservas de hoy' });
    await card.getByRole('button', { name: 'Liberar cancha / Cancelar' }).first().click();
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();
    await expect(page.getByText('Cancha liberada. La reserva quedó cancelada.')).toBeVisible();
  });
});

test.describe('Caja', () => {
  test('abre la Caja con su sesión y sus datos', async ({ page }) => {
    test.skip(!accounts.cajero, 'Falta E2E_CAJERO_EMAIL.');
    await login(page, accounts.cajero);
    await page.goto('/app/pos');
    await expect(page.getByRole('heading', { name: 'Caja en control.' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'Sesión de Caja' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Datos de la sesión de Caja' })).toBeVisible();
  });
});

test.describe('Reservas de hoy', () => {
  test('lista las reservas del día o avisa que no hay', async ({ page }) => {
    test.skip(!accounts.admin, 'Falta E2E_ADMIN_EMAIL.');
    await login(page, accounts.admin);
    await page.goto('/app/espacios');
    const card = page.getByRole('region', { name: 'Reservas de hoy' });
    // La tarjeta solo existe si el establecimiento tiene canchas.
    const shown = await card.waitFor({ timeout: 20_000 }).then(() => true, () => false);
    test.skip(!shown, 'El establecimiento QA no tiene canchas.');
    await expect(card.getByText('Consultando reservas…')).toHaveCount(0, { timeout: 20_000 });
    if ((await card.locator('li').count()) > 0) await expect(card.locator('.status-badge').first()).toBeVisible();
    else await expect(card.getByText('No hay reservas para hoy.')).toBeVisible();
  });
});
