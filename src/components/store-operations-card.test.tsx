import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreOperationsCard } from './store-operations-card';
import { api } from '../lib/api';
import type { BusinessSettings } from '../types/api';

const base = { tipo: 'cafeteria', tipos_disponibles: ['cafeteria'] } as unknown as BusinessSettings;

function renderCard(settings: BusinessSettings) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StoreOperationsCard token="t" scopeId="s" settings={settings} />
    </QueryClientProvider>,
  );
}

describe('StoreOperationsCard: cajas independientes', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sin el back nuevo no ofrece la opción', () => {
    renderCard(base);
    expect(screen.queryByText('Cada cajera con su caja')).toBeNull();
  });

  it('elegir «Cada cajera con su caja» guarda cajas_independientes', async () => {
    const save = vi.spyOn(api, 'saveBusinessSettings').mockResolvedValue({ ...base, cajas_independientes: true });
    renderCard({ ...base, cajas_independientes: false });
    await userEvent.click(screen.getByText('Cada cajera con su caja'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajustes operativos' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('t', { cajas_independientes: true }));
  });
});
