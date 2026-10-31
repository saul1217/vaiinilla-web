/// <reference lib="dom" />
/// <reference types="vite/client" />
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { OperationalRole } from '../src/types/api';
import { installStaffR2Mocks } from './fixtures/staff-r2';

// Opt-in: nunca genera capturas durante la suite normal.
test.skip(!process.env.CAPTURAS_R2);

async function healthy(page: Page, errors: string[]) {
  // Los avisos operativos legítimos también usan role=alert: comprobar los estilos de error.
  await expect(page.locator('.feedback--error, .field__error, .error-boundary')).toHaveCount(0);
  await expect(page.getByText(/Unexpected Application Error|Something went wrong|No se pudieron consultar|Sin conexión con el servidor/)).toHaveCount(0);
  expect(errors, 'Excepciones sin manejar en la página').toEqual([]);
}

const scenarios = [
  { role: 'mesero', path: '/app/pos', ready: '.staff-tile', seed: 'Mesas' },
  { role: 'cajero', path: '/app/pos', ready: '.cashier-queue__ticket', seed: 'Mariana López' },
  { role: 'cocina', path: '/app/cocina', ready: '.kitchen-work__ticket--selected .kitchen-ticket', seed: 'Chilaquiles verdes' },
  ...['/app', '/app/pedidos', '/app/menu', '/app/espacios', '/app/flujo'].map((path) => ({
    role: 'admin', path, ready: '.admin-screen', seed: ({ '/app': 'Café del Jardín', '/app/pedidos': 'Mariana López',
      '/app/menu': 'Chilaquiles verdes', '/app/espacios': 'Mesa 1', '/app/flujo': 'Flujo de mi tienda' } as Record<string, string>)[path],
  })),
] as const;

for (const scenario of scenarios) {
  for (const theme of ['claro', 'oscuro']) {
    test(`${scenario.role} ${scenario.path} ${theme}`, async ({ page }, info) => {
      test.skip(!['chromium', 'mobile'].includes(info.project.name));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await installStaffR2Mocks(page, scenario.role as OperationalRole, theme);
      await page.goto(scenario.path);
      await expect(page).toHaveURL(new RegExp(`${scenario.path}$`));
      await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
      await expect(page.locator(scenario.ready).first()).toBeVisible();
      if (scenario.path === '/app') {
        await expect(page.getByRole('heading', { name: 'Café del Jardín', exact: true })).toBeVisible();
      } else if (scenario.role === 'mesero' || scenario.path === '/app/flujo') {
        await expect(page.getByRole('heading', { level: 1, name: scenario.seed, exact: true })).toBeVisible();
      } else if (scenario.role === 'cocina') {
        await expect(page.locator('.kitchen-work__ticket--selected').getByText(scenario.seed, { exact: false })).toBeVisible();
      } else {
        await expect(page.getByText(scenario.seed, { exact: false }).first()).toBeVisible();
      }
      await expect(page.locator('.orders-loading, .analytics-loading, .staff-tile--skeleton')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const directory = process.env.CAPTURAS_R2!;
      await mkdir(directory, { recursive: true });
      const routeName = scenario.path.slice(1).replaceAll('/', '-');
      const capture = async (suffix = '') => {
        await healthy(page, errors);
        await page.screenshot({ path: join(directory, `${scenario.role}-${routeName}${suffix}-${theme}-${info.project.name}.png`), fullPage: true, animations: 'disabled' });
        await healthy(page, errors);
      };
      await capture();
      if (scenario.path === '/app/espacios') {
        await page.getByRole('button', { name: 'Editar Mesa 1' }).click();
        await expect(page.getByRole('dialog', { name: 'Mesa 1' })).toBeVisible();
        await capture('-ficha');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'QR y código de Mesa 1' }).click();
        await expect(page.getByRole('dialog', { name: /QR y código · Mesa 1/ })).toBeVisible();
        await expect(page.getByRole('img', { name: 'Código QR de Mesa 1' })).toBeVisible();
        await capture('-qr');
      } else if (scenario.role === 'mesero') {
        await page.getByRole('button', { name: 'Mesa 1. Llamando', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Mesa 1', exact: true })).toBeVisible();
        await expect(page.locator('.space-account')).toBeVisible();
        await capture('-detalle-mesa');
      } else if (scenario.role === 'cajero') {
        await page.getByRole('button', { name: /^Cobrar(?: \$.*)?$/ }).first().click();
        await expect(page.getByRole('dialog', { name: 'Cobrar pedido 241', exact: true })).toBeVisible();
        await capture('-cobro');
      } else if (scenario.role === 'cocina') {
        await page.getByRole('button', { name: 'No se puede preparar', exact: true }).first().click();
        await expect(page.getByRole('dialog', { name: 'Rechazar pedido', exact: true })).toBeVisible();
        await capture('-rechazo');
      } else if (scenario.path === '/app/pedidos') {
        await page.getByRole('button', { name: /^Ver pedido /  }).first().click();
        await expect(page.getByRole('dialog', { name: 'Pedido 241', exact: true })).toBeVisible();
        await capture('-detalle-pedido');
      }
    });
  }
}
