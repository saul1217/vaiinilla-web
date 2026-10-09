import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogResponse, OrderDetail, SpaceAvailability, StaffOrderInput } from '../types/api';
import { StaffOrderForm } from './staff-order-form';

const apiMock = vi.hoisted(() => ({
  catalog: vi.fn(),
  spaceAvailability: vi.fn(),
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

function renderForm(rol: string, onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<StaffOrderForm token="token" rol={rol} onCreated={onCreated} />, { wrapper });
  return { onCreated };
}

describe('StaffOrderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.catalog.mockResolvedValue(CATALOGO);
    apiMock.spaceAvailability.mockResolvedValue(ESPACIOS);
    apiMock.createStaffOrder.mockResolvedValue(PEDIDO_CREADO);
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
    renderForm('mesero');

    await user.click(screen.getByRole('button', { name: 'En mesa' }));
    await user.click(await screen.findByRole('button', { name: /Mesa 2/ }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByLabelText(/Pagar al final/));
    await user.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(apiMock.createStaffOrder).toHaveBeenCalledTimes(1));
    expect(llamadas()[0]?.[1]).toMatchObject({
      destino: 'en_espacio',
      espacio_id: 2,
      pago_diferido: true,
    });
    expect(llamadas()[0]?.[1]).not.toHaveProperty('cobrar_ahora');
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
