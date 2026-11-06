import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventarioPage } from './inventario-page';

const apiMock = vi.hoisted(() => ({ inventorySupplies: vi.fn(), inventoryProducts: vi.fn(), inventoryRecipe: vi.fn(), saveInventoryRecipe: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../lib/api-error', () => ({ errorMessage: () => 'Error' }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token' } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><InventarioPage /></QueryClientProvider>);
}

describe('InventarioPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('oculta la página si el backend no carga insumos', async () => {
    apiMock.inventorySupplies.mockRejectedValue(new Error('404'));
    apiMock.inventoryProducts.mockResolvedValue({ productos: [] });
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('oculta la página si el backend no carga productos', async () => {
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [] });
    apiMock.inventoryProducts.mockRejectedValue(new Error('404'));
    const { container } = renderPage();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('heading', { name: 'Inventario y recetas' })).not.toBeInTheDocument();
  });

  it('oculta la página cuando guardar una receta falla porque el endpoint no está disponible', async () => {
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [{ id: 1, nombre: 'Harina', existencia: 10, unidad: 'kg' }] });
    apiMock.inventoryProducts.mockResolvedValue({ productos: [{ id: 2, nombre: 'Pan' }] });
    apiMock.inventoryRecipe.mockResolvedValue({ lineas: [{ insumo_id: 1, cantidad: 1 }] });
    apiMock.saveInventoryRecipe.mockRejectedValue(new Error('404'));
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByRole('option', { name: 'Pan' });
    await user.selectOptions(screen.getByLabelText('Producto'), '2');
    await user.click(await screen.findByRole('button', { name: 'Guardar receta' }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
