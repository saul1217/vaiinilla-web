import { expect, test } from '@playwright/test';

test('muestra el acceso de Administración y POS sin selector público de roles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Administración y POS' })).toBeVisible();
  await expect(page.getByText('Sin selector público de roles')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Acceso restringido de plataforma' })).toBeVisible();
});

test('mantiene Super Admin en una superficie separada', async ({ page }) => {
  await page.goto('/plataforma/acceso');
  await expect(page.getByRole('heading', { name: 'Super Admin' })).toBeVisible();
  await expect(page.getByText('Firebase + TOTP obligatorio')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a Administración y POS' })).toBeVisible();
});
