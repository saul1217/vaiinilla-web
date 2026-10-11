import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationsPage } from './invitations-page';

const apiMock = vi.hoisted(() => ({
  listInvitations: vi.fn(),
  listStaffMemberships: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  updateStaffMembership: vi.fn(),
  deactivateStaffMembership: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } },
  }),
}));

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('modal Invitar personal', () => {
  beforeEach(() => {
    apiMock.listInvitations.mockReset().mockResolvedValue({ invitations: [], cursor: null });
    apiMock.listStaffMemberships.mockReset().mockResolvedValue([]);
    apiMock.createInvitation.mockReset().mockResolvedValue({});
  });

  async function openModal(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /Nueva invitación/ }));
    return screen.findByLabelText('Correo de la persona');
  }

  it('Escape descarta lo escrito al reabrir', async () => {
    const user = userEvent.setup();
    render(<InvitationsPage />, { wrapper: TestProvider });
    await user.type(await openModal(user), 'persona@ejemplo.com');
    await user.keyboard('{Escape}');
    expect(await openModal(user)).toHaveValue('');
  });

  it('Cancelar descarta lo escrito al reabrir, igual que Escape', async () => {
    const user = userEvent.setup();
    render(<InvitationsPage />, { wrapper: TestProvider });
    await user.type(await openModal(user), 'persona@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await openModal(user)).toHaveValue('');
  });

  it('el envío de la invitación sigue funcionando', async () => {
    const user = userEvent.setup();
    render(<InvitationsPage />, { wrapper: TestProvider });
    await user.type(await openModal(user), 'persona@ejemplo.com');
    await user.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await vi.waitFor(() =>
      expect(apiMock.createInvitation).toHaveBeenCalledWith('tenant-token', { email: 'persona@ejemplo.com', rol: 'cajero' }),
    );
  });
});
