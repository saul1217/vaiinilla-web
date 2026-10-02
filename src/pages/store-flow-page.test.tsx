import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreFlowPage } from './store-flow-page';

const apiMock = vi.hoisted(() => ({ businessSettings: vi.fn(), saveBusinessSettings: vi.fn(), cardPayments: vi.fn().mockResolvedValue(null) }));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } } }),
}));

const cafeteria = {
  tipo: 'cafeteria',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  gracia_liberacion_min: 5,
  franjas_pedido: [],
  tipos_disponibles: ['cafeteria'],
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('Flujo de mi tienda', () => {
  beforeEach(() => {
    apiMock.businessSettings.mockReset().mockResolvedValue(cafeteria);
    apiMock.saveBusinessSettings.mockReset().mockResolvedValue({ ...cafeteria, tipo: 'padel' });
  });

  it('muestra el flujo actual y no hay nada que guardar sin cambios', async () => {
    render(<StoreFlowPage />, { wrapper: Wrapper });
    expect(await screen.findByText('Paga con saldo, tarjeta o efectivo al pedir')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cafetería escolar/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('una plantilla cambia el flujo de abajo y se guarda al pulsar Guardar flujo', async () => {
    const user = userEvent.setup();
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Prepara en cuanto llega el pedido, sin esperar el cobro')).toBeInTheDocument();
    expect(screen.getByText('La cancha se libera al quedar saldada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', {
        tipo: 'padel',
        entrega_requiere_qr: false,
        permite_pago_al_final: true,
        gracia_liberacion_min: 5,
        franjas_pedido: [],
      }),
    );
  });

  it('al guardar muestra de inmediato lo guardado, sin pasar por los datos viejos', async () => {
    const user = userEvent.setup();
    const padel = { ...cafeteria, tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true };
    apiMock.saveBusinessSettings.mockResolvedValue(padel);
    // La recarga posterior tarda: mientras, la pantalla debe mostrar ya lo guardado.
    apiMock.businessSettings.mockResolvedValueOnce(cafeteria).mockReturnValue(new Promise(() => {}));
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Club de pádel/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/es un flujo personalizado/)).not.toBeInTheDocument();
  });

  it('personalizar: pagar al final y entregar sin QR da un flujo personalizado', async () => {
    const user = userEvent.setup();
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('radio', { name: /Al final, con cuenta abierta/ }));
    await user.click(screen.getByRole('radio', { name: /Sin escanear nada/ }));
    expect(screen.getByText(/es un flujo personalizado/)).toBeInTheDocument();
    expect(screen.getByText('Lo entrega sin escanear nada')).toBeInTheDocument();
  });

  it('lo que aún no existe sale como Próximamente', async () => {
    const user = userEvent.setup();
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('button', { name: /Comedor de empresa/ }));
    expect(screen.getByText('Descuenta de la nómina')).toBeInTheDocument();
    expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
  });

  it('elegir solo ciertas horas muestra las franjas, las valida y las guarda ordenadas', async () => {
    const user = userEvent.setup();
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await user.click(await screen.findByRole('radio', { name: /Solo en ciertas horas/ }));
    expect(screen.getByText('Recibe pedidos solo de 12:00 a 15:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar otra franja' }));
    expect(screen.getByText('Recibe pedidos solo de 12:00 a 15:00 y 18:00 a 20:00')).toBeInTheDocument();
    // Una franja al revés bloquea el guardado.
    const to = screen.getByLabelText('Franja 2: hasta');
    fireEvent.change(to, { target: { value: '17:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('después de la inicial');
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
    fireEvent.change(to, { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith(
        'tenant-token',
        expect.objectContaining({
          franjas_pedido: [
            { desde: '12:00', hasta: '15:00' },
            { desde: '18:00', hasta: '20:00' },
          ],
        }),
      ),
    );
  });

  it('volver a "a cualquier hora" quita las franjas', async () => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockResolvedValue({ ...cafeteria, franjas_pedido: [{ desde: '12:00', hasta: '15:00' }] });
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await screen.findByLabelText('Franja 1: desde');
    await user.click(screen.getByRole('radio', { name: /A cualquier hora/ }));
    expect(screen.queryByLabelText('Franja 1: desde')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith(
        'tenant-token',
        expect.objectContaining({ franjas_pedido: [] }),
      ),
    );
  });

  it('una gracia fuera de 0 a 60 no se puede guardar', async () => {
    const user = userEvent.setup();
    render(<StoreFlowPage />, { wrapper: Wrapper });
    const grace = await screen.findByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '90');
    expect(screen.getByText(/entero de 0 a 60/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
  });

  it('no ofrece hoteles', async () => {
    render(<StoreFlowPage />, { wrapper: Wrapper });
    await screen.findByText('Cine, estadio o evento');
    expect(screen.queryByText(/hotel/i)).not.toBeInTheDocument();
  });

  it('muestra el error si el negocio tiene un tipo desconocido', async () => {
    apiMock.businessSettings.mockResolvedValue({ ...cafeteria, tipo: 'otro' });
    render(<StoreFlowPage />, { wrapper: Wrapper });
    expect(await screen.findByText(/tipo que esta pantalla no conoce/)).toBeInTheDocument();
  });
});
