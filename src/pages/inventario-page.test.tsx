import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import { canEditInventory, inventoryKeys } from '../lib/inventory-access';
import { InventarioPage } from './inventario-page';

const apiMock = vi.hoisted(() => ({ inventoryOverview: vi.fn(), inventoryProducts: vi.fn(), productRecipe: vi.fn(), saveProductRecipe: vi.fn(), setInventoryKitchenPermission: vi.fn() }));
const session = vi.hoisted(() => ({ rol: 'admin', establecimiento_id: 'tienda-a', membresia_id: 'm-1', usuario_id: 'u-1', token: 'tenant-token' }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: session.token, context: { rol: session.rol, establecimiento_id: session.establecimiento_id, membresia_id: session.membresia_id, usuario_id: session.usuario_id } } }),
}));

const harina = { id: 1, nombre: 'Harina', existencia: 10, unidad: 'kg' };
const azucar = { id: 3, nombre: 'Azúcar', existencia: 5, unidad: 'kg' };
const forbidden = () => new VaiinillaApiError(403, { code: 'KITCHEN_EDIT_DISABLED', message: 'Tu administrador no ha dado permiso a Cocina para editar el inventario.' });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = () => <QueryClientProvider client={client}><InventarioPage /></QueryClientProvider>;
  const utils = render(ui());
  return { client, rerender: () => utils.rerender(ui()) };
}

async function openRecipe(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: 'Pan' });
  await user.selectOptions(screen.getByLabelText('Producto'), '2');
}

describe('canEditInventory', () => {
  it('Cocina edita solo con puede_editar y cocina_edita explícitos', () => {
    expect(canEditInventory('cocina', { puede_editar: true, cocina_edita: true })).toBe(true);
    expect(canEditInventory('cocina', { puede_editar: true, cocina_edita: false })).toBe(false);
    expect(canEditInventory('cocina', { puede_editar: false, cocina_edita: true })).toBe(false);
    expect(canEditInventory('cocina', undefined)).toBe(false);
    expect(canEditInventory('admin', undefined)).toBe(true);
    expect(canEditInventory('admin', { puede_editar: false, cocina_edita: false })).toBe(false);
  });

  it('las claves de caché separan negocio, membresía, identidad y rol', () => {
    const base = { storeId: 't', membershipId: 'm', userId: 'u', role: 'admin' };
    const keys = [base, { ...base, storeId: 't2' }, { ...base, membershipId: 'm2' }, { ...base, userId: 'u2' }, { ...base, role: 'cocina' }].map(s => JSON.stringify(inventoryKeys(s).overview));
    expect(new Set(keys).size).toBe(5);
  });
});

describe('InventarioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(session, { rol: 'admin', establecimiento_id: 'tienda-a', membresia_id: 'm-1', usuario_id: 'u-1', token: 'tenant-token' });
    apiMock.inventoryProducts.mockResolvedValue([{ id: 2, nombre: 'Pan' }]);
    apiMock.productRecipe.mockResolvedValue([{ insumo_id: 1, cantidad: 1, opcion_id: null }]);
  });

  it('si falla la consulta de insumos muestra un error con Reintentar en vez de ocultar la página', async () => {
    apiMock.inventoryOverview.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue({ insumos: [harina], permisos: { puede_editar: true, cocina_edita: false } });
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText(/No se pudo cargar el inventario: Sin conexión/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventario y recetas' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Harina' })).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo cargar/)).not.toBeInTheDocument();
  });

  it('si la consulta falla, no deja editar aunque el rol sea admin', async () => {
    apiMock.inventoryOverview.mockRejectedValue(new Error('Sin conexión'));
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    expect(await screen.findByRole('listitem')).toHaveTextContent('· 1');
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
  });

  it('el admin prende el permiso de Cocina con PATCH /inventario/permisos y vuelve a pedir el permiso', async () => {
    apiMock.inventoryOverview.mockResolvedValue({ insumos: [], permisos: { puede_editar: true, cocina_edita: false } });
    apiMock.setInventoryKitchenPermission.mockResolvedValue({ cocina_edita: true });
    const user = userEvent.setup();
    setup();
    const toggle = await screen.findByRole('checkbox', { name: 'Cocina puede editar el inventario' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(apiMock.setInventoryKitchenPermission).toHaveBeenCalledWith('tenant-token', true);
    await waitFor(() => expect(apiMock.inventoryOverview).toHaveBeenCalledTimes(2));
  });

  it('Cocina sin permiso ve la receta pero no puede editarla ni cambiar el permiso', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview.mockResolvedValue({ insumos: [harina], permisos: { puede_editar: false, cocina_edita: false } });
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.getByText(/el administrador tiene que darle permiso a Cocina/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('Cocina con permiso del admin edita y guarda la receta', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview.mockResolvedValue({ insumos: [harina], permisos: { puede_editar: true, cocina_edita: true } });
    apiMock.saveProductRecipe.mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    await user.click(await screen.findByRole('button', { name: 'Guardar receta' }));
    expect(apiMock.saveProductRecipe).toHaveBeenCalledWith('tenant-token', 2, [{ insumo_id: 1, cantidad: 1, opcion_id: null }]);
    expect(await screen.findByText('Receta guardada.')).toBeInTheDocument();
  });

  it('con un backend sin permisos (antes de la 205), Cocina queda en solo lectura', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview.mockResolvedValue({ insumos: [harina] });
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
  });

  it('un 403 al guardar conserva el borrador, refresca el permiso y bloquea la edición', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview
      .mockResolvedValueOnce({ insumos: [harina, azucar], permisos: { puede_editar: true, cocina_edita: true } })
      .mockResolvedValue({ insumos: [harina, azucar], permisos: { puede_editar: false, cocina_edita: false } });
    apiMock.saveProductRecipe.mockRejectedValue(forbidden());
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    await user.selectOptions(await screen.findByLabelText('Insumo 1'), '3');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(await screen.findByText(/Ya no tienes permiso para editar el inventario. Tu borrador sigue aquí/)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.inventoryOverview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Azúcar · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Inventario y recetas' })).toBeInTheDocument();
  });

  it('si el guardado falla por otra causa, bloquea hasta refrescar el permiso y deja reintentar con el mismo borrador', async () => {
    apiMock.inventoryOverview.mockResolvedValue({ insumos: [harina, azucar], permisos: { puede_editar: true, cocina_edita: false } });
    apiMock.saveProductRecipe.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue(undefined);
    const user = userEvent.setup();
    setup();
    await openRecipe(user);
    await user.selectOptions(await screen.findByLabelText('Insumo 1'), '3');
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));
    expect(await screen.findByText(/No se guardó la receta: Sin conexión. Tu borrador sigue aquí/)).toBeInTheDocument();
    await waitFor(() => expect(apiMock.inventoryOverview).toHaveBeenCalledTimes(2));
    await user.click(await screen.findByRole('button', { name: 'Guardar receta' }));
    expect(apiMock.saveProductRecipe).toHaveBeenLastCalledWith('tenant-token', 2, [{ insumo_id: 3, cantidad: 1, opcion_id: null }]);
  });

  it('si revocan el permiso a mitad de la edición, el borrador se queda en pantalla y la edición se bloquea', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview
      .mockResolvedValueOnce({ insumos: [harina, azucar], permisos: { puede_editar: true, cocina_edita: true } })
      .mockResolvedValue({ insumos: [harina, azucar], permisos: { puede_editar: false, cocina_edita: false } });
    const user = userEvent.setup();
    const { client } = setup();
    await openRecipe(user);
    await user.selectOptions(await screen.findByLabelText('Insumo 1'), '3');
    // Simula el refresco del permiso (al volver a la pestaña o por otra pantalla).
    await client.invalidateQueries({ queryKey: ['inventory'] });
    expect(await screen.findByText(/Tu permiso para editar el inventario cambió. Tu borrador sigue aquí/)).toBeInTheDocument();
    expect(screen.getByText('Azúcar · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(apiMock.saveProductRecipe).not.toHaveBeenCalled();
  });

  it('al cambiar de admin a cocina no reutiliza puede_editar del admin ni su borrador', async () => {
    apiMock.inventoryOverview.mockImplementation(() => Promise.resolve(session.rol === 'admin'
      ? { insumos: [harina, azucar], permisos: { puede_editar: true, cocina_edita: false } }
      : { insumos: [harina, azucar], permisos: { puede_editar: false, cocina_edita: false } }));
    const user = userEvent.setup();
    const { rerender } = setup();
    await openRecipe(user);
    await user.selectOptions(await screen.findByLabelText('Insumo 1'), '3');
    Object.assign(session, { rol: 'cocina', membresia_id: 'm-2', token: 'cocina-token' });
    rerender();
    await waitFor(() => expect(apiMock.inventoryOverview).toHaveBeenLastCalledWith('cocina-token'));
    await openRecipe(user);
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.queryByText('Azúcar · 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('al cambiar de tienda pide de nuevo el permiso y no reutiliza el de la tienda anterior', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview.mockImplementation(() => Promise.resolve(session.establecimiento_id === 'tienda-a'
      ? { insumos: [harina], permisos: { puede_editar: true, cocina_edita: true } }
      : { insumos: [harina], permisos: { puede_editar: false, cocina_edita: false } }));
    const user = userEvent.setup();
    const { rerender } = setup();
    await openRecipe(user);
    expect(await screen.findByRole('button', { name: 'Guardar receta' })).toBeInTheDocument();
    Object.assign(session, { establecimiento_id: 'tienda-b', membresia_id: 'm-3', token: 'tienda-b-token' });
    rerender();
    await waitFor(() => expect(apiMock.inventoryOverview).toHaveBeenLastCalledWith('tienda-b-token'));
    await openRecipe(user);
    expect(await screen.findByText('Harina · 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar receta' })).not.toBeInTheDocument();
    expect(screen.getByText(/el administrador tiene que darle permiso a Cocina/)).toBeInTheDocument();
  });

  it('una respuesta 403 al consultar insumos muestra el error sin ocultar la página', async () => {
    session.rol = 'cocina';
    apiMock.inventoryOverview.mockRejectedValue(new VaiinillaApiError(403, { code: 'FORBIDDEN_ROLE', message: 'Rol sin permiso para esta operación.' }));
    setup();
    expect(await screen.findByText('No tienes permiso para ver esta parte del inventario.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
