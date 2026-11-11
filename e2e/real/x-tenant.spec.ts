// Negativas cross-tenant y de autoridad (error humano 10 de la tanda 3): un admin del negocio B
// no ve ni toca datos del negocio A, y un token de negocio no abre la plataforma.
import { consultar, expect, iniciarSesion, TENANT_A, test } from './fixtures';

test('[A-CAF-ADM-03] Error humano (tenant equivocado): admin de DEV-Cafe Sur solo ve su negocio, nunca el menú ni las mesas de DEV-Cafe Norte', async ({ page }) => {
  const antes = consultar(`SELECT count(*)::int AS pedidos, (SELECT count(*)::int FROM productos WHERE establecimiento_id = '${TENANT_A}') AS productos
                             FROM pedidos WHERE establecimiento_id = '${TENANT_A}'`)[0];
  await iniciarSesion(page, 'admin_b');
  await expect(page.getByRole('heading', { name: 'DEV-Cafe Sur', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar acceso' }).click();
  await expect(page.getByRole('button', { name: /DEV-Cafe Sur Administración/ })).toBeVisible();
  await expect(page.getByText('DEV-Cafe Norte')).toHaveCount(0);
  await page.getByRole('button', { name: /DEV-Cafe Sur Administración/ }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto('/app/menu');
  await expect(page.getByText('DEV-Torta Sur').first()).toBeVisible();
  await expect(page.getByText('DEV-Chilaquiles')).toHaveCount(0);
  await page.goto('/app/espacios');
  await expect(page.getByText('Mesa 1').first()).toBeVisible();
  await expect(page.getByText('Mesa 3')).toHaveCount(0);
  const despues = consultar(`SELECT count(*)::int AS pedidos, (SELECT count(*)::int FROM productos WHERE establecimiento_id = '${TENANT_A}') AS productos
                               FROM pedidos WHERE establecimiento_id = '${TENANT_A}'`)[0];
  expect(despues).toEqual(antes);
});

test('[A-CAF-ADM-04] Error humano (autoridad equivocada): admin de negocio que abre /plataforma no entra como Super Admin', async ({ page }) => {
  await iniciarSesion(page, 'admin_a');
  await page.goto('/plataforma');
  await expect(page).not.toHaveURL(/\/plataforma\/?$/);
  await expect(page.getByRole('link', { name: /Establecimientos/ })).toHaveCount(0);
});
