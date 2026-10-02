import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceAvailability, SpaceSessionDetail } from '../types/api';
import { SpaceAccountPanel } from './space-account-panel';

const apiMock = vi.hoisted(() => ({
  spaceSession: vi.fn(),
  collectSpaceAccount: vi.fn(),
  releaseSpace: vi.fn(),
  startCounterRental: vi.fn(),
  payCounterRental: vi.fn(),
  cancelCounterRental: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));

const table = { id: 7, nombre: 'Mesa 7', tipo: 'mesa' as const };
const court = { id: 3, nombre: 'Cancha 1', tipo: 'cancha' as const };

const order = (id: string, folio: number, total: number) => ({
  id,
  folio,
  estado: 'entregado' as const,
  total,
  pago_diferido: true,
  pendiente_cobro: true,
  cliente: { nombre: `Cliente ${folio}` },
  items_resumen: '1× Tacos',
  creado_en: '2026-10-01T18:00:00Z',
});

const openAccount: SpaceSessionDetail = {
  espacio: table,
  estado: 'ocupada',
  saldada: false,
  fin_previsto: null,
  sesion: { id: 's1', estado: 'abierta', inicio: '2026-10-01T18:00:00Z', fin_previsto: null, version: 4 },
  cuenta: { pedidos: [order('p1', 11, 120), order('p2', 12, 80.5)], total: 200.5, pendiente: 200.5, pagado: 0, saldada: false },
};

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('cuenta del espacio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.spaceSession.mockResolvedValue(openAccount);
  });

  it('divide la cuenta: cobra solo el pedido marcado con la terminal', async () => {
    const user = userEvent.setup();
    apiMock.collectSpaceAccount.mockResolvedValue({ pedidos_cobrados: 1, total: '120.00', metodo_pago: 'terminal', monto_recibido: null, cambio: '0.00', restante: '80.50' });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    await user.click(screen.getByRole('checkbox', { name: /#12/ }));
    await user.click(screen.getByRole('radio', { name: /Terminal/ }));
    expect(screen.getByText(/A cobrar/).querySelector('.rolling-money')).toHaveAccessibleName('$120.00 MXN');
    await user.click(screen.getByRole('button', { name: 'Confirmar cobro' }));

    await waitFor(() => expect(apiMock.collectSpaceAccount).toHaveBeenCalledWith('t', 7, {
      metodo: 'terminal',
      montoRecibido: undefined,
      totalEsperado: '120.00',
      pedidoIds: ['p1'],
    }));
    expect(await screen.findByText(/Falta por cobrar \$80\.50 MXN/)).toBeVisible();
  });

  it('en efectivo no deja confirmar hasta que alcance y cobra la cuenta completa', async () => {
    const user = userEvent.setup();
    apiMock.collectSpaceAccount.mockResolvedValue({ pedidos_cobrados: 2, total: '200.50', metodo_pago: 'efectivo', monto_recibido: '300.00', cambio: '99.50', restante: '0.00' });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    const confirm = screen.getByRole('button', { name: 'Confirmar cobro' });
    await user.type(screen.getByLabelText('Efectivo recibido'), '100.00');
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText('Efectivo recibido'));
    await user.type(screen.getByLabelText('Efectivo recibido'), '300.00');
    await user.click(confirm);

    await waitFor(() => expect(apiMock.collectSpaceAccount).toHaveBeenCalledWith('t', 7, {
      metodo: 'efectivo',
      montoRecibido: '300.00',
      totalEsperado: '200.50',
      pedidoIds: undefined,
    }));
    expect(await screen.findByText(/Cuenta saldada/)).toBeVisible();
  });

  it('renta una cancha libre en mostrador y suelta el horario si no se cobra', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({ ...openAccount, espacio: court, estado: 'libre', sesion: null, cuenta: null });
    apiMock.startCounterRental.mockResolvedValue({ id: 'r1', espacio: court, inicio: '2026-10-01T18:00:00Z', fin: '2026-10-01T19:00:00Z', duracion_min: 60, monto: '300.00', estado: 'pendiente_pago', version: 1 });
    apiMock.cancelCounterRental.mockResolvedValue(undefined);
    const availability: SpaceAvailability = { espacio: court, estado: 'libre', saldada: true, inicio: null, fin_previsto: null, precio_hora: '300.00', proxima_reserva: null };
    render(<SpaceAccountPanel token="t" spaceId={3} availability={availability} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: '1 h' }));
    expect(apiMock.startCounterRental).toHaveBeenCalledWith('t', { espacioId: 3, duracionMin: 60, inicio: null });
    await user.click(await screen.findByRole('button', { name: 'Cancelar renta' }));

    expect(apiMock.cancelCounterRental).toHaveBeenCalledWith('t', 'r1');
  });
});
