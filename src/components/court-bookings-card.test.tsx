import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourtBookingsCard } from './court-bookings-card';

const apiMock = vi.hoisted(() => ({
  listStaffBookings: vi.fn(),
  cancelCounterRental: vi.fn(),
  payCounterRental: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 't', context: { establecimiento_id: 'est-1', rol: 'cajero' } } }),
}));

const base = {
  espacio: { id: 7, nombre: 'Cancha 1' },
  cliente: { nombre: 'Ana' },
  inicio: '2026-10-11T19:00:00-06:00',
  fin: '2026-10-11T20:30:00-06:00',
  monto: '300.00',
  expira_en: '2026-10-11T18:30:00-06:00',
  version: 1,
};

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CourtBookingsCard />
    </QueryClientProvider>,
  );
}

describe('CourtBookingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.cancelCounterRental.mockResolvedValue(undefined);
  });

  it('cancela una reserva por pagar tras confirmar y no ofrece cancelar las pagadas', async () => {
    apiMock.listStaffBookings.mockResolvedValue([
      { ...base, id: 'b1', estado: 'pendiente_pago' },
      { ...base, id: 'b2', estado: 'confirmada', expira_en: null, cliente: { nombre: 'Luis' } },
    ]);
    renderCard();
    expect(await screen.findByText('Por pagar en efectivo')).toBeInTheDocument();
    expect(screen.getByText('Pagada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Liberar cancha/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /Liberar cancha/ }));
    expect(await screen.findByText(/reserva de Ana en Cancha 1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar reserva' }));
    await waitFor(() => expect(apiMock.cancelCounterRental).toHaveBeenCalledWith('t', 'b1'));
  });
});
