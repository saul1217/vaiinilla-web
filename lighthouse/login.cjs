// Inicia sesión como administrador de la tienda de CI antes de que Lighthouse audite el panel (QA-049).
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto(new URL('/acceso', context.url).href);
  await page.type('input[autocomplete="email"], input[name="email"]', process.env.E2E_ADMIN_EMAIL ?? '');
  await page.type('input[type="password"]', process.env.E2E_PASSWORD ?? '');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type="submit"]')]);
  await page.close();
};
