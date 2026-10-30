/// <reference lib="dom" />
/// <reference types="vite/client" />
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { api } from '../src/lib/api';
import type { BoardTable } from '../src/lib/mesero-api';
import type { OrderDetail, OperationalRole, SpaceSessionDetail, TenantAnalytics } from '../src/types/api';

// Opt-in: nunca genera capturas durante la suite normal.
test.skip(!process.env.CAPTURAS_R2);

const now = '2026-10-30T19:00:00.000Z';
const since = '2026-10-30T18:20:00.000Z';
type Result<K extends keyof typeof api> = Awaited<ReturnType<(typeof api)[K]>>;
const spaces: Result<'listManagedSpaces'> = [1, 2, 3, 4, 5, 6].map((id) => ({
  id, nombre: id === 6 ? 'Barra 1' : `Mesa ${id}`, tipo: id === 6 ? 'barra' : 'mesa',
  activo: true, codigo: `120${id}`, qr_url: `/tienda/cafe-jardin?espacio=${id}`, precio_hora: null,
}));
const products: Result<'catalog'> = {
  categorias: [{ id: 1, nombre: 'De nuestra cocina', orden: 1 }, { id: 2, nombre: 'Café y bebidas', orden: 2 }],
  productos: ['Chilaquiles verdes', 'Croissant de jamón', 'Ensalada del jardín', 'Latte de vainilla', 'Agua de jamaica', 'Cold brew'].map((nombre, i) => ({
    id: i + 1, categoria_id: i < 3 ? 1 : 2, estacion_preparacion: i < 3 ? 'cocina' : 'caja', nombre,
    descripcion: i < 3 ? 'Preparado al momento con ingredientes de temporada.' : 'Una pausa fresca para tu día.',
    ingredientes: i < 3 ? 'Ingredientes frescos de la casa' : 'Café de especialidad', alergenos: i === 1 ? 'Gluten, lácteos' : null,
    tiempo_estimado_min: i < 3 ? 12 : 4, precio_mostrador: ['120.00', '85.00', '110.00', '65.00', '40.00', '60.00'][i],
    precio_digital: ['120.00', '85.00', '110.00', '65.00', '40.00', '60.00'][i], disponible: i !== 5,
    imagen_url: null, grupos_opcion: i === 3 ? [{ id: 1, nombre: 'Leche', min_selecciones: 1, max_selecciones: 1,
      opciones: [{ id: 1, nombre: 'Entera', precio_extra: '0.00' }, { id: 2, nombre: 'Avena', precio_extra: '10.00' }] }] : [],
  })),
};
// «Nuevo» en cocina corresponde a cobrado/por_cobrar en el contrato.
const orders: OrderDetail[] = (['por_cobrar', 'cobrado', 'preparando', 'listo', 'entregado', 'listo'] as const).map((estado, i) => ({
  id: `pedido-${i + 1}`, folio: 241 + i, fecha_operativa: '2026-10-30', estado,
  metodo_pago: i === 4 ? 'stripe' : 'efectivo', destino: i === 0 ? 'para_llevar' : 'en_espacio',
  espacio: i === 0 ? null : spaces[i % 3], sesion_espacio_id: i === 0 ? null : `sesion-${i % 3 + 1}`,
  sesion_espacio_estado: i === 0 ? null : 'abierta', subtotal: '185.00', total: '185.00',
  ahorro_combinado: '0.00', cashback_otorgado: i === 4 ? '9.25' : '0.00',
  monto_pagado: i === 0 || i === 2 || i === 5 ? '0.00' : '185.00',
  saldo_pendiente: i === 0 || i === 2 || i === 5 ? '185.00' : '0.00',
  pago_diferido: i === 2 || i === 5, pago_pendiente: i === 0 || i === 2 || i === 5,
  version: 1, creado_en: `2026-10-30T18:${40 + i * 2}:00.000Z`, actualizado_en: now,
  notas_cocina: i === 2 ? 'Salsa aparte, por favor.' : null,
  usuario: { nombre: ['Mariana López', 'Diego Ruiz', 'Ana Torres', 'Luis García', 'Sofía Pérez', 'Carlos Méndez'][i], matricula: null },
  items: [products.productos[0], products.productos[3]].map((p, index) => ({
    id: i * 10 + index + 1, producto_id: p.id, nombre_producto: p.nombre, estacion_preparacion: p.estacion_preparacion,
    cantidad: 1, precio_digital_unitario: p.precio_digital, subtotal: p.precio_digital, opciones: [], rechazo: null,
  })),
}));
const availability: Result<'spaceAvailability'> = spaces.map((espacio, i) => ({
  espacio, estado: i < 3 ? 'ocupada' : i === 3 ? 'por_cobrar' : 'libre', saldada: i > 3,
  inicio: i < 4 ? since : null, fin_previsto: null, precio_hora: null, proxima_reserva: null,
}));
const board: BoardTable[] = spaces.map((espacio, i) => ({
  espacio, llamada: i < 2 ? { id: `llamada-${i}`, espacio, pedido_id: null, motivo: i === 0 ? 'cuenta' : 'utensilios',
    estado: i === 0 ? 'pendiente' : 'en_camino', cliente: { nombre: i === 0 ? 'Luis García' : 'Diego Ruiz' },
    tomada_por: i === 0 ? null : { usuario_id: 'qa', nombre: 'Valeria' }, creado_en: '2026-10-30T18:57:00.000Z',
    tomada_en: i === 0 ? null : now, cerrada_en: null, version: 1 } : null,
  pedidos: orders.filter((o) => o.espacio?.id === espacio.id).map((o) => ({ ...o, destino: 'en_espacio',
    sesion_espacio_id: o.sesion_espacio_id ?? null, sesion_espacio_estado: 'abierta', cliente: o.usuario,
    items_resumen: '1× Chilaquiles verdes, 1× Latte de vainilla' })),
}));
const sessions: SpaceSessionDetail[] = spaces.map((espacio) => {
  const rows = orders.filter((o) => o.espacio?.id === espacio.id);
  const total = rows.length * 185;
  const pendiente = rows.reduce((sum, o) => sum + Number(o.saldo_pendiente), 0);
  return { espacio, estado: 'ocupada', saldada: pendiente === 0, fin_previsto: null,
    sesion: { id: `sesion-${espacio.id}`, estado: 'abierta', inicio: since, fin_previsto: null, version: 1 },
    cuenta: { total, pendiente, pagado: total - pendiente, saldada: pendiente === 0, abonado: 0, restante: pendiente, abonos: [],
      pedidos: rows.map((o) => ({ id: o.id, folio: o.folio, estado: o.estado, total: 185, pago_diferido: Boolean(o.pago_diferido),
        pendiente_cobro: Number(o.saldo_pendiente) > 0, cliente: o.usuario, items_resumen: 'Chilaquiles y latte', creado_en: o.creado_en, pagara: o.usuario?.nombre })),
      grupos: rows.map((o) => ({ etiqueta: o.usuario!.nombre, participante_id: o.id, pedidos: [o.id], total: 185,
        pagado: Number(o.monto_pagado), pendiente: Number(o.saldo_pendiente) })),
    },
  };
});
const analytics: TenantAnalytics = {
  periodo: { desde: '2026-10-24', hasta: '2026-10-30' },
  resumen: { ventas_totales: '14800.00', pedidos: 80, ticket_promedio: '185.00', productos_vendidos: 160,
    recargas: '2500.00', compras_saldo: '1850.00', cashback_otorgado: '92.50', propinas: '740.00', comisiones: '180.00' },
  ventas_por_dia: [24, 25, 26, 27, 28, 29, 30].map((day, i) => ({ fecha: `2026-10-${day}`, ventas: String(1200 + i * 300), pedidos: 8 + i })),
  metodos_pago: [{ metodo: 'efectivo', ventas: '9250.00', pedidos: 50 }, { metodo: 'stripe', ventas: '3700.00', pedidos: 20 }, { metodo: 'saldo', ventas: '1850.00', pedidos: 10 }],
  pedidos_por_estado: [{ estado: 'entregado', pedidos: 74 }, { estado: 'preparando', pedidos: 3 }, { estado: 'listo', pedidos: 3 }],
  productos: products.productos.map((p, i) => ({ producto_id: p.id, nombre: p.nombre, cantidad: 40 - i * 5 })),
  wallet: { movimientos: [{ tipo: 'recarga_efectivo', monto: '2500.00', operaciones: 10 }, { tipo: 'compra', monto: '1850.00', operaciones: 10 },
    { tipo: 'cashback', monto: '92.50', operaciones: 10 }], conciliacion: { wallets_revisadas: 10, alertas: 0 } }, calculado_en: now,
};
// Cada respuesta está comprobada contra el retorno real de api.ts.
const responses = {
  activeCashSession: { id: 'caja-1', fecha_operativa: '2026-10-30', monto_inicial: '1500.00', monto_final: null, abierta_en: since, cerrada_en: null, cierre_automatico: false },
  operationalStatus: { recibiendo_pedidos: true, sesion_caja_abierta: true, caja_en_linea: true, cocina_en_linea: true, tiempo_estimado_min: 12, consultado_en: now, entrega_requiere_qr: false },
  catalog: products, spaceAvailability: availability, tenantAnalytics: analytics,
  listManagedSpaces: spaces, listInvitations: { invitations: [], cursor: null },
  unpaidAccounts: { cuentas: sessions.filter((s) => s.cuenta!.pendiente > 0).map((s) => ({ espacio: s.espacio,
    pedidos: s.cuenta!.pedidos.filter((p) => p.pendiente_cobro).length, total: s.cuenta!.pendiente.toFixed(2), desde: since,
    horas: 0.67, clientes: s.cuenta!.grupos!.map((g) => g.etiqueta), abandonada: false })), total: '370.00', abandonadas: 0 },
  pendingRefunds: [], listBookingRefunds: [], listStaffBookings: [],
  cashbackRule: { id: 'cashback-1', nombre: 'Tardes con sabor', porcentaje: '5.00', hora_inicio: '12:00', hora_fin: '18:00', dias_activos: [1, 2, 3, 4, 5], vigencia_inicio: null, vigencia_fin: null, activa: true, creado_en: since, actualizado_en: now },
  businessSettings: { tipo: 'restaurante', entrega_requiere_qr: false, permite_pago_al_final: true, permite_saldo: true,
    gracia_liberacion_min: 15, franjas_pedido: [{ desde: '08:00', hasta: '21:00' }], visible_en_directorio: true,
    tienda_url: '/tienda/cafe-jardin', videos_local: [], imagen_url: null, logo_url: null, tipos_disponibles: ['cafeteria', 'restaurante', 'padel'] },
  bookingSettings: { apertura: '08:00', cierre: '21:00', dias_adelanto: 7, zona_horaria: 'America/Mexico_City' },
  cardPayments: { stripe_enabled: true, stripe_account_id: 'acct_capturas', charges_enabled: true, payouts_enabled: true, estado_onboarding: 'habilitada', pasar_comision_al_cliente: false },
} satisfies Partial<{ [K in keyof typeof api]: Result<K> }>;

async function installMocks(page: Page, role: OperationalRole, theme: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date(now) });
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/src/context/auth-context.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const AuthProvider = ({children}) => children;
    export const useAuth = () => ({ready:true, configured:true, user:{uid:'qa', displayName:'Valeria', emailVerified:true}, signOut:async()=>{}});
  ` }));
  await page.route('**/src/context/session-context.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const SessionProvider = ({children}) => children;
    const tenant = {token:'capturas', context:{rol:${JSON.stringify(role)}, establecimiento_id:'cafe-jardin', modo_restringido:null},
      access:{establecimiento:{id:'cafe-jardin', nombre:'Café del Jardín', slug:'cafe-jardin'}, rol:${JSON.stringify(role)}, estado_establecimiento:'activo'}};
    export const useSessions = () => ({tenant, tenantReady:true, platform:null, clearAll:()=>{}, clearTenant:()=>{}});
  ` }));
  await page.route('**/src/lib/api.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const apiUrl = '/mock-api';
    const responses = ${JSON.stringify(responses)};
    const orders = ${JSON.stringify(orders)};
    const sessions = ${JSON.stringify(sessions)};
    export const api = {
      ...Object.fromEntries(Object.entries(responses).map(([key, value]) => [key, async () => value])),
      heartbeat: async () => {}, registerDevice: async () => {}, unregisterDevice: async () => {},
      listOrders: async (_token, options = {}) => ({orders: orders.filter(o => !options.estado || options.estado.includes(o.estado)), cursor:null}),
      getOrder: async (_token, id) => { const order = orders.find(o => o.id === id); if (!order) throw Error('Pedido sin sembrar: ' + id); return order; },
      spaceSession: async (_token, id) => { const session = sessions.find(s => s.espacio.id === id); if (!session) throw Error('Mesa sin sembrar: ' + id); return session; }
    };
  ` }));
  await page.route('**/mock-api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(path, 'Endpoint directo no sembrado').toBe('/mock-api/espacios/tablero');
    await route.fulfill({ json: { data: board, meta: {}, error: null } });
  });
  await page.addInitScript((value) => localStorage.setItem('vaiinilla.panel.admin-theme', value), theme);
}

async function healthy(page: Page, errors: string[]) {
  // Los avisos operativos legítimos también usan role=alert: comprobar los estilos de error.
  await expect(page.locator('.feedback--error, .field__error, .error-boundary')).toHaveCount(0);
  await expect(page.getByText(/Unexpected Application Error|Something went wrong|No se pudieron consultar|Sin conexión con el servidor/)).toHaveCount(0);
  expect(errors, 'Excepciones sin manejar en la página').toEqual([]);
}

const scenarios = [
  { role: 'mesero', path: '/app/pos', ready: '.staff-tile', seed: 'Mesas' },
  { role: 'cajero', path: '/app/pos', ready: '.order-card', seed: 'Mariana López' },
  { role: 'cocina', path: '/app/cocina', ready: '.kitchen-ticket', seed: 'Chilaquiles verdes' },
  ...['/app', '/app/pedidos', '/app/menu', '/app/espacios', '/app/cashback', '/app/flujo'].map((path) => ({
    role: 'admin', path, ready: '.admin-screen', seed: ({ '/app': 'Café del Jardín', '/app/pedidos': 'Mariana López',
      '/app/menu': 'Chilaquiles verdes', '/app/espacios': 'Mesa 1', '/app/cashback': 'Cashback y wallet', '/app/flujo': 'Flujo de mi tienda' } as Record<string, string>)[path],
  })),
] as const;

for (const scenario of scenarios) {
  for (const theme of ['claro', 'oscuro']) {
    test(`${scenario.role} ${scenario.path} ${theme}`, async ({ page }, info) => {
      test.skip(!['chromium', 'mobile'].includes(info.project.name));
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await installMocks(page, scenario.role as OperationalRole, theme);
      await page.goto(scenario.path);
      await expect(page).toHaveURL(new RegExp(`${scenario.path}$`));
      await expect(page.locator('html')).toHaveAttribute('data-admin-theme', theme);
      await expect(page.locator(scenario.ready).first()).toBeVisible();
      if (scenario.path === '/app') {
        await expect(page.getByRole('heading', { name: 'Hola, Café del Jardín', exact: true })).toBeVisible();
      } else if (scenario.role === 'mesero') {
        await expect(page.getByRole('heading', { level: 1, name: scenario.seed, exact: true })).toBeVisible();
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
      if (scenario.role === 'mesero') {
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
        await expect(page.getByRole('dialog', { name: /No se puede preparar/ })).toBeVisible();
        await capture('-rechazo');
      } else if (scenario.path === '/app/pedidos') {
        await page.getByRole('button', { name: 'Ver detalle', exact: true }).first().click();
        await expect(page.getByRole('dialog', { name: 'Pedido 241', exact: true })).toBeVisible();
        await capture('-detalle-pedido');
      }
    });
  }
}
