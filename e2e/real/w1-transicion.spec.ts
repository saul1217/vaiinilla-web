// Bloque A · cafetería · W1 de la tanda 3: el guardado de «Flujo de mi tienda» manda el tipo y los
// modos (QR, pagar al final, entrega en mesa) por preflight + transición versionada, y lo demás por
// el PATCH. UI real contra el backend real; la base solo se lee antes y después con otra conexión.
// Corre después de a-cafeteria.spec.ts: DEV-Cafe Norte ya tiene caja abierta (bloquea) y
// DEV-Cafe Sur no tiene operaciones vivas (permite).
import type { Browser, Page } from '@playwright/test';
import { consultar, expect, iniciarSesion, TENANT_A, TENANT_B, test } from './fixtures';

interface Ajustes {
  tipo: string;
  gracia_liberacion_min: number;
  permite_pago_al_final: boolean;
  entrega_requiere_qr: boolean;
  entrega_en_espacio: string;
  version: string;
}

const ajustes = (tenant: string) =>
  consultar<Ajustes>(
    `SELECT tipo, gracia_liberacion_min, permite_pago_al_final, entrega_requiere_qr, entrega_en_espacio,
            xmin::text AS version
       FROM establecimientos WHERE id = '${tenant}'`,
  )[0];

const transicionesAplicadas = (tenant: string) =>
  Number(
    consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM idempotencias_api
        WHERE establecimiento_id = '${tenant}' AND operacion = 'establecimiento.configuracion.transicion_hito2'`,
    )[0].n,
  );

async function abrirEditorFlujo(page: Page) {
  await page.goto('/app/flujo');
  await page.getByRole('button', { name: 'Configurar cómo funciona tu tienda' }).click();
  await expect(page.getByLabel('Gracia al terminar un turno (minutos)')).toBeVisible();
}

const revision = (page: Page) => page.getByRole('region', { name: 'Revisa el cambio antes de aplicarlo' });

// Precondición por la UI: si DEV-Cafe Norte no tiene caja abierta, Caja la abre (otro contexto).
async function asegurarCajaAbierta(browser: Browser) {
  const abiertas = consultar(
    `SELECT 1 FROM sesiones_caja WHERE establecimiento_id = '${TENANT_A}' AND cerrada_en IS NULL`,
  );
  if (abiertas.length > 0) return;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page, 'cajero_a');
  await page.goto('/app/pos');
  await page.getByRole('button', { name: 'Abrir Caja' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Abrir Caja' });
  await dialogo.getByLabel('Monto inicial (MXN)').fill('500.00');
  await dialogo.getByRole('button', { name: 'Abrir Caja' }).click();
  await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible();
  await ctx.close();
}

test.describe('A · cafetería · Admin · transición de modos (W1)', () => {
  test('[A-CAF-ADM-05] Admin cambia la entrega en mesa y la gracia: revisa la versión, confirma una vez y la DB guarda los dos grupos', async ({ page }) => {
    const antes = ajustes(TENANT_B);
    const transicionesAntes = transicionesAplicadas(TENANT_B);
    expect(antes.entrega_en_espacio).toBe('mesa');
    await iniciarSesion(page, 'admin_b');
    await abrirEditorFlujo(page);
    await page.getByRole('radio', { name: /Pasan por él a la barra/ }).click();
    await page.getByLabel('Gracia al terminar un turno (minutos)').fill(String(antes.gracia_liberacion_min + 1));
    await page.getByRole('button', { name: 'Guardar flujo' }).click();

    // Preflight de solo lectura: enseña la versión que leyó y no escribe nada todavía.
    await expect(revision(page)).toContainText(`Versión revisada: ${Number(antes.version)}`);
    await expect(revision(page)).toContainText('Pedido en mesa: Lo lleva el mesero → Pasan por él a la barra');
    await expect(revision(page)).toContainText('El servidor permite el cambio');
    expect(ajustes(TENANT_B)).toEqual(antes);

    await revision(page).getByRole('button', { name: 'Aplicar cambio' }).click();
    await expect(page.getByText('Flujo guardado. Ya aplica a los pedidos nuevos.')).toBeVisible({ timeout: 15_000 });
    await expect(revision(page)).toHaveCount(0);

    const despues = ajustes(TENANT_B);
    expect({ ...despues, version: antes.version }).toEqual({
      ...antes,
      entrega_en_espacio: 'barra',
      gracia_liberacion_min: antes.gracia_liberacion_min + 1,
    });
    expect(despues.version).not.toBe(antes.version);
    // Una sola transición con su llave (sin reenvíos).
    expect(transicionesAplicadas(TENANT_B)).toBe(transicionesAntes + 1);
  });

  test('[A-CAF-ADM-06] Admin intenta pagar al final con la caja abierta: la revisión lista la operación que bloquea, sin datos personales, y la DB no cambia', async ({ page, browser }) => {
    await asegurarCajaAbierta(browser);
    const antes = ajustes(TENANT_A);
    const transicionesAntes = transicionesAplicadas(TENANT_A);
    expect(antes.permite_pago_al_final).toBe(false);
    await iniciarSesion(page, 'admin_a');
    await abrirEditorFlujo(page);
    await page.getByRole('radio', { name: /Al final, con cuenta abierta/ }).click();
    await page.getByLabel('Gracia al terminar un turno (minutos)').fill(String(antes.gracia_liberacion_min + 2));
    await page.getByRole('button', { name: 'Guardar flujo' }).click();

    await expect(revision(page)).toContainText('No se puede aplicar todavía');
    const operaciones = revision(page).getByRole('list', { name: 'Operaciones que bloquean' });
    await expect(operaciones).toContainText('Caja abierta');
    await expect(revision(page).getByRole('button', { name: 'Aplicar cambio' })).toHaveCount(0);
    await expect(revision(page).getByRole('button', { name: 'Volver a revisar' })).toBeVisible();
    // Sin correos ni nombres del personal en el detalle del bloqueo.
    await expect(revision(page)).not.toContainText('@');
    await expect(revision(page)).not.toContainText('DEV Cajero Norte');

    // Volver a revisar repite el preflight y sigue bloqueado: nada se escribe, tampoco el PATCH.
    await revision(page).getByRole('button', { name: 'Volver a revisar' }).click();
    await expect(operaciones).toContainText('Caja abierta');
    expect(ajustes(TENANT_A)).toEqual(antes);
    expect(transicionesAplicadas(TENANT_A)).toBe(transicionesAntes);
  });

  test('[A-CAF-ADM-07] Dos sesiones del admin: la versión vencida pide volver a revisar y el resultado conserva el cambio de ambas', async ({ page, browser }) => {
    const antes = ajustes(TENANT_B);
    await iniciarSesion(page, 'admin_b');
    await abrirEditorFlujo(page);
    await page.getByRole('radio', { name: /El cliente elige/ }).click();
    await page.getByRole('button', { name: 'Guardar flujo' }).click();
    await expect(revision(page)).toContainText(`Versión revisada: ${Number(antes.version)}`);

    // Otra sesión del mismo admin quita el QR y lo aplica primero.
    const ctx = await browser.newContext();
    const otra = await ctx.newPage();
    await iniciarSesion(otra, 'admin_b');
    await abrirEditorFlujo(otra);
    await otra.getByRole('radio', { name: /Entregar sin QR/ }).click();
    await otra.getByRole('button', { name: 'Guardar flujo' }).click();
    await revision(otra).getByRole('button', { name: 'Aplicar cambio' }).click();
    await expect(otra.getByText('Flujo guardado. Ya aplica a los pedidos nuevos.')).toBeVisible({ timeout: 15_000 });
    await ctx.close();
    const intermedio = ajustes(TENANT_B);
    expect(intermedio.entrega_requiere_qr).toBe(false);

    // La primera sesión aplica con la versión vieja: 409 y no se guarda nada.
    await revision(page).getByRole('button', { name: 'Aplicar cambio' }).click();
    await expect(revision(page)).toContainText('La configuración cambió en otra sesión desde la revisión');
    await expect(revision(page).getByRole('button', { name: 'Aplicar cambio' })).toHaveCount(0);
    expect(ajustes(TENANT_B)).toEqual(intermedio);

    // Volver a revisar relee lo guardado: versión nueva y solo el cambio propio (no revierte el QR).
    await revision(page).getByRole('button', { name: 'Volver a revisar' }).click();
    await expect(revision(page)).toContainText(`Versión revisada: ${Number(intermedio.version)}`);
    await expect(revision(page).getByRole('list', { name: 'Cambios de tipo o modo' })).not.toContainText('Entrega:');
    await revision(page).getByRole('button', { name: 'Aplicar cambio' }).click();
    await expect(page.getByText('Flujo guardado. Ya aplica a los pedidos nuevos.')).toBeVisible({ timeout: 15_000 });

    const despues = ajustes(TENANT_B);
    expect({ ...despues, version: intermedio.version }).toEqual({ ...intermedio, entrega_en_espacio: 'ambas' });
  });
});
