import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventarioPage } from './inventario-page';

const apiMock = vi.hoisted(() => ({ inventorySupplies: vi.fn(), inventoryProducts: vi.fn(), inventoryRecipe: vi.fn(), saveInventoryRecipe: vi.fn(), setInventoryKitchenPermission: vi.fn() }));
const session = vi.hoisted(() => ({ rol: 'admin' }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../lib/api-error', () => ({ errorMessage: () => 'Error' }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: { token: 'tenant-token', context: { rol: session.rol } } }) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><InventarioPage /></QueryClientProvider>);
}

describe('InventarioPage', () => {
  beforeEach(() => { vi.clearAllMocks(); session.rol = 'admin'; });

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

  it('el admin prende el permiso de Cocina con PATCH /inventario/permisos', async () => {
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [], permisos: { puede_editar: true, cocina_edita: false } });
    apiMock.inventoryProducts.mockResolvedValue({ productos: [] });
    apiMock.setInventoryKitchenPermission.mockResolvedValue({ cocina_edita: true });
    const user = userEvent.setup();
    renderPage();
    const toggle = await screen.findByRole('checkbox', { name: 'Cocina puede editar el inventario' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(apiMock.setInventoryKitchenPermission).toHaveBeenCalledWith('tenant-token', true);
    await waitFor(() => expect(apiMock.inventorySupplies).toHaveBeenCalledTimes(2));
  });

  it('Cocina sin permiso ve la receta pero no puede editarla ni cambiar el permiso', async () => {
    session.rol = 'cocina';
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [{ id: 1, nombre: 'Harina', existencia: 10, unidad: 'kg' }], permisos: { puede_editar: false, cocina_edita: false } });
    apiMock.inventoryProducts.mockResolvedValue({ productos: [{ id: 2, nombre: 'Pan' }] });
    apiMock.inventoryRecipe.mockResolvedValue({ lineas: [{ insumo_id: 1, cantidad: 1 }] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: 'Pan' });
    await user.selectOptions(screen.getByLabelText('Producto'), '2');
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.getByText(/el administrador tiene que darle permiso a Cocina/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('Cocina con permiso del admin edita y guarda la receta', async () => {
    session.rol = 'cocina';
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [{ id: 1, nombre: 'Harina', existencia: 10, unidad: 'kg' }], permisos: { puede_editar: true, cocina_edita: true } });
    apiMock.inventoryProducts.mockResolvedValue({ productos: [{ id: 2, nombre: 'Pan' }] });
    apiMock.inventoryRecipe.mockResolvedValue({ lineas: [{ insumo_id: 1, cantidad: 1 }] });
    apiMock.saveInventoryRecipe.mockResolvedValue({ lineas: [{ insumo_id: 1, cantidad: 1 }] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: 'Pan' });
    await user.selectOptions(screen.getByLabelText('Producto'), '2');
    await user.click(await screen.findByRole('button', { name: 'Guardar receta' }));
    expect(apiMock.saveInventoryRecipe).toHaveBeenCalledWith('tenant-token', '2', [{ insumo_id: 1, cantidad: 1 }]);
    expect(await screen.findByText('Receta guardada.')).toBeInTheDocument();
  });

  it('con un backend sin permisos, Cocina queda en solo lectura', async () => {
    session.rol = 'cocina';
    apiMock.inventorySupplies.mockResolvedValue({ insumos: [{ id: 1, nombre: 'Harina', existencia: 10, unidad: 'kg' }] });
    apiMock.inventoryProducts.mockResolvedValue({ productos: [{ id: 2, nombre: 'Pan' }] });
    apiMock.inventoryRecipe.mockResolvedValue({ lineas: [{ insumo_id: 1, cantidad: 1 }] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('option', { name: 'Pan' });
    await user.selectOptions(screen.getByLabelText('Producto'), '2');
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
  });
});
