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

describe('Pedir el código al cobrar (migración 225)', () => {
  beforeEach(() => {
    apiMock.preflightBusinessTransition.mockReset();
    apiMock.saveBusinessSettings.mockReset().mockResolvedValue({ ...settings, cobro_requiere_codigo: true });
  });

  it('nace apagado y prenderlo se guarda como ajuste directo, sin transición', async () => {
    const user = userEvent.setup();
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={{ ...settings, cobro_requiere_codigo: false }} />, { wrapper: Wrapper });
    expect(screen.getByRole('radio', { name: /^Cobrar sin pedir código/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: /^Pedir el código del cliente al cobrar/ }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('t', { cobro_requiere_codigo: true }));
    expect(apiMock.preflightBusinessTransition).not.toHaveBeenCalled();
  });

  it('con un back sin la 225 no se ofrece', () => {
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={settings} />, { wrapper: Wrapper });
    expect(screen.queryByRole('radio', { name: /^Pedir el código del cliente al cobrar/ })).not.toBeInTheDocument();
  });
});

describe('Pedir con cuenta y aviso de retraso (migración 228)', () => {
  const con228 = { ...settings, cuenta_obligatoria: false, alerta_retraso_activa: false, alerta_retraso_sin_cocina_min: 2, alerta_retraso_cocina_min: 5 };
  beforeEach(() => {
    apiMock.saveBusinessSettings.mockReset().mockResolvedValue({ ...con228, cuenta_obligatoria: true });
  });

  it('sin la migración no ofrece los ajustes', () => {
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={settings} />, { wrapper: Wrapper });
    expect(screen.queryByRole('radio', { name: /^Pedir con cuenta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^Avisar de pedidos pagados/ })).not.toBeInTheDocument();
  });

  it('guarda «Pedir con cuenta» solo con ese cambio', async () => {
    const user = userEvent.setup();
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={con228} />, { wrapper: Wrapper });
    await user.click(screen.getByRole('radio', { name: /^Pedir con cuenta/ }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('t', { cuenta_obligatoria: true }));
  });

  it('un límite fuera de rango no deja guardar y dice por qué', async () => {
    const user = userEvent.setup();
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={con228} />, { wrapper: Wrapper });
    await user.click(screen.getByRole('radio', { name: /^Avisar de pedidos pagados/ }));
    const campo = screen.getByLabelText(/Límite con cocina/);
    await user.clear(campo);
    expect(screen.getByText('Escribe un número de 1 a 240.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar/ })).toBeDisabled();
    await user.type(campo, '7');
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('t', { alerta_retraso_activa: true, alerta_retraso_cocina_min: 7 }),
    );
  });

  it('el aviso de guardado vive en quien la monta, para que sobreviva al remontar', async () => {
    const user = userEvent.setup();
    const onNotice = vi.fn();
    render(<StoreOperationsCard token="t" scopeId="est-1" settings={con228} notice={null} onNotice={onNotice} />, { wrapper: Wrapper });
    await user.click(screen.getByRole('radio', { name: /^Pedir con cuenta/ }));
    await user.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Ajustes operativos guardados.'));
  });
});
