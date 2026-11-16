import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { periodRange, addLocalDays } from '../lib/inventory-period';
import { InventoryAssistant, InventoryHistory, InventoryReportCard } from './inventory-insights';

const apiMock = vi.hoisted(() => ({ inventoryMovements: vi.fn(), inventoryReport: vi.fn(), inventoryAssistant: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('periodos del inventario', () => {
  it('van del inicio del primer día al final del último', () => {
    const { desde, hasta } = periodRange('2026-11-10', '2026-11-16');
    expect(new Date(desde).getDate()).toBe(10);
    expect(new Date(desde).getHours()).toBe(0);
    expect(new Date(hasta).getDate()).toBe(16);
    expect(new Date(hasta).getHours()).toBe(23);
    expect(addLocalDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});

describe('Inventario › historial, reporte y asistente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('el historial enseña cada movimiento con su signo y filtra por insumo', async () => {
    const user = userEvent.setup();
    apiMock.inventoryMovements.mockResolvedValue([
      { id: 'm1', insumo_id: 61, insumo: 'Aceite vegetal', unidad: 'ml', tipo: 'merma', cantidad: -10, existencia_resultante: 6000, existencia_esperada: null, nota: 'se tiró', folio: null, registrado_por: 'Kao Admin', creado_en: '2026-11-16T20:59:17Z' },
      { id: 'm2', insumo_id: 61, insumo: 'Aceite vegetal', unidad: 'ml', tipo: 'venta', cantidad: -30, existencia_resultante: 6010, existencia_esperada: null, nota: null, folio: 12, registrado_por: null, creado_en: '2026-11-16T20:00:00Z' },
    ]);
    render(<InventoryHistory token="t" scope="s" supplies={[{ id: 61, nombre: 'Aceite vegetal', unidad: 'ml' }]} />, { wrapper });

    expect(await screen.findByText('Merma · Aceite vegetal')).toBeInTheDocument();
    expect(screen.getByText('−10 ml')).toBeInTheDocument();
    expect(screen.getByText(/Pedido #12/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Insumo'), '61');
    await waitFor(() => expect(apiMock.inventoryMovements).toHaveBeenLastCalledWith('t', expect.objectContaining({ insumoId: 61 })));
  });

  it('el reporte suma costos y enseña solo los insumos que tuvieron algo', async () => {
    apiMock.inventoryReport.mockResolvedValue({
      desde: '', hasta: '',
      insumos: [
        { id: 1, nombre: 'Aguacate', unidad: 'kg', inicial: 4, entradas: 2, vendido: 1.5, mermas: 0.5, diferencias: -0.25, final: 3.75, bajo_minimo: false, costo_vendido: 75, costo_mermas: 25, costo_diferencias: -12.5 },
        { id: 2, nombre: 'Vacío', unidad: 'kg', inicial: 0, entradas: 0, vendido: 0, mermas: 0, diferencias: 0, final: 0, bajo_minimo: false, costo_vendido: 0, costo_mermas: 0, costo_diferencias: 0 },
      ],
      totales: { costo_vendido: 75, costo_mermas: 25, costo_diferencias: -12.5, compras_monto: 100 },
    });
    render(<InventoryReportCard token="t" scope="s" />, { wrapper });

    const row = (await screen.findByRole('rowheader', { name: 'Aguacate' })).closest('tr')!;
    expect(within(row).getByText('+2 kg')).toBeInTheDocument();
    expect(within(row).getByText('−0.25 kg')).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'Vacío' })).not.toBeInTheDocument();
    expect(screen.getByText('−$12.50 MXN')).toBeInTheDocument();
    expect(screen.getByText('$100.00 MXN')).toBeInTheDocument();
  });

  it('el asistente manda toda la plática y ofrece las preguntas que sugiere', async () => {
    const user = userEvent.setup();
    apiMock.inventoryAssistant
      .mockResolvedValueOnce({ mensaje: 'Lo primero que se acaba es el aceite.', opciones: ['¿Cuánto tengo de papa?'], quedan_mensajes: 28 })
      .mockResolvedValueOnce({ mensaje: 'Tienes 3 kg de papa.', opciones: [], quedan_mensajes: 0 });
    render(<InventoryAssistant token="t" />, { wrapper });

    await user.click(screen.getByRole('button', { name: '¿Qué se me acaba primero?' }));
    expect(await screen.findByText('Lo primero que se acaba es el aceite.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '¿Cuánto tengo de papa?' }));
    expect(await screen.findByText('Tienes 3 kg de papa.')).toBeInTheDocument();
    expect(apiMock.inventoryAssistant).toHaveBeenLastCalledWith('t', [
      { rol: 'personal', texto: '¿Qué se me acaba primero?' },
      { rol: 'asistente', texto: 'Lo primero que se acaba es el aceite.' },
      { rol: 'personal', texto: '¿Cuánto tengo de papa?' },
    ]);
    expect(screen.getByText(/Se acabaron los mensajes/)).toBeInTheDocument();
  });
});
