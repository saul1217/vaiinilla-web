import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPage } from './menu-page';

const apiMock = vi.hoisted(() => ({
  catalog: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  changeProductAvailability: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'tenant-token',
      context: { establecimiento_id: 'establecimiento-1', rol: 'admin' },
      access: { establecimiento: { nombre: 'Caffenio' } },
    },
  }),
}));

const product = {
  id: 101,
  categoria_id: 10,
  estacion_preparacion: 'caja' as const,
  nombre: 'Chocolate frío',
  descripcion: 'Bebida fría de chocolate.',
  ingredientes: null,
  alergenos: 'Leche',
  tiempo_estimado_min: 5,
  precio_mostrador: '20.00',
  precio_digital: '26.00',
  disponible: true,
  imagen_url: null,
  grupos_opcion: [],
};

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('administración del menú', () => {
  beforeEach(() => {
    apiMock.catalog.mockReset().mockResolvedValue({
      categorias: [{ id: 10, nombre: 'Bebidas', orden: 0 }],
      productos: [product],
    });
    apiMock.createProduct.mockReset().mockResolvedValue(product);
    apiMock.createCategory.mockReset();
    apiMock.updateCategory.mockReset();
    apiMock.updateProduct.mockReset();
    apiMock.changeProductAvailability.mockReset();
  });

  it('muestra el catálogo y crea sin enviar precio_digital', async () => {
    const user = userEvent.setup();
    render(<MenuPage />, { wrapper: TestProvider });

    expect(await screen.findByRole('heading', { name: 'Chocolate frío' })).toBeVisible();
    expect(screen.getByText('$26.00 MXN')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialog = screen.getByRole('dialog');
    const name = within(dialog).getByLabelText('Nombre *');
    const counterPrice = within(dialog).getByPlaceholderText('20.00');
    await user.type(name, 'Latte');
    await user.clear(counterPrice);
    await user.type(counterPrice, '20.00');

    expect(within(dialog).getByText('$26.00 MXN')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => expect(apiMock.createProduct).toHaveBeenCalledTimes(1));
    const payload = apiMock.createProduct.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      categoria_id: 10,
      nombre: 'Latte',
      precio_mostrador: '20.00',
      grupos_opcion: [],
    });
    expect(payload).not.toHaveProperty('precio_digital');
  });
});
