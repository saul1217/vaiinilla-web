import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantCardPayments } from '../types/api';
import { CardPaymentsCard } from './card-payments-card';

const apiMock = vi.hoisted(() => ({
  cardPayments: vi.fn(),
  startCardPaymentsOnboarding: vi.fn(),
  setCardPayments: vi.fn(),
}));
vi.mock('../lib/api', () => ({ api: apiMock }));

const ready: TenantCardPayments = {
  stripe_enabled: false,
  stripe_account_id: 'acct_1',
  charges_enabled: true,
  payouts_enabled: true,
  estado_onboarding: 'habilitada',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('pagos con tarjeta del negocio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin cuenta de Stripe: está apagado y ofrece conectarla en otra pestaña', async () => {
    apiMock.cardPayments.mockResolvedValue(null);
    apiMock.startCardPaymentsOnboarding.mockResolvedValue({ account_link_url: 'https://connect.stripe.com/x' });
    const tab = { location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const user = userEvent.setup();
    render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });

    const connect = await screen.findByRole('button', { name: /conectar mi cuenta de stripe/i });
    expect(screen.getByText(/apagados/i)).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await user.click(connect);
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.href).toBe('https://connect.stripe.com/x'));
  });

  it('cuenta en revisión: no deja activar, pide completar en Stripe', async () => {
    apiMock.cardPayments.mockResolvedValue({ ...ready, charges_enabled: false });
    render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
    expect(await screen.findByRole('button', { name: /completar en stripe/i })).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('cuenta lista: el dueño activa la tarjeta', async () => {
    apiMock.cardPayments.mockResolvedValue(ready);
    apiMock.setCardPayments.mockResolvedValue({ ...ready, stripe_enabled: true });
    const user = userEvent.setup();
    render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });

    await user.click(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i }));
    expect(apiMock.setCardPayments).toHaveBeenCalledWith('t', true);
    expect(await screen.findByText(/activos/i)).toBeVisible();
  });
});
