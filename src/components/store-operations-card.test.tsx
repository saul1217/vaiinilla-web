import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreOperationsCard } from './store-operations-card';
import type { BusinessSettings } from '../types/api';

const apiMock = vi.hoisted(() => ({
  preflightBusinessTransition: vi.fn(),
  applyBusinessTransition: vi.fn(),
  businessSettings: vi.fn(),
  saveBusinessSettings: vi.fn(),
}));
vi.mock('../lib/api', () => ({ api: apiMock }));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const settings = {
  tipo: 'cafeteria',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  asistente_modo: null,
  gracia_liberacion_min: 5,
  tipos_disponibles: ['cafeteria'],
  barra_prepara: false,
  tiene_cocina: true,
} as BusinessSettings;

describe('Quién prepara', () => {
  beforeEach(() => {
    apiMock.preflightBusinessTransition.mockReset().mockResolvedValue({ permitido: true, version_actual: 4 });
    apiMock.applyBusinessTransition.mockReset().mockResolvedValue({});
    apiMock.businessSettings.mockReset().mockResolvedValue({ ...settings, barra_prepara: true, tiene_cocina: false });
  });

  it('«Sin cocina» apaga la cocina y prende la barra en la misma transición', async () => {
    const user = userEvent.setup();
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={settings} />, { wrapper: Wrapper });
    await user.click(screen.getByRole('radio', { name: /^Sin cocina/ }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() =>
      expect(apiMock.applyBusinessTransition).toHaveBeenCalledWith(
        't',
        { barra_prepara: true, tiene_cocina: false },
        4,
        expect.any(String),
      ),
    );
  });

  it('con un back que no conoce tiene_cocina no ofrece «Sin cocina»', () => {
    const viejo = { ...settings };
    delete (viejo as Partial<BusinessSettings>).tiene_cocina;
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={viejo} />, { wrapper: Wrapper });
    expect(screen.queryByRole('radio', { name: /^Sin cocina/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Todo en Cocina/ })).toHaveAttribute('aria-checked', 'true');
  });
});
