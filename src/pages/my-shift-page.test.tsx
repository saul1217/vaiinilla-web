import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyShift } from '../types/api';
import { MyShiftPage } from './my-shift-page';

const apiMock = vi.hoisted(() => ({ myShift: vi.fn<(token: string) => Promise<MyShift>>() }));
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({
    tenant: {
      token: 'token-caja',
      access: { establecimiento: { nombre: 'Café de pruebas' } },
      context: { establecimiento_id: 'n-1', usuario_id: 'u-1', rol: 'mesero' },
    },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// La forma real de la respuesta de Railway development, con otras cifras.
const shift = (over: Partial<MyShift['hoy']> = {}): MyShift => ({
  hoy: { propinas: '85.50', entregas: 12, mesas: 4, llamadas_atendidas: 3, respuesta_min: '1.5', ...over },
  semana: {
    propinas: '210.00',
    por_dia: ['16', '17', '18', '19', '20', '21', '22'].map((d, i) => ({ fecha: `2026-11-${d}`, propinas: i === 0 ? '85.50' : i === 1 ? '124.50' : '0.00' })),
  },
});

describe('Mi turno', () => {
  beforeEach(() => apiMock.myShift.mockReset());

  it('enseña las propinas de hoy, sus números y la semana', async () => {
    apiMock.myShift.mockResolvedValue(shift());
    render(<MyShiftPage />, { wrapper });

    const hoy = await screen.findByRole('region', { name: 'Hoy' });
    expect(within(hoy).getByText('$85.50')).toBeInTheDocument();
    expect(within(hoy).getByText('12')).toBeInTheDocument();
    expect(within(hoy).getByText('1.5 min')).toBeInTheDocument();
    expect(screen.getByText('$210.00')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.getByText('Mesero · Café de pruebas')).toBeInTheDocument();
    expect(apiMock.myShift).toHaveBeenCalledWith('token-caja');
  });

  it('sin llamadas atendidas la respuesta queda en raya', async () => {
    apiMock.myShift.mockResolvedValue(shift({ llamadas_atendidas: 0, respuesta_min: null }));
    render(<MyShiftPage />, { wrapper });
    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('si falla lo dice y deja reintentar', async () => {
    apiMock.myShift.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue(shift());
    const user = userEvent.setup();
    render(<MyShiftPage />, { wrapper });
    expect(await screen.findByText('No se pudo consultar tu turno')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Hoy' })).toBeInTheDocument();
  });
});
