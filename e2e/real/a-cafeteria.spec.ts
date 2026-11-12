// Bloque A · cafetería · vertical UI → backend → DB (PR 1 de la tanda 3, sección 10).
// Cada escenario recorre la UI real; la base solo se lee al final con una conexión aparte.
// El ID entre corchetes es el del manifiesto (e2e/real/manifiesto.json): `npm run e2e:conteo` los cuadra.
import type { Browser, Page } from '@playwright/test';
import { consultar, expect, iniciarSesion, TENANT_A, test } from './fixtures';

interface PedidoDb {
  id: string;
  establecimiento_id: string;
  origen: string;
  espacio: string | null;
  total: string;
  estado: string;
  pago_diferido: boolean;
  cashback_otorgado: string;
}

function pedidosDe(notaCliente: string): PedidoDb[] {
  return consultar<PedidoDb>(`
    SELECT p.id, p.establecimiento_id, p.origen, e.nombre AS espacio, p.total::text, p.estado,
           p.pago_diferido, p.cashback_otorgado::text
      FROM pedidos p LEFT JOIN espacios e ON e.id = p.espacio_id
     WHERE p.nombre_cliente_snapshot = '${notaCliente.replace(/'/g, "''")}'`);
}

function cajasAbiertas(): { monto_inicial: string }[] {
  return consultar(`SELECT monto_inicial::text FROM sesiones_caja
                     WHERE establecimiento_id = '${TENANT_A}' AND cerrada_en IS NULL`);
}

// Precondición por la UI: si no hay caja abierta, Caja la abre con su fondo (otro contexto).
async function asegurarCajaAbierta(browser: Browser) {
  if (cajasAbiertas().length > 0) return;
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

async function abrirNuevoPedidoEnMesa(page: Page, mesa: string) {
  await page.goto('/app/pos');
  await page.getByRole('button', { name: `${mesa}.` }).first().click();
  await page.getByRole('dialog', { name: mesa }).getByRole('button', { name: 'Nuevo pedido en esta mesa' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nuevo pedido' });
  await expect(dialogo.getByRole('heading', { name: `Pedido para ${mesa}` })).toBeVisible();
  return dialogo;
}

async function agregar(dialogo: ReturnType<Page['getByRole']>, producto: string) {
  await dialogo.getByRole('article').filter({ hasText: producto }).getByRole('button', { name: 'Agregar' }).click();
}

test.describe('A · cafetería · Caja', () => {
  test('[A-CAF-CAJ-01] Caja abre turno con su fondo inicial y la DB registra una sola sesión', async ({ page }) => {
    // Precondición: el seed no abre caja. Si ya hubiera una, el escenario falla en vez de saltarse.
    expect(cajasAbiertas()).toEqual([]);
    await iniciarSesion(page, 'cajero_a');
    await page.goto('/app/pos');
    await expect(page.getByText('Caja cerrada')).toBeVisible();
    await page.getByRole('button', { name: 'Abrir Caja' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Abrir Caja' });
    await dialogo.getByLabel('Monto inicial (MXN)').fill('750.50');
    await dialogo.getByRole('button', { name: 'Abrir Caja' }).click();
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeVisible();
    await expect(page.getByText('$750.50').first()).toBeVisible();

    expect(cajasAbiertas()).toEqual([{ monto_inicial: '750.50' }]);
  });

  test('[A-CAF-CAJ-02] Error humano: fondo con coma, negativo o vacío muestra validación y no abre otra caja', async ({ page }) => {
    const antes = consultar(`SELECT count(*)::int AS n FROM sesiones_caja WHERE establecimiento_id = '${TENANT_A}'`)[0];
    await iniciarSesion(page, 'cajero_a');
    await page.goto('/app/pos');
    const boton = page.getByRole('button', { name: /^(Abrir Caja|Cerrar caja)$/ });
    await expect(boton).toBeVisible();
    // Si la caja ya está abierta (A-CAF-CAJ-01), Caja no puede abrir otra: es la misma invariante.
    if ((await boton.textContent())?.trim() === 'Cerrar caja') {
      await expect(page.getByRole('button', { name: 'Abrir Caja' })).toHaveCount(0);
    } else {
      await boton.click();
      const dialogo = page.getByRole('dialog', { name: 'Abrir Caja' });
      for (const valor of ['-5', '12,50', '', '😀']) {
        await dialogo.getByLabel('Monto inicial (MXN)').fill(valor);
        await dialogo.getByRole('button', { name: 'Abrir Caja' }).click();
        await expect(dialogo.getByText(/Escribe un monto/)).toBeVisible();
      }
      await dialogo.getByRole('button', { name: 'Cerrar ventana' }).click();
    }
    const despues = consultar(`SELECT count(*)::int AS n FROM sesiones_caja WHERE establecimiento_id = '${TENANT_A}'`)[0];
    expect(despues).toEqual(antes);
  });
});

test.describe('A · cafetería · Mesero', () => {
  test('[A-CAF-MES-01] Mesero registra un pedido en Mesa 3 sin ofrecer pago al final (el negocio no lo permite) y la DB lo enlaza a esa mesa', async ({ page, browser }) => {
    await asegurarCajaAbierta(browser);
    await iniciarSesion(page, 'mesero_a');
    const dialogo = await abrirNuevoPedidoEnMesa(page, 'Mesa 3');
    await dialogo.getByLabel('Nombre del cliente (opcional)').fill('DEV-Ana mesa 3');
    await agregar(dialogo, 'DEV-Chilaquiles');
    await agregar(dialogo, 'DEV-Cafe americano');
    // T3-0011: DEV-Cafe Norte no permite pagar al final, así que la opción no se ofrece.
    await expect(dialogo.getByLabel('Pagar al final, con la cuenta de la mesa')).toHaveCount(0);
    await expect(dialogo.getByText('$155.50 MXN')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(page.getByRole('dialog', { name: 'Nuevo pedido' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Mesa 3\./ })).not.toHaveAccessibleName(/Libre/);

    const pedidos = pedidosDe('DEV-Ana mesa 3');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({
      establecimiento_id: TENANT_A,
      origen: 'mostrador',
      espacio: 'Mesa 3',
      total: '155.50',
      pago_diferido: false,
      cashback_otorgado: '0.00',
    });
  });

  test('[A-CAF-MES-02] Error humano: doble clic en Enviar pedido crea un solo pedido', async ({ page, browser }) => {
    await asegurarCajaAbierta(browser);
    await iniciarSesion(page, 'mesero_a');
    const dialogo = await abrirNuevoPedidoEnMesa(page, 'Mesa 4');
    await dialogo.getByLabel('Nombre del cliente (opcional)').fill('DEV-Beto doble clic');
    await agregar(dialogo, 'DEV-Cafe americano');
    await dialogo.getByRole('button', { name: 'Enviar pedido' }).dblclick();
    await expect(page.getByRole('dialog', { name: 'Nuevo pedido' })).toHaveCount(0);

    const pedidos = pedidosDe('DEV-Beto doble clic');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ espacio: 'Mesa 4', total: '35.50', origen: 'mostrador' });
  });
});

test.describe('A · cafetería · Cocina', () => {
  test('[A-CAF-COC-01] Cocina ve la comanda que registró el mesero, solo con productos de su estación', async ({ page, browser }) => {
    await asegurarCajaAbierta(browser);
    const mesero = await browser.newContext();
    const pm = await mesero.newPage();
    await iniciarSesion(pm, 'mesero_a');
    const dialogo = await abrirNuevoPedidoEnMesa(pm, 'Mesa 4');
    await dialogo.getByLabel('Nombre del cliente (opcional)').fill('DEV-Comanda cocina');
    await agregar(dialogo, 'DEV-Chilaquiles');
    await dialogo.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(pm.getByRole('dialog', { name: 'Nuevo pedido' })).toHaveCount(0);
    await mesero.close();

    await iniciarSesion(page, 'cocina_a');
    await page.goto('/app/cocina');
    const comandas = page.getByRole('region', { name: 'Pedidos de Cocina' });
    await expect(comandas.getByText('DEV-Chilaquiles').first()).toBeVisible({ timeout: 15_000 });
    await expect(comandas.getByText('DEV-Cafe americano')).toHaveCount(0);

    const [pedido] = pedidosDe('DEV-Comanda cocina');
    expect(pedido).toMatchObject({ establecimiento_id: TENANT_A, espacio: 'Mesa 4' });
    const items = consultar(`SELECT nombre_producto, estacion_preparacion FROM pedido_items WHERE pedido_id = '${pedido.id}'`);
    expect(items).toEqual([{ nombre_producto: 'DEV-Chilaquiles', estacion_preparacion: 'cocina' }]);
  });

  test('[A-CAF-COC-02] Error humano (rol equivocado): Cocina que abre /app/pos o /app/flujo vuelve a su tablero y no escribe nada', async ({ page }) => {
    const antes = consultar(`SELECT count(*)::int AS n FROM pedidos WHERE establecimiento_id = '${TENANT_A}'`)[0];
    await iniciarSesion(page, 'cocina_a');
    for (const ruta of ['/app/pos', '/app/flujo']) {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { name: 'Cocina', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nuevo pedido' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Guardar flujo' })).toHaveCount(0);
    }
    const despues = consultar(`SELECT count(*)::int AS n FROM pedidos WHERE establecimiento_id = '${TENANT_A}'`)[0];
    expect(despues).toEqual(antes);
  });
});

test.describe('A · cafetería · Admin', () => {
  async function abrirEditorFlujo(page: Page) {
    await page.goto('/app/flujo');
    await page.getByRole('button', { name: 'Configurar cómo funciona tu tienda' }).click();
    const gracia = page.getByLabel('Gracia al terminar un turno (minutos)');
    await expect(gracia).toBeVisible();
    return gracia;
  }

  const ajustes = () =>
    consultar<{ tipo: string; gracia_liberacion_min: number; permite_pago_al_final: boolean; entrega_en_espacio: string }>(
      `SELECT tipo, gracia_liberacion_min, permite_pago_al_final, entrega_en_espacio FROM establecimientos WHERE id = '${TENANT_A}'`,
    )[0];

  test('[A-CAF-ADM-01] Admin cambia un ajuste ordinario del flujo y la DB solo cambia ese ajuste', async ({ page }) => {
    const antes = ajustes();
    await iniciarSesion(page, 'admin_a');
    const gracia = await abrirEditorFlujo(page);
    await gracia.fill(String(antes.gracia_liberacion_min + 4));
    await page.getByRole('button', { name: 'Guardar flujo' }).click();
    await expect(page.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled({ timeout: 15_000 });
    await page.reload();
    await expect(await abrirEditorFlujo(page)).toHaveValue(String(antes.gracia_liberacion_min + 4));

    expect(ajustes()).toEqual({ ...antes, gracia_liberacion_min: antes.gracia_liberacion_min + 4 });
  });

  test('[A-CAF-ADM-02] Error humano: gracia negativa o vacía muestra validación, no deja guardar y la DB no cambia', async ({ page }) => {
    const antes = ajustes();
    await iniciarSesion(page, 'admin_a');
    const gracia = await abrirEditorFlujo(page);
    for (const valor of ['-1', '']) {
      await gracia.fill(valor);
      await expect(page.getByText(/Escribe un número entero de 0 a/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
    }
    expect(ajustes()).toEqual(antes);
  });
});
