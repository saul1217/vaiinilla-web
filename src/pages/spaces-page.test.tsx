import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpacesPage } from './spaces-page';

const apiMock = vi.hoisted(() => ({
  listManagedSpaces: vi.fn(),
  createSpace: vi.fn(),
  updateSpace: vi.fn(),
  rotateSpaceQr: vi.fn(),
  bookingSettings: vi.fn(),
  saveBookingSettings: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } },
  }),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,AAAA') } }));

const court = { id: 7, nombre: 'Cancha 1', tipo: 'cancha', activo: true, qr_url: 'https://vaiinilla.app/x/m/1', precio_hora: '300.00' };
const table = { id: 3, nombre: 'Mesa 1', tipo: 'mesa', activo: true, qr_url: 'https://vaiinilla.app/x/m/2', precio_hora: null };
const settings = { apertura: '07:00', cierre: '23:00', dias_adelanto: 14, zona_horaria: 'America/Chihuahua' };

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('reservas de canchas en el panel', () => {
  beforeEach(() => {
    apiMock.listManagedSpaces.mockReset().mockResolvedValue([court, table]);
    apiMock.updateSpace.mockReset().mockResolvedValue(court);
    apiMock.bookingSettings.mockReset().mockResolvedValue(settings);
    apiMock.saveBookingSettings.mockReset().mockResolvedValue({ ...settings, cierre: '22:00' });
  });

  it('solo las canchas muestran el precio por hora', async () => {
    render(<SpacesPage />, { wrapper: TestProvider });
    expect(await screen.findByLabelText('Precio por hora (MXN)')).toHaveValue('300.00');
    expect(screen.getAllByLabelText('Precio por hora (MXN)')).toHaveLength(1);
  });

  it('guarda el precio normalizado y vaciarlo quita la renta', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const input = await screen.findByLabelText('Precio por hora (MXN)');
    await user.clear(input);
    await user.type(input, '350.5');
    await user.click(screen.getByRole('button', { name: 'Guardar precio' }));
    await waitFor(() => expect(apiMock.updateSpace).toHaveBeenCalledWith('tenant-token', 7, { precio_hora: '350.50' }));
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Guardar precio' }));
    await waitFor(() => expect(apiMock.updateSpace).toHaveBeenLastCalledWith('tenant-token', 7, { precio_hora: null }));
  });

  it('un precio inválido no se envía', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const input = await screen.findByLabelText('Precio por hora (MXN)');
    await user.clear(input);
    await user.type(input, '0');
    expect(screen.getByRole('button', { name: 'Guardar precio' })).toBeDisabled();
    expect(screen.getByText(/monto mayor a 0/)).toBeInTheDocument();
  });

  it('guarda el horario de reservas', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const close = await screen.findByLabelText('Cierra');
    expect(close).toHaveValue('23:00');
    await user.clear(screen.getByLabelText('Días de anticipación'));
    await user.type(screen.getByLabelText('Días de anticipación'), '7');
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await waitFor(() =>
      expect(apiMock.saveBookingSettings).toHaveBeenCalledWith('tenant-token', {
        apertura: '07:00',
        cierre: '23:00',
        dias_adelanto: 7,
      }),
    );
    expect(await screen.findByText('Horario guardado.')).toBeInTheDocument();
  });

  it('sin canchas no aparece el horario de reservas', async () => {
    apiMock.listManagedSpaces.mockResolvedValue([table]);
    render(<SpacesPage />, { wrapper: TestProvider });
    await screen.findByText('Mesa 1');
    expect(screen.queryByText('Horario de reservas')).not.toBeInTheDocument();
    expect(apiMock.bookingSettings).not.toHaveBeenCalled();
  });
});
