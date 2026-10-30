/// <reference lib="dom" />
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
      body: `<html data-admin-theme="${theme}"><head><link rel="stylesheet" href="/src/styles/index.css"><link rel="stylesheet" href="/src/styles/app-primitives.css"><link rel="stylesheet" href="/src/styles/admin-screens.css"><link rel="stylesheet" href="/src/styles/mesero-slice.css"><link rel="stylesheet" href="/src/components/cashier.css"></head>
      <body><div class="app-frame app-frame--tenant">
      <header class="app-identity"><button class="app-account-button">CA</button></header>
      <div class="queue-column"><header class="queue-column__header"><h2>Cola</h2><p>En espera</p></header>
      <article class="kitchen-ticket"><div class="kitchen-ticket__product"><strong>Producto</strong></div>
      <span class="kitchen-ticket__quantity">2</span><ul class="kitchen-ticket__options"><li>Opción</li></ul></article></div>
      <section class="cashier-queue"><div class="app-receipt"><h3 class="cashier-receipt__folio">#241</h3><dl class="cashier-receipt__totals"><div><dt>Total</dt><dd>$85.00</dd></div></dl></div></section><span class="staff-chip">Cocina</span><span class="space-account__chip">Pagado</span>
      <span class="space-account__chip space-account__chip--due">Pendiente</span><span class="guest-tag">Invitado</span>
      <button class="staff-tile staff-tile--call">Llamando</button>
      <button class="staff-tile staff-tile--ready">Listo</button>
      <div class="staff-stat staff-stat--ready"><dt>Listas</dt></div>
      <fieldset class="app-segments"><legend>Mesas</legend><div class="app-segments__options"><label class="app-segments__option"><input type="radio" checked /><span>Todas</span></label><label class="app-segments__option"><input type="radio" /><span>Por atender</span></label></div></fieldset>
      <input class="field__control" value="Pedido" />
      <nav class="app-mobile-nav"><a href="/app/pos" class="app-link--active">Caja</a><button>Más</button></nav></div><section class="app-sheet"><p class="space-payment-balance"><span>Pendiente</span><strong>$100.00 MXN</strong></p><div class="app-sheet__header"><h2>Cuenta</h2></div><button class="app-sheet__close">X</button></section></body></html>`,
    }));
    await page.goto('/staff-contrast-fixture');
    await page.locator('link').evaluateAll((links) => Promise.all(links.map((el) => (el as HTMLLinkElement).sheet ? Promise.resolve() : new Promise((resolve) => el.onload = resolve))));
    const pairs = await page.evaluate(staffContrastPairs);
    console.log(theme, JSON.stringify(pairs));
    for (const pair of pairs) expect(pair.ratio, pair.selector).toBeGreaterThanOrEqual(4.5);
  });
}
