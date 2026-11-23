import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import type { TenantCardPayments } from '../types/api';
import { CardPaymentsCard } from './card-payments-card';

const apiMock = vi.hoisted(() => ({
  cardPayments: vi.fn(),
  startCardPaymentsOnboarding: vi.fn(),
  setCardPayments: vi.fn(),
  setCardCommissionPassThrough: vi.fn(),
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

  describe('comisión de la tarjeta', () => {
    it('empieza apagada: el negocio paga la comisión y el cliente paga el precio de mostrador', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true });
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /yo, el negocio/i })).toBeChecked();
      expect(screen.getByRole('radio', { name: /^el cliente/i })).not.toBeChecked();
    });

    it('el dueño la pasa al cliente y queda guardado', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true });
      apiMock.setCardCommissionPassThrough.mockResolvedValue({ ...ready, stripe_enabled: true, pasar_comision_al_cliente: true });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="restaurante" />, { wrapper });

      await user.click(await screen.findByRole('radio', { name: /^el cliente/i }));

      expect(apiMock.setCardCommissionPassThrough).toHaveBeenCalledWith('t', true);
      await waitFor(() => expect(screen.getByRole('radio', { name: /^el cliente/i })).toBeChecked());
    });

    it('un negocio que ya la pasaba la ve prendida y puede apagarla', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, pasar_comision_al_cliente: true });
      apiMock.setCardCommissionPassThrough.mockResolvedValue({ ...ready, stripe_enabled: true, pasar_comision_al_cliente: false });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });

      expect(await screen.findByRole('radio', { name: /^el cliente/i })).toBeChecked();
      await user.click(screen.getByRole('radio', { name: /yo, el negocio/i }));
      expect(apiMock.setCardCommissionPassThrough).toHaveBeenCalledWith('t', false);
    });

    describe('cafetería con tarjeta aprobada (F3)', () => {
      const aprobada = { estado: 'aprobada' as const, vigente: true, origen: 'plataforma' as const, aprobada_en: '2026-11-18T10:00:00Z', revocada_en: null };
      const cafeteriaAprobada: TenantCardPayments = { ...ready, stripe_enabled: true, aprobacion_plataforma: aprobada };

      it('no deja pasar la comisión al cliente y explica por qué', async () => {
        apiMock.cardPayments.mockResolvedValue(cafeteriaAprobada);
        const user = userEvent.setup();
        render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

        const cliente = await screen.findByRole('radio', { name: /^el cliente/i });
        expect(cliente).toBeDisabled();
        expect(screen.getByRole('radio', { name: /yo, el negocio/i })).toBeChecked();
        expect(screen.getByText(/la comisión ya va incluida en los precios del menú/i)).toBeVisible();
        await user.click(cliente);
        expect(apiMock.setCardCommissionPassThrough).not.toHaveBeenCalled();
      });

      it('si ya la tenía prendida, la puede apagar y después queda bloqueada', async () => {
        apiMock.cardPayments.mockResolvedValue({ ...cafeteriaAprobada, pasar_comision_al_cliente: true });
        apiMock.setCardCommissionPassThrough.mockResolvedValue({ ...cafeteriaAprobada, pasar_comision_al_cliente: false });
        const user = userEvent.setup();
        render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

        expect(await screen.findByRole('radio', { name: /^el cliente/i })).toBeChecked();
        expect(screen.getByText(/apaga esta opción para no cobrarla dos veces/i)).toBeVisible();
        await user.click(screen.getByRole('radio', { name: /yo, el negocio/i }));
        expect(apiMock.setCardCommissionPassThrough).toHaveBeenCalledWith('t', false);
        await waitFor(() => expect(screen.getByRole('radio', { name: /^el cliente/i })).toBeDisabled());
      });

      it.each([
        ['una cafetería sin aprobación', 'cafeteria', { estado: null, vigente: false }],
        ['una cafetería con la aprobación revocada', 'cafeteria', { estado: 'revocada' as const, vigente: false }],
        ['un restaurante', 'restaurante', aprobada],
        ['un backend que todavía no manda la aprobación', 'cafeteria', undefined],
      ])('%s puede elegir quién paga la comisión', async (_caso, tipo, aprobacion) => {
        apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: aprobacion });
        render(<CardPaymentsCard token="t" scopeId="e1" businessType={tipo} />, { wrapper });

        expect(await screen.findByRole('radio', { name: /^el cliente/i })).toBeEnabled();
        expect(screen.queryByText(/la comisión ya va incluida en los precios del menú/i)).not.toBeInTheDocument();
      });

      it('si el backend responde 422 al prenderla, muestra el motivo sin romper la página y vuelve a consultar', async () => {
        apiMock.cardPayments.mockResolvedValueOnce({ ...ready, stripe_enabled: true }).mockResolvedValue(cafeteriaAprobada);
        apiMock.setCardCommissionPassThrough.mockRejectedValue(
          new VaiinillaApiError(422, {
            code: 'STRIPE_COMMISSION_CAFETERIA_LOCKED',
            message: 'Una cafetería con tarjeta aprobada no puede pasar la comisión al cliente.',
          }),
        );
        const user = userEvent.setup();
        render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

        await user.click(await screen.findByRole('radio', { name: /^el cliente/i }));

        expect(await screen.findByText(/no puede pasar la comisión al cliente/i)).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Pagos con tarjeta' })).toBeVisible();
        await waitFor(() => expect(screen.getByRole('radio', { name: /^el cliente/i })).toBeDisabled());
        expect(screen.getByRole('radio', { name: /yo, el negocio/i })).toBeChecked();
      });
    });

    it('sin cuenta lista no se ofrece: no hay comisión que pasar', async () => {
      apiMock.cardPayments.mockResolvedValue(null);
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
      await screen.findByRole('button', { name: /conectar mi cuenta de stripe/i });
      expect(screen.queryByRole('radio', { name: /el cliente/i })).not.toBeInTheDocument();
    });
  });

  describe('aprobación de la plataforma (cafeterías)', () => {
    const pendiente = { estado: null, vigente: false, origen: null, aprobada_en: null, revocada_en: null };
    const aprobada = { estado: 'aprobada' as const, vigente: true, origen: 'plataforma' as const, aprobada_en: '2026-11-18T10:00:00Z', revocada_en: null };
    const revocada = { estado: 'revocada' as const, vigente: false, origen: 'plataforma' as const, aprobada_en: null, revocada_en: '2026-11-18T11:00:00Z' };

    it('pendiente: muestra el estado y bloquea activar la tarjeta', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: pendiente });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      expect(await screen.findByText(/pendiente de aprobación$/i)).toBeVisible();
      expect(screen.getByText(/la plataforma debe aprobar los pagos con tarjeta de esta cafetería/i)).toBeVisible();
      const activar = screen.getByRole('radio', { name: /sí, aceptar tarjeta/i });
      expect(activar).toBeDisabled();
      expect(activar).toHaveTextContent(/pendiente de aprobación de la plataforma/i);
      await user.click(activar);
      expect(apiMock.setCardPayments).not.toHaveBeenCalled();
    });

    it('aprobada: el dueño puede activar la tarjeta', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: aprobada });
      apiMock.setCardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: aprobada });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      expect(await screen.findByText(/^aprobada$/i)).toBeVisible();
      await user.click(screen.getByRole('radio', { name: /sí, aceptar tarjeta/i }));
      expect(apiMock.setCardPayments).toHaveBeenCalledWith('t', true);
      expect(await screen.findByText(/activos/i)).toBeVisible();
    });

    it('revocada: lo dice y no deja volver a activar', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: revocada });
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      expect(await screen.findByText(/^revocada$/i)).toBeVisible();
      expect(screen.getByText(/la plataforma revocó los pagos con tarjeta/i)).toBeVisible();
      expect(screen.getByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeDisabled();
    });

    it('sin aprobación pero con la tarjeta prendida, el dueño sí puede apagarla', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: revocada });
      apiMock.setCardPayments.mockResolvedValue({ ...ready, stripe_enabled: false, aprobacion_plataforma: revocada });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      await user.click(await screen.findByRole('radio', { name: /no, solo otros pagos/i }));
      expect(apiMock.setCardPayments).toHaveBeenCalledWith('t', false);
    });

    it('un 409 de aprobación al activar no presenta éxito y vuelve a consultar el estado', async () => {
      apiMock.cardPayments
        .mockResolvedValueOnce({ ...ready, aprobacion_plataforma: aprobada })
        .mockResolvedValue({ ...ready, aprobacion_plataforma: revocada });
      apiMock.setCardPayments.mockRejectedValue(
        new VaiinillaApiError(409, { code: 'STRIPE_PLATFORM_APPROVAL_REQUIRED', message: 'x' }),
      );
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      await user.click(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/todavía no aprueba los pagos con tarjeta/i);
      expect(screen.getByText(/apagados/i)).toBeVisible();
      expect(await screen.findByText(/^revocada$/i)).toBeVisible();
      expect(apiMock.cardPayments).toHaveBeenCalledTimes(2);
    });

    it('un 403 al consultar se muestra sin romper la página', async () => {
      apiMock.cardPayments.mockRejectedValue(new VaiinillaApiError(403, { code: 'CONTEXT_NOT_ALLOWED', message: 'x' }));
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });

      expect(await screen.findByRole('alert')).toHaveTextContent(/no tiene permiso/i);
      expect(screen.getByRole('heading', { name: /pagos con tarjeta/i })).toBeVisible();
    });

    it('en un restaurante no deja activar la tarjeta: solo cafeterías (back #268)', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: pendiente });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="restaurante" />, { wrapper });

      const activar = await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i });
      expect(activar).toBeDisabled();
      expect(activar).toHaveTextContent(/solo están disponibles en cafeterías/i);
      expect(screen.getByText(/no se pueden activar en este negocio/i)).toBeVisible();
      expect(screen.queryByText(/aprobación de la plataforma:/i)).not.toBeInTheDocument();
      await user.click(activar);
      expect(apiMock.setCardPayments).not.toHaveBeenCalled();
    });

    it('un restaurante con la tarjeta prendida de antes la puede apagar', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: pendiente });
      apiMock.setCardPayments.mockResolvedValue({ ...ready, stripe_enabled: false, aprobacion_plataforma: pendiente });
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="restaurante" />, { wrapper });

      expect(await screen.findByText(/puedes apagarlos, pero no volver a prenderlos/i)).toBeVisible();
      await user.click(screen.getByRole('radio', { name: /no, solo otros pagos/i }));
      expect(apiMock.setCardPayments).toHaveBeenCalledWith('t', false);
      await waitFor(() => expect(screen.getByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeDisabled());
    });

    it('un 409 STRIPE_APPROVAL_CAFETERIA_ONLY al activar se explica y vuelve a consultar', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: aprobada });
      apiMock.setCardPayments.mockRejectedValue(
        new VaiinillaApiError(409, { code: 'STRIPE_APPROVAL_CAFETERIA_ONLY', message: 'x' }),
      );
      const user = userEvent.setup();
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });

      await user.click(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/solo están disponibles en cafeterías/i);
      expect(screen.getByText(/apagados/i)).toBeVisible();
      await waitFor(() => expect(apiMock.cardPayments).toHaveBeenCalledTimes(2));
    });

    it('mientras no se sabe el tipo de negocio, sin aprobación vigente no deja activar', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: pendiente });
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });

      expect(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeDisabled();
      // El estado de aprobación solo se rotula cuando ya se sabe que es cafetería.
      expect(screen.queryByText(/aprobación de la plataforma:/i)).not.toBeInTheDocument();
    });

    it('al llegar el tipo restaurante, activar sigue bloqueado y la comisión se puede elegir', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, aprobacion_plataforma: pendiente });
      const { rerender } = render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeDisabled();

      rerender(<CardPaymentsCard token="t" scopeId="e1" businessType="restaurante" />);
      const activar = screen.getByRole('radio', { name: /sí, aceptar tarjeta/i });
      expect(activar).toBeDisabled();
      expect(activar).toHaveTextContent(/solo están disponibles en cafeterías/i);
      expect(screen.getByRole('radio', { name: /^el cliente/i })).toBeEnabled();
    });

    it('con un back anterior (sin aprobacion_plataforma) un restaurante activa como antes', async () => {
      apiMock.cardPayments.mockResolvedValue(ready);
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="restaurante" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeEnabled();
    });

    it('con un back anterior (sin aprobacion_plataforma) la cafetería puede activar como antes', async () => {
      apiMock.cardPayments.mockResolvedValue(ready);
      render(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /sí, aceptar tarjeta/i })).toBeEnabled();
    });
  });

  describe('comisión mientras no se conoce el tipo (F3, igual que #204)', () => {
    const aprobada = { estado: 'aprobada' as const, vigente: true, origen: 'plataforma' as const };

    it.each([
      ['sin aprobación', undefined],
      ['con aprobación vigente', aprobada],
    ])('%s, el candado de la comisión no se aplica hasta saber que es cafetería', async (_caso, aprobacion) => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: aprobacion });
      render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /^el cliente/i })).toBeEnabled();
      expect(screen.queryByText(/la comisión ya va incluida en los precios del menú/i)).not.toBeInTheDocument();
    });

    it('al llegar el tipo cafetería con aprobación vigente, el candado se pone', async () => {
      apiMock.cardPayments.mockResolvedValue({ ...ready, stripe_enabled: true, aprobacion_plataforma: aprobada });
      const { rerender } = render(<CardPaymentsCard token="t" scopeId="e1" />, { wrapper });
      expect(await screen.findByRole('radio', { name: /^el cliente/i })).toBeEnabled();

      rerender(<CardPaymentsCard token="t" scopeId="e1" businessType="cafeteria" />);
      expect(screen.getByRole('radio', { name: /^el cliente/i })).toBeDisabled();
    });
  });
});
