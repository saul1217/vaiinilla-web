import { expect, test } from '@playwright/test';
import { staffContrastPairs } from '../src/test/staff-contrast';

// Real stylesheet, isolated staff surfaces: no Firebase accounts or API required.
for (const theme of ['claro', 'oscuro']) {
  test(`staff text contrast: ${theme}`, async ({ page }) => {
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Navigate directly to static HTML: the app must not keep running after setContent.
    await page.route('**/staff-contrast-fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: `<html data-admin-theme="${theme}"><head><link rel="stylesheet" href="/src/styles/index.css"></head>
      <body><div class="app-frame app-frame--tenant">
      <header class="mobile-header"><button class="icon-button">Menú</button></header>
      <div class="queue-column"><header class="queue-column__header"><h2>Cola</h2><p>En espera</p></header>
      <article class="kitchen-ticket"><div class="kitchen-ticket__product"><strong>Producto</strong></div>
      <span class="kitchen-ticket__quantity">2</span><ul class="kitchen-ticket__options"><li>Opción</li></ul></article></div>
      <span class="staff-chip">Cocina</span><span class="space-account__chip">Pagado</span>
      <span class="space-account__chip space-account__chip--due">Pendiente</span><span class="guest-tag">Invitado</span>
      <button class="staff-tile staff-tile--call">Llamando</button>
      <button class="staff-tile staff-tile--ready">Listo</button>
      <div class="staff-stat staff-stat--ready"><dt>Listas</dt></div>
      <div class="staff-segment" data-value="all" role="radiogroup"><span class="staff-segment__indicator"></span><button role="radio" aria-checked="true">Todas</button><button role="radio" aria-checked="false">Por atender</button></div>
      <input class="field__control" value="Pedido" />
      <aside class="sidebar"><a href="/app/pos" class="nav-item nav-item--active"><span>Caja</span></a></aside></div></body></html>`,
    }));
    await page.goto('/staff-contrast-fixture');
    await page.locator('link').evaluate((el: { sheet?: unknown; onload?: unknown }) => el.sheet ? undefined : new Promise((resolve) => el.onload = resolve));
    const pairs = await page.evaluate(staffContrastPairs);
    console.log(theme, JSON.stringify(pairs));
    for (const pair of pairs) expect(pair.ratio, pair.selector).toBeGreaterThanOrEqual(4.5);
  });
}
