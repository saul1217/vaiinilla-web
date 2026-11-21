import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCashSummary } from './admin-cash-summary';

const apiMock = vi.hoisted(() => ({ cashDrawer: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const session = { id: 's1', fecha_operativa: '2026-11-16', monto_inicial: '500.00', monto_final: null, abierta_en: '2026-11-16T15:00:00Z', cerrada_en: null, cierre_automatico: false };

describe('Caja del dueño', () => {
  beforeEach(() => apiMock.cashDrawer.mockReset());

  it('cerrada: enseña cómo quedó el último cierre', () => {
    render(<AdminCashSummary token="t" active={null} lastClose={{ ...session, monto_final: '480.00', cerrada_en: '2026-11-15T23:00:00Z', efectivo_esperado: '500.00', diferencia: '-20.00', ventas_efectivo: '0.00' }} />, { wrapper });
    expect(screen.getByText(/Último cierre ·/)).toBeInTheDocument();
    expect(screen.getByText('Efectivo esperado').nextSibling).toHaveTextContent('$500.00 MXN');
    expect(screen.getByText('Efectivo contado').nextSibling).toHaveTextContent('$480.00 MXN');
    expect(apiMock.cashDrawer).not.toHaveBeenCalled();
  });

  it('cerrada sin cierres previos lo dice', () => {
    render(<AdminCashSummary token="t" active={null} lastClose={null} />, { wrapper });
    expect(screen.getByText('Cuando cierres la caja, aquí ves cómo quedó.')).toBeInTheDocument();
  });

  it('abierta: efectivo esperado, fondo, efectivo, tarjeta y solo los cobros en efectivo, del más nuevo', async () => {
    apiMock.cashDrawer.mockResolvedValue({
      resumen: { fondo: '500.00', cobros_efectivo: '85.00', propinas: '8.50', recargas: '1.00', entradas: '0.00', salidas: '0.00', devoluciones_efectivo: '0.00', efectivo_esperado: '594.50', cobros_tarjeta: '120.00' },
      movimientos: [
        { id: 'm1', tipo: 'cobro', sale: false, monto: '40.00', motivo: null, registrado_por: { nombre: 'Ana' }, pedido: { id: 'p1', folio: 7, espacio: null }, devolucion_id: null, creado_en: '2026-11-16T16:00:00Z' },
        { id: 'm2', tipo: 'propina', sale: false, monto: '8.50', motivo: null, registrado_por: null, pedido: null, devolucion_id: null, creado_en: '2026-11-16T16:10:00Z' },
        { id: 'm3', tipo: 'cobro', sale: false, monto: '45.00', motivo: null, registrado_por: null, pedido: { id: 'p2', folio: 9, espacio: null }, devolucion_id: null, creado_en: '2026-11-16T17:00:00Z' },
      ],
    });
    render(<AdminCashSummary token="t" active={session} lastClose={undefined} />, { wrapper });

    expect(await screen.findByText('$594.50 MXN')).toBeInTheDocument();
    expect(screen.getByText('+$85.00 MXN')).toBeInTheDocument();
    expect(screen.getByText('$120.00 MXN')).toBeInTheDocument();
    const folios = screen.getAllByText(/^#\d+$/).map((node) => node.textContent);
    expect(folios).toEqual(['#9', '#7']);
    expect(apiMock.cashDrawer).toHaveBeenCalledWith('t', 's1');
  });
});
