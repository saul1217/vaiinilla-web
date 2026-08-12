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
  uploadProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
    apiMock.uploadProductImage.mockReset().mockResolvedValue({
      ...product,
      imagen_url: 'https://cdn.test/producto.png',
    });
    apiMock.deleteProductImage.mockReset().mockResolvedValue({ ...product, imagen_url: null });
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
    const image = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'latte.png',
      { type: 'image/png' },
    );
    await user.upload(within(dialog).getByLabelText('Elegir imagen'), image);

    expect(within(dialog).getByText('$26.00 MXN')).toBeVisible();
    expect(within(dialog).getByText('latte.png')).toBeVisible();
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
    expect(payload).not.toHaveProperty('imagen_url');
    await waitFor(() =>
      expect(apiMock.uploadProductImage).toHaveBeenCalledWith('tenant-token', 101, image),
    );
  });

  it('reintenta la imagen sin duplicar un producto ya creado', async () => {
    apiMock.uploadProductImage
      .mockRejectedValueOnce(new Error('storage temporalmente no disponible'))
      .mockResolvedValueOnce({ ...product, imagen_url: 'https://cdn.test/latte.png' });
    apiMock.updateProduct.mockResolvedValue(product);
    const user = userEvent.setup();
    render(<MenuPage />, { wrapper: TestProvider });

    await screen.findByRole('heading', { name: 'Chocolate frío' });
    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre *'), 'Latte');
    await user.type(within(dialog).getByPlaceholderText('20.00'), '20.00');
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'latte.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(within(dialog).getByLabelText('Elegir imagen'), image);
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(await within(dialog).findByText(/el cambio de imagen no terminó/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => expect(apiMock.uploadProductImage).toHaveBeenCalledTimes(2));
    expect(apiMock.createProduct).toHaveBeenCalledTimes(1);
    expect(apiMock.updateProduct).toHaveBeenCalledWith(
      'tenant-token',
      101,
      expect.objectContaining({ nombre: 'Latte' }),
    );
  });
});
