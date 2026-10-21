// QA-049 · Regresión de interfaz del panel: capturas, axe y teclado de «Reservas de hoy» (/app/espacios) y Caja (/app/pos).
// Corre contra el preview de Vercel del mismo commit (E2E_BASE_URL) y la API de develop, con la tienda de CI sembrada
// por /dev/test-setup. Condiciones de QA_INTERFAZ_REGRESION: docs/qa-ui-regresion.md.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

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
const adminEmail = env.E2E_ADMIN_EMAIL ?? '';
const cajeroEmail = env.E2E_CAJERO_EMAIL ?? '';

// Reloj fijo: las horas, vencimientos y «hoy» salen iguales en cada corrida.
const FROZEN_TIME = new Date('2026-10-20T15:00:00-06:00');
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;
// Solo se usa tema claro: no hay capturas del tema oscuro del personal.
test.use({ baseURL: env.E2E_BASE_URL ?? 'http://127.0.0.1:5173', colorScheme: 'light', contextOptions: { reducedMotion: 'reduce' } });
test.skip(!password, 'Faltan las cuentas QA (E2E_PASSWORD y correos) de la tienda de CI.');

type Surface = { name: string; route: string; email: () => string; ready: (page: Page) => Promise<void>; trigger?: (page: Page) => ReturnType<Page['locator']> };

const SURFACES: Surface[] = [
  {
    name: 'reservas-de-hoy',
    route: '/app/espacios',
    email: () => adminEmail,
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Reservas de hoy' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Consultando reservas…')).toHaveCount(0, { timeout: 20_000 });
    },
    trigger: (page) => page.getByRole('button', { name: 'Liberar cancha / Cancelar' }).first(),
  },
  {
    name: 'caja',
    route: '/app/pos',
    email: () => cajeroEmail,
    ready: async (page) => {
      await expect(page.locator('html')).toHaveAttribute('data-staff-ui', 'nueva', { timeout: 20_000 });
      await page.waitForLoadState('networkidle');
    },
  },
];

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

// Si los datos de develop no están (error de carga, tienda sin sembrar), la corrida queda BLOQUEADA, no como regresión,
// y no compara ni actualiza referencias.
async function blockIfDataFailed(page: Page, info: TestInfo, surface: Surface) {
  const failed = await page.locator('.feedback--error, [role="alert"]').first().isVisible().catch(() => false);
  if (failed) {
    info.annotations.push({ type: 'bloqueada', description: `Datos de develop no disponibles en ${surface.name}` });
    test.skip(true, `BLOQUEADA (no es regresión): la API de develop no entregó los datos de ${surface.name}.`);
  }
}

async function open(page: Page, info: TestInfo, surface: Surface, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.clock.install({ time: FROZEN_TIME });
  await login(page, surface.email());
  await page.goto(surface.route);
  await surface.ready(page);
  await blockIfDataFailed(page, info, surface);
}

async function stabilize(page: Page) {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  await page.evaluate('document.fonts.ready');
}

// Horas, contadores y folios cambian con los datos: se tapan en la captura.
const volatile = (page: Page) => [page.locator('[data-qa-volatil], time, [class*="timer"], [class*="folio"], .status-badge')];

for (const surface of SURFACES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${surface.name} · ${viewport.name}`, () => {
      test('captura comparada', async ({ page }, info) => {
        await open(page, info, surface, viewport);
        await stabilize(page);
        await expect(page).toHaveScreenshot(`${surface.name}-${viewport.name}.png`, {
          fullPage: true,
          mask: volatile(page).flat(),
          maxDiffPixelRatio: 0.01,
        });
      });

      test('axe: sin violaciones serias ni críticas', async ({ page }, info) => {
        await open(page, info, surface, viewport);
        const exceptions: { id: string; ticket: string }[] = JSON.parse(readFileSync(resolve(process.cwd(), 'e2e/axe-excepciones.json'), 'utf8'));
        for (const entry of exceptions) expect(entry.ticket, `La excepción axe ${entry.id} necesita ticket`).toMatch(/\S/);
        const { violations } = await new AxeBuilder({ page }).disableRules(exceptions.map((entry) => entry.id)).analyze();
        const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
        expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      });

      test('sin desbordamiento horizontal y objetivos de 44 px', async ({ page }, info) => {
        await open(page, info, surface, viewport);
        const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - window.innerWidth');
        expect(overflow).toBeLessThanOrEqual(0);
        const small = await page.locator('main button:visible, main a:visible').evaluateAll((nodes) =>
          nodes
            .map((node) => ({ text: (node.textContent ?? '').trim().slice(0, 30), box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.height < 44 || box.width < 44)
            .map(({ text, box }) => `${text || '(sin texto)'} ${Math.round(box.width)}x${Math.round(box.height)}`),
        );
        expect(small).toEqual([]);
      });
    });
  }
}

test.describe('Reservas de hoy · teclado y estados', () => {
  const surface = SURFACES[0];
  const viewport = VIEWPORTS[0];

  test('Escape cierra el diálogo y devuelve el foco', async ({ page }, info) => {
    await open(page, info, surface, viewport);
    const trigger = surface.trigger!(page);
    test.skip((await trigger.count()) === 0, 'BLOQUEADA: la tienda de CI no trae una reserva por pagar sembrada.');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Liberar cancha' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('estado de carga', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((done) => (release = done));
    await page.route('**/reservas?*', async (route) => {
      await gate;
      await route.continue();
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, surface.email());
    await page.goto(surface.route);
    await expect(page.getByText('Consultando reservas…')).toBeVisible({ timeout: 20_000 });
    release();
  });

  test('estado vacío', async ({ page }) => {
    await page.route('**/reservas?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[],"items":[]}' }));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, surface.email());
    await page.goto(surface.route);
    await expect(page.getByText('No hay reservas para hoy.')).toBeVisible({ timeout: 20_000 });
  });

  test('estado de error', async ({ page }) => {
    await page.route('**/reservas?*', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"forbidden"}' }));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, surface.email());
    await page.goto(surface.route);
    await expect(page.getByText('Tu rol no tiene permiso para ver las reservas.')).toBeVisible({ timeout: 20_000 });
  });
});
