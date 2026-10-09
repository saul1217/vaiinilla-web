import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreVideosCard } from './store-videos-card';
import type { BusinessSettings } from '../types/api';

const apiMock = vi.hoisted(() => ({ saveBusinessSettings: vi.fn() }));

vi.mock('../lib/api', () => ({ api: apiMock }));

const base: BusinessSettings = {
  tipo: 'cafeteria',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  gracia_liberacion_min: 5,
  tipos_disponibles: ['cafeteria'],
  videos_local: [],
};

function renderCard(overrides: Partial<BusinessSettings> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreVideosCard token="tenant-token" scopeId="est-1" settings={{ ...base, ...overrides }} />
    </QueryClientProvider>,
  );
}

async function agregar(user: ReturnType<typeof userEvent.setup>, titulo: string, url: string) {
  await user.type(screen.getByLabelText('Título'), titulo);
  await user.type(screen.getByLabelText('Enlace (https://)'), url);
  await user.click(screen.getByRole('button', { name: 'Agregar video' }));
}

describe('Videos de tu local', () => {
  beforeEach(() => {
    apiMock.saveBusinessSettings.mockReset();
  });

  it('sin videos muestra el aviso, y Guardar videos no se activa sin cambios', () => {
    renderCard();
    expect(screen.getByText('Todavía no hay videos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar videos' })).toBeDisabled();
  });

  it('agrega un video con enlace https y lo guarda', async () => {
    const user = userEvent.setup();
    const guardado = { ...base, videos_local: [{ titulo: 'Así preparamos el café', url: 'https://www.youtube.com/watch?v=abc' }] };
    apiMock.saveBusinessSettings.mockResolvedValue(guardado);
    renderCard();

    await agregar(user, 'Así preparamos el café', 'https://www.youtube.com/watch?v=abc');
    expect(screen.getByText('Así preparamos el café')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar videos' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Guardar videos' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', {
        videos_local: [{ titulo: 'Así preparamos el café', url: 'https://www.youtube.com/watch?v=abc' }],
      }),
    );
    expect(await screen.findByText('Videos guardados.')).toBeInTheDocument();
  });

  it('no acepta un enlace http: solo https', async () => {
    const user = userEvent.setup();
    renderCard();
    await agregar(user, 'Video', 'http://ejemplo.com/video');
    expect(screen.getByRole('alert')).toHaveTextContent("La dirección debe empezar con 'https://'.");
    expect(screen.queryByRole('button', { name: /Quitar el video/ })).not.toBeInTheDocument();
  });

  it('no acepta algo que no es una dirección', async () => {
    const user = userEvent.setup();
    renderCard();
    await agregar(user, 'Video', 'no es un enlace');
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe una dirección válida');
  });

  it('pide un título', async () => {
    const user = userEvent.setup();
    renderCard();
    await agregar(user, '   ', 'https://www.youtube.com/watch?v=abc');
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un título de hasta 60 caracteres.');
  });

  it('quitar un video no guarda hasta pulsar Guardar videos', async () => {
    const user = userEvent.setup();
    apiMock.saveBusinessSettings.mockResolvedValue({ ...base, videos_local: [{ titulo: 'Dos', url: 'https://dos.example.com' }] });
    renderCard({
      videos_local: [
        { titulo: 'Uno', url: 'https://uno.example.com' },
        { titulo: 'Dos', url: 'https://dos.example.com' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Quitar el video Uno' }));
    expect(screen.queryByText('Uno')).not.toBeInTheDocument();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Guardar videos' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', {
        videos_local: [{ titulo: 'Dos', url: 'https://dos.example.com' }],
      }),
    );
  });

  it('descartar cambios vuelve a la lista guardada', async () => {
    const user = userEvent.setup();
    renderCard({ videos_local: [{ titulo: 'Uno', url: 'https://uno.example.com' }] });
    await user.click(screen.getByRole('button', { name: 'Quitar el video Uno' }));
    await user.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.getByText('Uno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar videos' })).toBeDisabled();
  });

  it('con 5 videos ya no ofrece agregar otro', () => {
    renderCard({
      videos_local: Array.from({ length: 5 }, (_, i) => ({ titulo: `Video ${i + 1}`, url: `https://v${i + 1}.example.com` })),
    });
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('si el servidor rechaza el guardado, muestra el motivo y conserva la lista', async () => {
    const user = userEvent.setup();
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('No se pudo guardar el video.'));
    renderCard();
    await agregar(user, 'Video', 'https://www.youtube.com/watch?v=abc');
    await user.click(screen.getByRole('button', { name: 'Guardar videos' }));
    expect(await screen.findByText('No se pudo guardar el video.')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar videos' })).toBeEnabled();
  });
});
