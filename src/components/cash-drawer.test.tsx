import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashDrawerReport } from '../types/api';
import { CashDrawer } from './cash-drawer';

type RegisterMovement = (
  token: string,
  sessionId: string,
  movement: { tipo: 'entrada' | 'salida'; monto: string; motivo: string },
  idempotencyKey: string,
) => Promise<{ efectivo_esperado: string | null }>;

const apiMock = vi.hoisted(() => ({
  cashDrawer: vi.fn<(token: string, sessionId: string) => Promise<CashDrawerReport>>(),
  registerCashDrawerMovement: vi.fn<RegisterMovement>(),
}));
vi.mock('../lib/api', () => ({ api: apiMock }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const report = (over: Partial<CashDrawerReport> = {}): CashDrawerReport => ({
  resumen: {
    fondo: '500.00',
    cobros_efectivo: '120.00',
    propinas: '0.00',
    recargas: '0.00',
    entradas: '0.00',
    salidas: '0.00',
    devoluciones_efectivo: '0.00',
    efectivo_esperado: '620.00',
  },
  movimientos: [
    { id: 'a', tipo: 'apertura', sale: false, monto: '500.00', motivo: null, registrado_por: null, pedido: null, devolucion_id: null, creado_en: '2026-11-16T15:00:00.000Z' },
    { id: 'c', tipo: 'cobro', sale: false, monto: '120.00', motivo: null, registrado_por: null, pedido: { id: 'p', folio: 7, espacio: null }, devolucion_id: null, creado_en: '2026-11-16T16:00:00.000Z' },
  ],
  ...over,
});

describe('movimientos del cajón', () => {
  beforeEach(() => {
    apiMock.cashDrawer.mockReset();
    apiMock.registerCashDrawerMovement.mockReset();
  });

  it('enseña cuánto debe haber, de dónde sale y los renglones del turno', async () => {
    apiMock.cashDrawer.mockResolvedValue(report());
    render(<CashDrawer token="t" sessionId="s1" open onOpenChange={() => {}} />, { wrapper });

    expect(await screen.findByText('$620.00')).toBeInTheDocument();
    expect(screen.getByText('Fondo $500.00 + efectivo $120.00')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Cobro en efectivo #7');
    expect(rows[1]).toHaveTextContent('Fondo al abrir');
    expect(apiMock.cashDrawer).toHaveBeenCalledWith('t', 's1');
  });

  it('cerrado no consulta nada', () => {
    render(<CashDrawer token="t" sessionId="s1" open={false} onOpenChange={() => {}} />, { wrapper });
    expect(apiMock.cashDrawer).not.toHaveBeenCalled();
  });

  it('sacar dinero pide monto y motivo, lo manda en el formato del servidor y avisa', async () => {
    apiMock.cashDrawer.mockResolvedValue(report());
    apiMock.registerCashDrawerMovement.mockResolvedValue({ efectivo_esperado: '470.00' });
    const user = userEvent.setup();
    render(<CashDrawer token="t" sessionId="s1" open onOpenChange={() => {}} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Sacar dinero' }));
    const submit = screen.getByRole('button', { name: 'Escribe el monto' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Cuánto sacas (MXN)'), '150');
    expect(screen.getByRole('button', { name: 'Escribe el motivo' })).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), '  compra de hielo ');
    await user.click(screen.getByRole('button', { name: 'Anotar salida de $150.00' }));

    await waitFor(() => expect(apiMock.registerCashDrawerMovement).toHaveBeenCalledTimes(1));
    const [token, session, body, key] = apiMock.registerCashDrawerMovement.mock.calls[0] ?? [];
    expect([token, session, body]).toEqual(['t', 's1', { tipo: 'salida', monto: '150.00', motivo: 'compra de hielo' }]);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Salida de $150.00 anotada.')).toBeInTheDocument();
  });

  it('un reintento del mismo movimiento repite la llave; si cambia el monto, lleva otra', async () => {
    apiMock.cashDrawer.mockResolvedValue(report());
    apiMock.registerCashDrawerMovement
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue({ efectivo_esperado: '700.00' });
    const user = userEvent.setup();
    render(<CashDrawer token="t" sessionId="s1" open onOpenChange={() => {}} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Meter dinero' }));
    await user.type(screen.getByLabelText('Cuánto metes (MXN)'), '80');
    await user.type(screen.getByLabelText('Motivo'), 'cambio del banco');
    await user.click(screen.getByRole('button', { name: 'Anotar entrada de $80.00' }));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anotar entrada de $80.00' }));
    await waitFor(() => expect(apiMock.registerCashDrawerMovement).toHaveBeenCalledTimes(2));

    const firstKey = apiMock.registerCashDrawerMovement.mock.calls[0]?.[3];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(apiMock.registerCashDrawerMovement.mock.calls[1]?.[3]).toBe(firstKey);

    await user.clear(screen.getByLabelText('Cuánto metes (MXN)'));
    await user.type(screen.getByLabelText('Cuánto metes (MXN)'), '90');
    await user.click(screen.getByRole('button', { name: 'Anotar entrada de $90.00' }));
    await waitFor(() => expect(apiMock.registerCashDrawerMovement).toHaveBeenCalledTimes(3));
    const third = apiMock.registerCashDrawerMovement.mock.calls[2];
    expect(third?.[2]).toEqual({ tipo: 'entrada', monto: '90.00', motivo: 'cambio del banco' });
    expect(third?.[3]).not.toBe(firstKey);
    expect(await screen.findByText('Entrada de $90.00 anotada.')).toBeInTheDocument();
  });

  it('un monto inválido avisa y no deja anotar', async () => {
    apiMock.cashDrawer.mockResolvedValue(report());
    const user = userEvent.setup();
    render(<CashDrawer token="t" sessionId="s1" open onOpenChange={() => {}} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: 'Sacar dinero' }));
    await user.type(screen.getByLabelText('Cuánto sacas (MXN)'), '0');
    expect(screen.getByText('Un monto mayor a cero, con hasta dos decimales.')).toBeInTheDocument();
    expect(apiMock.registerCashDrawerMovement).not.toHaveBeenCalled();
  });
});
