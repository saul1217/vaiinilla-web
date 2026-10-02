import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unpaidAgeLabel } from '../lib/unpaid';
import { UnpaidAccountsCard } from './unpaid-accounts-card';

const apiMock = vi.hoisted(() => ({ unpaidAccounts: vi.fn(), releaseSpace: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } } }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('cuentas sin cobrar', () => {
  beforeEach(() => apiMock.unpaidAccounts.mockReset());

  it('no ocupa lugar si no hay nada pendiente', async () => {
    apiMock.unpaidAccounts.mockResolvedValue({ cuentas: [], total: '0.00', abandonadas: 0 });
    const { container } = render(<UnpaidAccountsCard />, { wrapper: Wrapper });
    await vi.waitFor(() => expect(apiMock.unpaidAccounts).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lista las cuentas y marca a quien se fue sin pagar', async () => {
    apiMock.unpaidAccounts.mockResolvedValue({
      total: '190.50',
      abandonadas: 1,
      cuentas: [
        {
          espacio: { id: 7, nombre: 'Cancha 1', tipo: 'cancha' },
          pedidos: 2,
          total: '150.50',
          desde: '2026-09-30T20:00:00Z',
          horas: 5,
          clientes: ['Ana', 'Luis'],
          abandonada: true,
        },
        {
          espacio: { id: 3, nombre: 'Mesa 1', tipo: 'mesa' },
          pedidos: 1,
          total: '40.00',
          desde: '2026-09-30T20:00:00Z',
          horas: 0,
          clientes: [],
          abandonada: false,
        },
      ],
    });
    render(<UnpaidAccountsCard />, { wrapper: Wrapper });
    expect(await screen.findByText('Cancha 1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('$190.50 MXN en 2 cuentas · 1 se fue sin pagar');
    expect(screen.getByText('Ya se liberó: se fue sin pagar')).toBeInTheDocument();
    expect(screen.getByText(/Ana, Luis/)).toBeInTheDocument();
    expect(screen.getByText('hace 5 h')).toBeInTheDocument();
    expect(screen.getByText('hace menos de 1 h')).toBeInTheDocument();
    expect(screen.getAllByText('Ya se liberó: se fue sin pagar')).toHaveLength(1);
  });

  it('admin cierra sin cobrar solo una mesa todavía abierta, forzando el cierre', async () => {
    apiMock.unpaidAccounts.mockResolvedValue({
      total: '40.00',
      abandonadas: 1,
      cuentas: [
        { espacio: { id: 3, nombre: 'Mesa 1', tipo: 'mesa' }, pedidos: 1, total: '40.00', desde: '2026-09-30T20:00:00Z', horas: 0, clientes: [], abandonada: false },
        { espacio: { id: 7, nombre: 'Cancha 1', tipo: 'cancha' }, pedidos: 1, total: '10.00', desde: '2026-09-30T20:00:00Z', horas: 1, clientes: [], abandonada: true },
      ],
    });
    apiMock.releaseSpace.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UnpaidAccountsCard />, { wrapper: Wrapper });
    // La cancha ya se liberó: no tiene botón. Solo la mesa abierta lo tiene.
    const buttons = await screen.findAllByRole('button', { name: 'Cerrar sin cobrar' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar sin cobrar' }));
    await vi.waitFor(() => expect(apiMock.releaseSpace).toHaveBeenCalledWith('tenant-token', 3, undefined, true));
  });

  it('la edad en horas', () => {
    expect(unpaidAgeLabel(0)).toBe('hace menos de 1 h');
    expect(unpaidAgeLabel(26)).toBe('hace 26 h');
  });
});
