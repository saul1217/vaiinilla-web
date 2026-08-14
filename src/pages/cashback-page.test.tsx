import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CashbackRuleInput } from '../types/api';
import { CashbackPage } from './cashback-page';

const apiMock = vi.hoisted(() => ({
  cashbackRule: vi.fn(),
  configureCashback: vi.fn(),
  tenantAnalytics: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'tenant-token',
      context: { establecimiento_id: 'establecimiento-1', rol: 'admin' },
      access: { establecimiento: { nombre: 'Caffenio Centro' } },
    },
  }),
}));

const rule = {
  id: '3d196e4d-9082-4b5d-aa7a-65f0e21ac654',
  nombre: 'Regla principal',
  porcentaje: '5.00',
  hora_inicio: null,
  hora_fin: null,
  dias_activos: null,
  vigencia_inicio: null,
  vigencia_fin: null,
  activa: true,
  creado_en: '2026-08-13T12:00:00Z',
  actualizado_en: '2026-08-13T12:00:00Z',
};

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('configuracion de cashback', () => {
  beforeEach(() => {
    apiMock.cashbackRule.mockReset().mockResolvedValue(rule);
    apiMock.configureCashback
      .mockReset()
      .mockImplementation((_token: string, input: CashbackRuleInput) =>
        Promise.resolve({
          ...rule,
          ...input,
          actualizado_en: '2026-08-13T13:00:00Z',
        }),
      );
    apiMock.tenantAnalytics.mockReset().mockResolvedValue({
      periodo: { desde: '2026-07-15', hasta: '2026-08-13' },
      resumen: {
        ventas_totales: '500.00',
        pedidos: 10,
        ticket_promedio: '50.00',
        productos_vendidos: 10,
        recargas: '200.00',
        compras_saldo: '80.00',
        cashback_otorgado: '5.00',
        cancelaciones_wallet: '20.00',
        pedidos_cancelados: 1,
        comisiones: '2.40',
      },
      ventas_por_dia: [],
      metodos_pago: [],
      pedidos_por_estado: [],
      productos: [],
      wallet: {
        movimientos: [
          { tipo: 'recarga_efectivo', monto: '200.00', operaciones: 2 },
          { tipo: 'compra', monto: '80.00', operaciones: 1 },
        ],
        conciliacion: { wallets_revisadas: 3, alertas: 0 },
      },
      calculado_en: '2026-08-13T13:00:00Z',
    });
  });

  it('muestra agregados seguros y confirma antes de guardar', async () => {
    const user = userEvent.setup();
    render(<CashbackPage />, { wrapper: TestProvider });

    expect(await screen.findByDisplayValue('5.00')).toBeVisible();
    expect(await screen.findByText('Sin diferencias detectadas')).toBeVisible();
    expect(screen.getByText('3 wallets comparadas contra su ledger completo.')).toBeVisible();
    expect(screen.getAllByText('Recargas en efectivo')).toHaveLength(2);

    const percentage = screen.getByLabelText('Porcentaje');
    await user.clear(percentage);
    await user.type(percentage, '7.5');
    await user.click(screen.getByRole('button', { name: 'Revisar cambio' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('5.00% → 7.50%')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar y guardar' }));

    await waitFor(() =>
      expect(apiMock.configureCashback).toHaveBeenCalledWith(
        'tenant-token',
        expect.objectContaining({ porcentaje: '7.50', activa: true }),
      ),
    );
    expect(await screen.findByText(/la regla qued/i)).toBeVisible();
  });

  it('impide enviar un horario incompleto', async () => {
    const user = userEvent.setup();
    render(<CashbackPage />, { wrapper: TestProvider });

    await screen.findByDisplayValue('5.00');
    await user.type(screen.getByLabelText('Hora inicial'), '16:00');
    await user.click(screen.getByRole('button', { name: 'Revisar cambio' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/hora inicial como la final/i);
    expect(apiMock.configureCashback).not.toHaveBeenCalled();
  });
});
