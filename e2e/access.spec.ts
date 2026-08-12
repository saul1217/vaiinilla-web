import { expect, test } from '@playwright/test';

test('muestra el acceso de Administración y POS sin selector público de roles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Administración y POS' })).toBeVisible();
  await expect(page.getByText('Sin selector público de roles')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Acceso restringido de plataforma' })).toHaveCount(0);
});

test('protege el historial de pedidos con la sesión administrativa', async ({ page }) => {
  await page.goto('/app/pedidos');
  await expect(page).toHaveURL(/\/acceso$/);
  await expect(page.getByRole('heading', { name: 'Administración y POS' })).toBeVisible();
});

test('mantiene Super Admin en una superficie separada', async ({ page }) => {
  await page.goto('/plataforma/acceso');
  await expect(page.getByRole('heading', { name: 'Super Admin' })).toBeVisible();
  await expect(page.getByText('Firebase + TOTP obligatorio')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Volver a Administración y POS' })).toBeVisible();
});

test('captura el token de invitación y lo retira de la URL', async ({ page }) => {
  await page.goto('/invitaciones/aceptar?token=token-secreto-de-prueba');
  await expect(page).toHaveURL(/\/invitaciones\/aceptar$/);
  await expect(page.getByRole('heading', { name: 'Acepta tu invitación' })).toBeVisible();
  await expect(page.getByLabel('Paso 1 de 4')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('token-secreto-de-prueba');
});

test('rechaza de forma clara un enlace de verificación incompleto', async ({ page }) => {
  await page.goto('/acceso/verificar?mode=verifyEmail');
  await expect(page).toHaveURL(/\/acceso\/verificar$/);
  await expect(page.getByRole('heading', { name: 'No pudimos verificarlo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver y solicitar otro correo' })).toBeVisible();
});

test('publica rutas legales sin simular un consentimiento inexistente', async ({ page }) => {
  await page.goto('/legal/terminos/2026-07');
  await expect(page.getByRole('heading', { name: 'Términos y condiciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documento pendiente de publicación' })).toBeVisible();
});

test('rechaza de forma clara un enlace de recuperación incompleto', async ({ page }) => {
  await page.goto('/acceso/recuperar?mode=resetPassword');
  await expect(page).toHaveURL(/\/acceso\/recuperar$/);
  await expect(page.getByRole('heading', { name: 'Enlace no disponible' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al acceso' })).toBeVisible();
});
