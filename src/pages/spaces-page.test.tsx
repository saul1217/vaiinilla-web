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
  createSpaceBatch: vi.fn(),
  rotateSpaceQr: vi.fn(),
  uploadSpaceImage: vi.fn(),
  deleteSpaceImage: vi.fn(),
  deleteSpace: vi.fn(),
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

const court = {
  id: 7,
  nombre: 'Cancha 1',
  tipo: 'cancha',
  activo: true,
  qr_url: 'https://vaiinilla.app/x/m/1',
  precio_hora: '300.00',
  descripcion: null,
  imagen_url: null,
  caracteristicas: ['Techada'],
};
const table = { id: 3, nombre: 'Mesa 1', tipo: 'mesa', activo: true, qr_url: 'https://vaiinilla.app/x/m/2', precio_hora: null };
const settings = { apertura: '07:00', cierre: '23:00', dias_adelanto: 14, zona_horaria: 'America/Chihuahua' };

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('eliminar un espacio desde el panel', () => {
  beforeEach(() => {
    apiMock.listManagedSpaces.mockReset().mockResolvedValue([table]);
    apiMock.deleteSpace.mockReset().mockResolvedValue({ id: 3, eliminado: true });
    apiMock.bookingSettings.mockReset().mockResolvedValue(settings);
  });

  it('pide confirmación y elimina solo al confirmar', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(screen.getByText(/¿Eliminar «Mesa 1»\?/)).toBeInTheDocument();
    expect(apiMock.deleteSpace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    await waitFor(() => expect(apiMock.deleteSpace).toHaveBeenCalledWith('tenant-token', 3));
    expect(await screen.findByText(/Espacio eliminado/)).toBeInTheDocument();
  });

  it('cancelar no elimina nada', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText(/¿Eliminar «Mesa 1»\?/)).not.toBeInTheDocument();
    expect(apiMock.deleteSpace).not.toHaveBeenCalled();
  });

  it('si hay una cuenta abierta, muestra el motivo del servidor', async () => {
    apiMock.deleteSpace.mockRejectedValue(
      new Error('Este espacio tiene una cuenta abierta. Ciérrala antes de eliminarlo.'),
    );
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await user.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    expect(await screen.findByText(/Ciérrala antes de eliminarlo/)).toBeInTheDocument();
  });
});

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

  it('permite horario que cruza la medianoche y muestra indicación', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const open = await screen.findByLabelText('Abre');
    const close = screen.getByLabelText('Cierra');
    await user.clear(open);
    await user.type(open, '08:00');
    await user.clear(close);
    await user.type(close, '03:00');
    expect(screen.getByText('Cruza la medianoche (del día siguiente)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Guardar horario' }));
    await waitFor(() =>
      expect(apiMock.saveBookingSettings).toHaveBeenCalledWith('tenant-token', {
        apertura: '08:00',
        cierre: '03:00',
        dias_adelanto: 14,
      }),
    );
  });

  it('rechaza horario si apertura y cierre son idénticos', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const close = await screen.findByLabelText('Cierra');
    await user.clear(close);
    await user.type(close, '07:00');
    expect(screen.getByText('El cierre debe ser distinto de la apertura.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeDisabled();
  });

  it('crea asientos en lote: muestra lo que se creará y envía el rango', async () => {
    const user = userEvent.setup();
    apiMock.createSpaceBatch.mockReset().mockResolvedValue({ tipo: 'asiento', solicitados: 3, creados: 2, omitidos: ['Asiento 2'] });
    render(<SpacesPage />, { wrapper: TestProvider });
    const from = await screen.findByLabelText('Desde');
    await user.clear(from);
    await user.type(from, '1');
    const to = screen.getByLabelText('Hasta');
    await user.clear(to);
    await user.type(to, '3');
    expect(screen.getByText(/Se crearán 3: Asiento 1 … Asiento 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Crear 3/ }));
    await waitFor(() =>
      expect(apiMock.createSpaceBatch).toHaveBeenCalledWith('tenant-token', {
        tipo: 'asiento',
        prefijo: 'Asiento',
        desde: 1,
        hasta: 3,
      }),
    );
    expect(await screen.findByText('2 espacios creados; 1 ya existían y se omitieron.')).toBeInTheDocument();
  });

  it('no deja crear un rango al revés ni más de 500', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    const to = await screen.findByLabelText('Hasta');
    await user.clear(to);
    await user.type(to, '0');
    expect(screen.getByText(/el final no puede ser menor/)).toBeInTheDocument();
    await user.clear(to);
    await user.type(to, '900');
    expect(screen.getByText('Máximo 500 a la vez.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear 900' })).toBeDisabled();
  });

  it('sin canchas no aparece el horario de reservas', async () => {
    apiMock.listManagedSpaces.mockResolvedValue([table]);
    render(<SpacesPage />, { wrapper: TestProvider });
    await screen.findByText('Mesa 1');
    expect(screen.queryByText('Horario de reservas')).not.toBeInTheDocument();
    expect(apiMock.bookingSettings).not.toHaveBeenCalled();
  });

  it('guarda la ficha de la cancha: descripción y características', async () => {
    const user = userEvent.setup();
    render(<SpacesPage />, { wrapper: TestProvider });
    await user.type(await screen.findByLabelText('Descripción'), 'Cancha de vidrio');
    await user.type(screen.getByLabelText('Nueva característica'), 'con luz{Enter}');
    await user.type(screen.getByLabelText('Nueva característica'), 'techada{Enter}');
    await user.click(screen.getByRole('button', { name: '+ Vidrio panorámico' }));
    await user.click(screen.getByRole('button', { name: 'Quitar Techada' }));
    await user.click(screen.getByRole('button', { name: 'Guardar ficha' }));
    await waitFor(() =>
      expect(apiMock.updateSpace).toHaveBeenCalledWith('tenant-token', 7, {
        descripcion: 'Cancha de vidrio',
        caracteristicas: ['con luz', 'Vidrio panorámico'],
      }),
    );
  });

  it('sube la foto de la cancha y rechaza formatos no permitidos', async () => {
    const user = userEvent.setup({ applyAccept: false });
    apiMock.uploadSpaceImage.mockReset().mockResolvedValue({ ...court, imagen_url: 'https://x/foto.jpg' });
    render(<SpacesPage />, { wrapper: TestProvider });
    const input = await screen.findByLabelText('Elegir foto de Cancha 1');
    await user.upload(input, new File(['gif'], 'foto.gif', { type: 'image/gif' }));
    expect(await screen.findByText('La foto debe ser JPG, PNG o WebP.')).toBeInTheDocument();
    const photo = new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(input, photo);
    await waitFor(() => expect(apiMock.uploadSpaceImage).toHaveBeenCalledWith('tenant-token', 7, photo));
  });

  it('una mesa no muestra la ficha', async () => {
    apiMock.listManagedSpaces.mockResolvedValue([table]);
    render(<SpacesPage />, { wrapper: TestProvider });
    await screen.findByText('Mesa 1');
    expect(screen.queryByText('Ficha de la cancha')).not.toBeInTheDocument();
  });
});
