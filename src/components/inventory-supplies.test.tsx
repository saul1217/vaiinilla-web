import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryOverview } from '../types/api';
import { InventorySupplies } from './inventory-supplies';

const apiMock = vi.hoisted(() => ({
  inventoryOverview: vi.fn(),
  registerInventoryMovement: vi.fn(),
  registerInventoryCount: vi.fn(),
  createInventorySupply: vi.fn(),
  updateInventorySupply: vi.fn(),
  supplyProducts: vi.fn(),
  saveSupplyProducts: vi.fn(),
}));
vi.mock('../lib/api', () => ({ api: apiMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const overview: InventoryOverview = {
  insumos: [
    { id: 55, nombre: 'Aguacate', unidad: 'kg', existencia: 4, minimo: 1, bajo_minimo: false, activo: true, valor: 200, costo_unitario: 50, productos_que_lo_usan: 2 },
    { id: 61, nombre: 'Aceite vegetal', unidad: 'ml', existencia: 500, minimo: 1000, bajo_minimo: true, activo: true, valor: 30, productos_que_lo_usan: 0 },
  ],
  permisos: { puede_editar: true, cocina_edita: false },
};
const products = [{ id: 1, nombre: 'Guacamole' }, { id: 2, nombre: 'Tacos' }, { id: 3, nombre: 'Torta' }];

function renderSupplies(canEdit = true, showCosts = true) {
  return render(
    <InventorySupplies token="t" overviewKey={['inventory', 'x']} overview={{ data: overview, isLoading: false }} canEdit={canEdit} showCosts={showCosts} products={products} />,
    { wrapper },
  );
}

describe('Insumos del inventario', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enseña existencias, mínimos, el bajo mínimo y el valor de lo que está en uso', () => {
    renderSupplies();
    const figures = screen.getByText('Bajo mínimo', { selector: 'dt' }).parentElement!;
    expect(figures).toHaveTextContent('1');
    expect(screen.getByText('$230.00 MXN')).toBeInTheDocument();
    expect(screen.getByText('4 kg')).toBeInTheDocument();
    expect(screen.getByText(/Bajo mínimo · Lo usan 0/)).toBeInTheDocument();
  });

  it('registra una entrada con costo y reusa su UUID si se reintenta', async () => {
    const user = userEvent.setup();
    apiMock.registerInventoryMovement.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(undefined);
    renderSupplies();
    const row = screen.getByRole('heading', { name: 'Aguacate' }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Entrada' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Cuánto entró (kg)'), '2,5');
    await user.type(within(dialog).getByLabelText('Costo por kg (opcional)'), '48');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Sin conexión')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Entrada registrada.')).toBeInTheDocument();
    const [first, second] = apiMock.registerInventoryMovement.mock.calls as [string, { id: string }][];
    expect(first![1]).toMatchObject({ insumo_id: 55, tipo: 'entrada', cantidad: 2.5, costo_unitario: 48 });
    expect(second![1].id).toBe(first![1].id);
  });

  it('el ajuste acepta restar y la merma pide más de cero', async () => {
    const user = userEvent.setup();
    apiMock.registerInventoryMovement.mockResolvedValue(undefined);
    renderSupplies();
    const row = screen.getByRole('heading', { name: 'Aceite vegetal' }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Merma' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Cuánto se perdió (ml)'), '-5');
    expect(within(dialog).getByText('Escribe una cantidad mayor que cero.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await user.click(within(row).getByRole('button', { name: 'Ajustar' }));
    dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Cuánto sumar o restar/), '-5');
    await user.type(within(dialog).getByLabelText('Nota (opcional)'), 'captura');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(apiMock.registerInventoryMovement).toHaveBeenCalledWith('t', expect.objectContaining({ insumo_id: 61, tipo: 'ajuste', cantidad: -5, nota: 'captura' })));
  });

  it('sin permiso de editar solo deja merma, contar y ver quién lo usa', () => {
    renderSupplies(false, false);
    expect(screen.queryByRole('button', { name: 'Agregar insumo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Merma' })).toHaveLength(2);
    expect(screen.queryByText('Valor')).not.toBeInTheDocument();
  });

  it('el conteo de fin de turno manda solo lo contado y dice cuántos no cuadraron', async () => {
    const user = userEvent.setup();
    apiMock.registerInventoryCount.mockResolvedValue({ con_diferencia: 1 });
    renderSupplies();
    await user.click(screen.getByRole('button', { name: 'Contar (fin de turno)' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Conteo de Aguacate (kg)'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar conteo (1)' }));

    expect(await screen.findByText('Conteo guardado: 1 insumo no cuadró.')).toBeInTheDocument();
    expect(apiMock.registerInventoryCount).toHaveBeenCalledWith('t', [expect.objectContaining({ insumo_id: 55, cantidad: 3 })], '');
  });

  it('da de alta un insumo con existencia inicial y proveedor', async () => {
    const user = userEvent.setup();
    apiMock.createInventorySupply.mockResolvedValue({ id: 70, nombre: 'Limón', unidad: 'kg' });
    renderSupplies();
    await user.click(screen.getByRole('button', { name: 'Agregar insumo' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Limón');
    await user.selectOptions(within(dialog).getByLabelText('Unidad'), 'kg');
    await user.type(within(dialog).getByLabelText('Mínimo (kg)'), '2');
    await user.type(within(dialog).getByLabelText('Hay ahorita (kg)'), '5');
    await user.type(within(dialog).getByLabelText('Nombre del proveedor (opcional)'), 'Don Pepe');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(apiMock.createInventorySupply).toHaveBeenCalledWith('t', expect.objectContaining({ nombre: 'Limón', unidad: 'kg', minimo: 2, existencia_inicial: 5, proveedor_nombre: 'Don Pepe' }), expect.any(String)));
    expect(await screen.findByText('Limón se agregó al inventario.')).toBeInTheDocument();
  });

  it('«Lo usan» enseña los productos, deja cambiar cantidades, agregar y quitar, y guarda la lista completa', async () => {
    const user = userEvent.setup();
    apiMock.supplyProducts.mockResolvedValue([
      { producto_id: 1, nombre: 'Guacamole', categoria_id: 9, categoria_nombre: 'Entradas', cantidad: 0.25 },
      { producto_id: 2, nombre: 'Tacos', categoria_id: 9, categoria_nombre: 'Entradas', cantidad: 0.1 },
    ]);
    apiMock.saveSupplyProducts.mockResolvedValue([]);
    renderSupplies();
    const row = screen.getByRole('heading', { name: 'Aguacate' }).closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Lo usan' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Quitar Tacos' }));
    await user.selectOptions(within(dialog).getByLabelText('Agregar producto'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Agregar' }));
    const torta = within(dialog).getByLabelText('Cuánto gasta Torta (kg)');
    await user.clear(torta);
    await user.type(torta, '0.2');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(apiMock.saveSupplyProducts).toHaveBeenCalledWith('t', 55, [{ producto_id: 1, cantidad: 0.25 }, { producto_id: 3, cantidad: 0.2 }]));
  });
});
