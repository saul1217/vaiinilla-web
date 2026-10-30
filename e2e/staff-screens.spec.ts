import { expect, test } from '@playwright/test';
import type { OperationalStatus } from '../src/types/api';

const operationalStatus = {
  recibiendo_pedidos: false, sesion_caja_abierta: false,
  caja_en_linea: true, cocina_en_linea: true, tiempo_estimado_min: null,
  consultado_en: '2026-10-29T18:00:00.000Z', entrega_requiere_qr: false,
} satisfies OperationalStatus;

// Vite module mocks exercise real screens and the real switcher without Firebase.
for (const role of ['mesero', 'cajero', 'cocina']) {
  test(`${role}: ambos temas elegibles`, async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await page.route('**/src/context/auth-context.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const AuthProvider = ({children}) => children;
        export const useAuth = () => ({ready:true, configured:true, user:{uid:'qa'}, signOut:async()=>{}});`,
    }));
    await page.route('**/src/context/session-context.tsx*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const SessionProvider = ({children}) => children;
        const tenant = {token:'mock', context:{rol:${JSON.stringify(role)}, establecimiento_id:'qa'},
          access:{establecimiento:{nombre:'Tienda QA'}, rol:${JSON.stringify(role)}}};
        export const useSessions = () => ({tenant, tenantReady:true, platform:null, clearAll:()=>{}, clearTenant:()=>{}});`,
    }));
    await page.route('**/src/lib/api.ts*', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `export const apiUrl = '/mock-api';
        export const api = {
          activeCashSession: async()=>null, operationalStatus:async()=>(${JSON.stringify(operationalStatus)}),
          listOrders:async()=>({orders:[],cursor:null}), heartbeat:async()=>{},
          spaceAvailability:async()=>[], pendingRefunds:async()=>[],
          unpaidAccounts:async()=>[], listBookingRefunds:async()=>[]
        };`,
    }));
    await page.route('**/mock-api/espacios/tablero', (route) => route.fulfill({
      json: { data: [1, 2, 3].map((id) => ({
        espacio: { id, nombre: `Mesa ${id}`, tipo: 'mesa' }, pedidos: [],
        llamada: id === 1 ? { id: 'call', motivo: 'cuenta', estado: 'pendiente', creado_en: new Date().toISOString() } : null,
      })) },
    }));
    await page.addInitScript(() => localStorage.setItem('vaiinilla.panel.admin-theme', 'claro'));
    await page.goto(role === 'cocina' ? '/app/cocina' : '/app/pos');
    await expect(page.locator(role === 'mesero' ? '.staff-board' : '.staff-hero')).toBeVisible();
    await expect(page.locator('.operational-panel__updated')).toBeAttached();
    for (const theme of ['claro', 'oscuro']) {
      await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
      await page.screenshot({ path: `/workspace/qa-tema/${role}-${theme}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
      if (theme === 'claro') {
        const menu = page.getByRole('button', { name: 'Abrir navegación', exact: true });
        const mobileMenu = await menu.isVisible();
        if (mobileMenu) await menu.click();
        await expect(page.locator('.sidebar .nav-item--active')).toBeVisible();
        await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
        if (mobileMenu) await page.getByRole('button', { name: 'Cerrar navegación', expanded: true }).click();
      }
    }
    expect(pageErrors).toEqual([]);
  });
}
