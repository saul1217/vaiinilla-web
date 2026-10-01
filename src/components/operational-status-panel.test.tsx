import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationalStatusPanel } from './operational-status-panel';

const apiMock = vi.hoisted(() => ({ operationalStatus: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } } }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const base = {
  recibiendo_pedidos: false,
  sesion_caja_abierta: true,
  caja_en_linea: true,
  cocina_en_linea: true,
  tiempo_estimado_min: 5,
  consultado_en: '2026-09-30T19:00:00.000Z',
};

describe('estado operativo y franjas de pedidos', () => {
  beforeEach(() => apiMock.operationalStatus.mockReset());

  it('fuera de las franjas dice por qué no recibe pedidos', async () => {
    apiMock.operationalStatus.mockResolvedValue({
      ...base,
      dentro_de_franja: false,
      franjas_pedido: [{ desde: '12:00', hasta: '15:00' }],
    });
    render(<OperationalStatusPanel />, { wrapper: Wrapper });
    expect(await screen.findByText('Fuera del horario de pedidos (12:00 a 15:00).')).toBeInTheDocument();
  });

  it('sin franjas conserva el motivo de siempre', async () => {
    apiMock.operationalStatus.mockResolvedValue({ ...base, sesion_caja_abierta: false });
    render(<OperationalStatusPanel />, { wrapper: Wrapper });
    expect(await screen.findByText('Hace falta abrir la sesión de Caja.')).toBeInTheDocument();
  });
});
