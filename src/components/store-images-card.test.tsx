import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreImagesCard } from './store-images-card';
import type { BusinessSettings } from '../types/api';

const apiMock = vi.hoisted(() => ({ uploadStoreImage: vi.fn(), deleteStoreImage: vi.fn() }));

vi.mock('../lib/api', () => ({ api: apiMock }));

const base: BusinessSettings = {
  tipo: 'restaurante',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  gracia_liberacion_min: 5,
  tipos_disponibles: ['restaurante'],
};

function renderCard(overrides: Partial<BusinessSettings> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StoreImagesCard token="tenant-token" scopeId="est-1" settings={{ ...base, ...overrides }} />
    </QueryClientProvider>,
  );
}

describe('Logo y foto de tu negocio', () => {
  beforeEach(() => {
    apiMock.uploadStoreImage.mockReset();
    apiMock.deleteStoreImage.mockReset();
  });

  it('sin imágenes ofrece subir las dos y no deja quitar nada', () => {
    renderCard();
    expect(screen.getAllByRole('button', { name: 'Subir' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
  });

  it('sube el logo por su ruta', async () => {
    const user = userEvent.setup();
    apiMock.uploadStoreImage.mockResolvedValue({ ...base, logo_url: 'https://cdn.test/logo.png' });
    renderCard();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Elegir logo'), file);
    await waitFor(() => expect(apiMock.uploadStoreImage).toHaveBeenCalledWith('tenant-token', 'logo', file));
  });

  it('rechaza un archivo que no es imagen sin llamar a la API', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderCard();
    await user.upload(screen.getByLabelText('Elegir foto del lugar'), new File(['x'], 'menu.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('La imagen debe ser JPG, PNG o WebP.')).toBeInTheDocument();
    expect(apiMock.uploadStoreImage).not.toHaveBeenCalled();
  });

  it('muestra la foto guardada y la quita', async () => {
    const user = userEvent.setup();
    apiMock.deleteStoreImage.mockResolvedValue(base);
    renderCard({ imagen_url: 'https://cdn.test/foto.jpg' });
    expect(screen.getByAltText('Foto del lugar actual')).toHaveAttribute('src', 'https://cdn.test/foto.jpg');
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(apiMock.deleteStoreImage).toHaveBeenCalledWith('tenant-token', 'foto'));
  });
});
