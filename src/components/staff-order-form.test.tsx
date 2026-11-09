import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogResponse, OrderDetail, SpaceAvailability, StaffOrderInput } from '../types/api';
import { StaffOrderForm } from './staff-order-form';
import type { OfflineStaffOrdersApi } from '../hooks/use-offline-staff-orders';
import { VaiinillaApiError } from '../lib/api-error';
import {
  OfflineStaffQueue,
  browserDurableStore,
  draftStorageKey,
  pendingOf,
  type DurableStore,
  type OfflineStaffScope,
} from '../lib/offline-staff-orders';

const apiMock = vi.hoisted(() => ({
  catalog: vi.fn(),
  spaceAvailability: vi.fn(),
  operationalSettings: vi.fn(),
  createStaffOrder: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));

const CATALOGO: CatalogResponse = {
  categorias: [{ id: 10, nombre: 'Tacos', orden: 1 }],
  productos: [
    {
      id: 1,
      categoria_id: 10,
      estacion_preparacion: 'cocina',
      nombre: 'Taco al pastor',
      descripcion: null,
      ingredientes: null,
      alergenos: null,
      tiempo_estimado_min: 5,
      precio_mostrador: '20.00',
      precio_digital: '20.00',
      disponible: true,
      imagen_url: null,
      grupos_opcion: [
        {
          id: 100,
          nombre: 'Tortilla',
          min_selecciones: 1,
          max_selecciones: 1,
          opciones: [
            { id: 101, nombre: 'Maíz', precio_extra: '0.00' },
            { id: 102, nombre: 'Harina', precio_extra: '5.50' },
          ],
        },
      ],
    },
  ],
};

const ESPACIOS: SpaceAvailability[] = [
  {
    espacio: { id: 2, nombre: 'Mesa 2', tipo: 'mesa' },
    estado: 'libre',
    saldada: true,
    inicio: null,
    fin_previsto: null,
    precio_hora: null,
    proxima_reserva: null,
  },
];

const PEDIDO_CREADO = {
  id: 'pedido-1',
  folio: 7,
  estado: 'por_cobrar',
  version: 1,
} as OrderDetail;

type LlamadaCrear = [token: string, body: StaffOrderInput, key: string];

function llamadas(): LlamadaCrear[] {
  return apiMock.createStaffOrder.mock.calls as LlamadaCrear[];
}

function renderForm(rol: string, onCreated = vi.fn(), initialSpaceId?: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<StaffOrderForm token="token" rol={rol} onCreated={onCreated} initialSpaceId={initialSpaceId} />, { wrapper });
  return { onCreated };
}

describe('StaffOrderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.catalog.mockResolvedValue(CATALOGO);
    apiMock.spaceAvailability.mockResolvedValue(ESPACIOS);
    apiMock.operationalSettings.mockResolvedValue({ permite_pago_al_final: false, entrega_requiere_qr: true });
    apiMock.createStaffOrder.mockResolvedValue(PEDIDO_CREADO);
  });

  it('buscar y limpiar conserva cliente, cantidad y pago diferido sin enviar', async () => {
    const user = userEvent.setup();
    renderForm('mesero', vi.fn(), 2);
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText(/Nombre del cliente/), 'Ana');
    const deferred = screen.getByLabelText('Pagar al final, con la cuenta de la mesa');
    await user.click(deferred);
    await user.click(screen.getByRole('button', { name: 'Agregar uno' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar en el menú' }), 'no existe');
    expect(screen.getByText('Sin coincidencias.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByRole('group', { name: 'Cantidad de Taco al pastor' })).toHaveTextContent('2');
    expect(screen.getByLabelText(/Nombre del cliente/)).toHaveValue('Ana');
    expect(deferred).toBeChecked();
    expect(apiMock.createStaffOrder).not.toHaveBeenCalled();
  });

  it('para llevar: envía el pedido en efectivo con la opción obligatoria ya elegida', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    const [token, body, key] = llamadas()[0] ?? [];
    expect(token).toBe('token');
    expect(body).toEqual({
      metodo_pago: 'efectivo',
      destino: 'para_llevar',
      espacio_id: null,
      items: [{ producto_id: 1, cantidad: 1, opcion_ids: [101] }],
    });
    expect(typeof key).toBe('string');
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(PEDIDO_CREADO));
  });

  it('sin productos no envía y explica por qué', async () => {
    const user = userEvent.setup();
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'Enviar pedido' }));

    expect(screen.getByText('Agrega al menos un producto.')).toBeInTheDocument();
    expect(apiMock.createStaffOrder).not.toHaveBeenCalled();
  });

  it('en mesa a pagar al final: lleva el espacio y la bandera, sin cobro al instante', async () => {
    const user = userEvent.setup();
    apiMock.operationalSettings.mockResolvedValue({ permite_pago_al_final: true, entrega_requiere_qr: false });
    renderForm('mesero');

    await user.click(screen.getByRole('button', { name: 'En mesa' }));
    await user.click(await screen.findByRole('button', { name: /Mesa 2/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByLabelText(/Pagar al final/)).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({
      destino: 'en_espacio',
      espacio_id: 2,
    });
    expect(llamadas()[0]?.[1]).not.toHaveProperty('pago_diferido');
    expect(llamadas()[0]?.[1]).not.toHaveProperty('cobrar_ahora');
  });

  it('con pagar al final desactivado en el negocio, la mesa no lo marca sola', async () => {
    const user = userEvent.setup();
    renderForm('mesero');

    await user.click(screen.getByRole('button', { name: 'En mesa' }));
    await user.click(await screen.findByRole('button', { name: /Mesa 2/ }));
    expect(screen.getByLabelText(/Pagar al final/)).not.toBeChecked();
  });

  it('aplica pagar al final cuando llegan los settings si ya eligió mesa', async () => {
    let resolveSettings!: (value: unknown) => void;
    apiMock.operationalSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    const user = userEvent.setup();
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'En mesa' }));
    await user.click(screen.getByRole('button', { name: /Mesa 2/ }));
    expect(screen.getByLabelText(/Pagar al final/)).not.toBeChecked();

    resolveSettings({ permite_pago_al_final: true, entrega_requiere_qr: false });
    await waitFor(() => expect(screen.getByLabelText(/Pagar al final/)).toBeChecked());
  });

  it('no vuelve a marcar pagar al final si el mesero lo desmarcó', async () => {
    let resolveSettings!: (value: unknown) => void;
    apiMock.operationalSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );
    const user = userEvent.setup();
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'En mesa' }));
    const checkbox = screen.getByLabelText(/Pagar al final/);
    await user.click(checkbox);
    await user.click(checkbox);
    resolveSettings({ permite_pago_al_final: true, entrega_requiere_qr: false });
    await waitFor(() => expect(apiMock.operationalSettings).toHaveBeenCalled());
    expect(checkbox).not.toBeChecked();
  });

  it('casilla intacta omite pago_diferido y al desmarcarla envía false explícito', async () => {
    const user = userEvent.setup();
    apiMock.operationalSettings.mockResolvedValue({ permite_pago_al_final: true, entrega_requiere_qr: false });
    renderForm('mesero');

    await user.click(screen.getByRole('button', { name: 'En mesa' }));
    await user.click(await screen.findByRole('button', { name: /Mesa 2/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByLabelText(/Pagar al final/)).toBeChecked();
    await user.click(screen.getByLabelText(/Pagar al final/));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({
      destino: 'en_espacio',
      espacio_id: 2,
      pago_diferido: false,
    });
  });

  it.each([true, false])('configuración 403: al tocar la casilla envía pago_diferido=%s', async (pagoDiferido) => {
    const user = userEvent.setup();
    apiMock.operationalSettings.mockRejectedValue(new Error('HTTP 403'));
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'En mesa' }));
    await user.click(await screen.findByRole('button', { name: /Mesa 2/ }));
    const checkbox = screen.getByLabelText('Pagar al final, con la cuenta de la mesa');
    await user.click(checkbox);
    if (!pagoDiferido) await user.click(checkbox);
    expect(checkbox).toBeEnabled();
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({
      destino: 'en_espacio',
      espacio_id: 2,
      pago_diferido: pagoDiferido,
    });
  });

  it('iniciado desde una mesa precarga destino y mesa en el pedido', async () => {
    const user = userEvent.setup();
    apiMock.operationalSettings.mockResolvedValue({ permite_pago_al_final: true, entrega_requiere_qr: false });
    renderForm('mesero', vi.fn(), 2);

    expect(await screen.findByRole('button', { name: 'En mesa' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('button', { name: /Mesa 2/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({ destino: 'en_espacio', espacio_id: 2 });
  });

  it('solo caja ve "Cobrar ahora", y con monto recibido lo manda normalizado', async () => {
    const user = userEvent.setup();
    renderForm('cajero');

    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByLabelText('Cobrar ahora en efectivo'));
    await user.type(screen.getByLabelText(/Efectivo recibido/), '50');
    await user.click(screen.getByRole('button', { name: 'Enviar y cobrar' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({
      cobrar_ahora: true,
      monto_recibido: '50.00',
    });
  });

  it('un mesero no tiene la opción de cobrar ahora', async () => {
    renderForm('mesero');

    await screen.findByRole('button', { name: 'Agregar' });
    expect(screen.queryByLabelText('Cobrar ahora en efectivo')).not.toBeInTheDocument();
  });

  it.each([403, 500])('configuración %i muestra error, permite reintentar y omite pago_diferido', async (status) => {
    const user = userEvent.setup();
    apiMock.operationalSettings
      .mockRejectedValueOnce(new Error(`HTTP ${status}`))
      .mockResolvedValueOnce({ permite_pago_al_final: true, entrega_requiere_qr: false });
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText(/No se pudo cargar la configuración operativa/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).not.toHaveProperty('pago_diferido');
    expect(JSON.stringify(llamadas()[0]?.[1])).not.toContain('"pago_diferido":false');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(apiMock.operationalSettings).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/No se pudo cargar la configuración operativa/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'En mesa' }));
    expect(screen.getByLabelText(/Pagar al final/)).toBeChecked();
  });

  it('reintenta con la misma llave si el pedido no cambió, y con otra si cambió', async () => {
    const user = userEvent.setup();
    apiMock.createStaffOrder
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue(PEDIDO_CREADO);
    renderForm('mesero');

    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));

    // Reintento tal cual: mismo cuerpo, misma llave (el servidor responde el primero).
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(2));
    const [primera, reintento] = llamadas().map((call) => call[2]);
    expect(reintento).toBe(primera);

    // Cambió el nombre: es otro pedido, con llave nueva (reusarla respondería 409).
    await user.type(screen.getByLabelText(/Nombre del cliente/), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(3));
    expect(llamadas()[2]?.[2]).not.toBe(primera);
  });
});

const SCOPE: OfflineStaffScope = { env: 'api.test', establecimientoId: 'est-1', usuarioId: 'user-1' };

function offlineApi(store: DurableStore = browserDurableStore(window.localStorage)): OfflineStaffOrdersApi & { queue: OfflineStaffQueue } {
  const queue = new OfflineStaffQueue(store, SCOPE);
  return {
    queue,
    enabled: true,
    scope: SCOPE,
    store,
    pending: [],
    problems: [],
    sending: false,
    storageError: null,
    enqueue: (entry) => queue.enqueue(entry),
    retry: vi.fn(),
    resolve: vi.fn(),
    flushNow: vi.fn(),
  };
}

function renderOffline(offline: OfflineStaffOrdersApi, extra: { onQueued?: ReturnType<typeof vi.fn>; rol?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const onCreated = vi.fn();
  const onQueued = extra.onQueued ?? vi.fn();
  const view = render(
    <StaffOrderForm token="token" rol={extra.rol ?? 'cajero'} onCreated={onCreated} queryScope="api.test|est-1|user-1" offline={offline} cashSessionId="11111111-1111-4111-8111-111111111111" onQueued={onQueued} />,
    { wrapper },
  );
  return { ...view, onCreated, onQueued };
}

const sinRed = () => new VaiinillaApiError(502, { code: 'HTTP_ERROR', message: 'El servidor no devolvió una respuesta válida.' });

describe('StaffOrderForm sin internet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    apiMock.catalog.mockResolvedValue(CATALOGO);
    apiMock.spaceAvailability.mockResolvedValue(ESPACIOS);
    apiMock.operationalSettings.mockResolvedValue({ permite_pago_al_final: false, entrega_requiere_qr: true });
  });

  it('recarga a media petición: recupera el borrador y reenvía con la misma llave', async () => {
    const user = userEvent.setup();
    apiMock.createStaffOrder.mockReturnValueOnce(new Promise(() => undefined)).mockResolvedValue(PEDIDO_CREADO);
    const first = renderOffline(offlineApi());
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText(/Nombre del cliente/), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    const llaveOriginal = llamadas()[0]?.[2];
    expect(window.localStorage.getItem(draftStorageKey(SCOPE))).toContain(llaveOriginal);
    expect(window.localStorage.getItem(draftStorageKey(SCOPE))).not.toContain('token');

    // La página se recarga: el componente se desmonta y vuelve a montarse con lo guardado.
    first.unmount();
    const second = renderOffline(offlineApi());
    expect(await screen.findByText(/Recuperamos el pedido que estabas tomando/)).toBeVisible();
    expect(screen.getByLabelText(/Nombre del cliente/)).toHaveValue('Ana');
    await screen.findByRole('group', { name: 'Cantidad de Taco al pastor' });
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(2));
    expect(llamadas()[1]?.[2]).toBe(llaveOriginal);
    await waitFor(() => expect(second.onCreated).toHaveBeenCalled());
    expect(window.localStorage.getItem(draftStorageKey(SCOPE))).toBeNull();
  });

  it('sin red: guarda el cobro en efectivo en la cola con la llave del intento y la caja abierta', async () => {
    const user = userEvent.setup();
    apiMock.createStaffOrder.mockRejectedValue(sinRed());
    const offline = offlineApi();
    const { onQueued, onCreated } = renderOffline(offline);
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByLabelText('Cobrar ahora en efectivo'));
    await user.click(screen.getByRole('button', { name: 'Enviar y cobrar' }));
    await waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    const [order] = pendingOf(offline.queue.snapshot());
    expect(order?.idempotencyKey).toBe(llamadas()[0]?.[2]);
    expect(order?.collectedCash).toBe(true);
    expect(order?.body.sin_conexion?.sesion_caja_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(onCreated).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(draftStorageKey(SCOPE))).toBeNull();
  });

  it('navegador sin red comprobada: lo guarda de una vez sin intentar mandarlo', async () => {
    const user = userEvent.setup();
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const offline = offlineApi();
    const { onQueued } = renderOffline(offline, { rol: 'mesero' });
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() => expect(onQueued).toHaveBeenCalledTimes(1));
    expect(apiMock.createStaffOrder).not.toHaveBeenCalled();
    expect(pendingOf(offline.queue.snapshot())[0]?.localFolio).toMatch(/^M\d{1,3}-001$/);
    onLine.mockRestore();
  });

  it('si el almacenamiento falla, avisa, no da el pedido por tomado y conserva el borrador', async () => {
    const user = userEvent.setup();
    apiMock.createStaffOrder.mockRejectedValue(sinRed());
    const store = browserDurableStore({
      getItem: () => null,
      setItem: () => { throw new DOMException('QuotaExceededError'); },
      removeItem: () => undefined,
    } as unknown as Storage);
    const { onQueued } = renderOffline(offlineApi(store));
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    expect(await screen.findByText(/no deja guardar pedidos sin conexión/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText(/No se guardó el pedido sin conexión/)).toBeVisible();
    expect(onQueued).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Cantidad de Taco al pastor' })).toBeVisible();
  });

  it('un error que no es de red no se guarda en la cola: se muestra con Reintentar', async () => {
    const user = userEvent.setup();
    apiMock.createStaffOrder
      .mockRejectedValueOnce(new VaiinillaApiError(422, { code: 'VALIDATION_ERROR', message: 'x' }))
      .mockResolvedValue(PEDIDO_CREADO);
    const offline = offlineApi();
    const { onQueued, onCreated } = renderOffline(offline, { rol: 'mesero' });
    await user.click(await screen.findByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByText('Revisa los datos capturados e inténtalo nuevamente.')).toBeVisible();
    expect(onQueued).not.toHaveBeenCalled();
    expect(offline.queue.snapshot().orders).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(llamadas()[1]?.[2]).toBe(llamadas()[0]?.[2]);
  });
});

