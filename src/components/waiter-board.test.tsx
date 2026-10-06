import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaiterBoard } from './waiter-board';

const { waiterClient, apiMock, state } = vi.hoisted(() => ({
  waiterClient: {
    board: vi.fn(),
    transitionCall: vi.fn(),
  },
  apiMock: {
    spaceAvailability: vi.fn(),
    operationalStatus: vi.fn(),
    spaceSession: vi.fn(),
    collectSpaceAccount: vi.fn(),
    releaseSpace: vi.fn(),
  },
  state: { call: null as null | Record<string, unknown> },
}));

vi.mock('../lib/mesero-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/mesero-api')>();
  return { ...actual, createWaiterClient: () => waiterClient };
});
vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('./pending-refunds', () => ({ PendingRefunds: () => null }));

const space = { id: 67, nombre: 'Mesa 67', tipo: 'mesa' };
const call = {
  id: 'call-67',
  espacio: space,
  pedido_id: 'order-28',
  motivo: 'cuenta',
  estado: 'pendiente',
  cliente: { nombre: 'Kikin' },
  tomada_por: null,
  creado_en: '2026-10-06T12:00:00.000Z',
  tomada_en: null,
  cerrada_en: null,
  version: 1,
};
const account = {
  espacio: space,
  estado: 'ocupada',
  saldada: false,
  fin_previsto: null,
  sesion: { id: 'session-67', estado: 'abierta', inicio: '2026-10-06T11:00:00.000Z', fin_previsto: null, version: 1 },
  cuenta: {
    pedidos: [
      { id: 'order-28', folio: 28, estado: 'cobrado', total: 50, pago_diferido: true, pendiente_cobro: true, cliente: { nombre: 'Kikin' }, items_resumen: '1× Quesadilla', creado_en: '2026-10-06T11:30:00.000Z' },
      { id: 'order-29', folio: 29, estado: 'cobrado', total: 20, pago_diferido: true, pendiente_cobro: true, cliente: { nombre: 'Kikin' }, items_resumen: '1× Agua', creado_en: '2026-10-06T11:35:00.000Z' },
      { id: 'order-27', folio: 27, estado: 'cobrado', total: 20, pago_diferido: true, pendiente_cobro: true, cliente: { nombre: 'David' }, items_resumen: '1× Agua', creado_en: '2026-10-06T11:25:00.000Z' },
    ],
    grupos: [
      { etiqueta: 'Kikin', participante_id: 'p-kikin', pedidos: ['order-28', 'order-29'], total: 70, pagado: 0, pendiente: 70 },
      { etiqueta: 'David', participante_id: 'p-david', pedidos: ['order-27'], total: 20, pagado: 0, pendiente: 20 },
      { etiqueta: 'Miguel', participante_id: 'p-miguel', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
    ],
    total: 90,
    pagado: 0,
    pendiente: 90,
    saldada: false,
  },
};

function table() {
  return {
    espacio: space,
    llamada: state.call,
    pedidos: [{ id: 'order-28', folio: 28, estado: 'listo', version: 1, cliente: { nombre: 'Kikin' }, items_resumen: '1× Quesadilla', actualizado_en: '2026-10-06T11:30:00.000Z' }],
  };
}

function TestProvider({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('WaiterBoard: solicitud de cuenta de mesa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.call = { ...call };
    waiterClient.board.mockImplementation(() => Promise.resolve({ tables: [table()], callsEnabled: true }));
    waiterClient.transitionCall.mockImplementation((_call: typeof call, target: 'en_camino' | 'atendida') => {
      state.call = target === 'atendida' ? null : { ...call, estado: 'en_camino', version: 2, tomada_por: { usuario_id: 'staff-1', nombre: 'Luis' } };
      return Promise.resolve(state.call ?? { ...call, estado: target, version: 2 });
    });
    apiMock.spaceAvailability.mockResolvedValue([]);
    apiMock.operationalStatus.mockResolvedValue({ entrega_requiere_qr: false });
    apiMock.spaceSession.mockResolvedValue(account);
  });

  it('expone la solicitud, permite Voy y Atendida, y deja la cuenta intacta para imprimir', async () => {
    const user = userEvent.setup();
    render(<WaiterBoard token="staff-token" role="mesero" />, { wrapper: TestProvider });

    const tile = await screen.findByRole('button', { name: /Mesa 67\. Llamando/ });
    await user.click(tile);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Pidió la cuenta')).toBeInTheDocument();
    expect(within(dialog).getByText(/Kikin · hace/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Voy' }));
    await waitFor(() => expect(waiterClient.transitionCall).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'call-67' }), 'en_camino'));
    await user.click(await within(dialog).findByRole('button', { name: 'Atendida' }));
    await waitFor(() => expect(waiterClient.transitionCall).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'call-67' }), 'atendida'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Mesa 67\. Pedido listo/ }));
    const accountDialog = await screen.findByRole('dialog');
    expect(within(accountDialog).getByRole('button', { name: 'Imprimir cuenta' })).toBeInTheDocument();
    expect(within(accountDialog).getByText(/Subtotal Kikin:/)).toHaveTextContent('$70.00 MXN');
    expect(within(accountDialog).getByText(/Subtotal David:/)).toHaveTextContent('$20.00 MXN');
    expect(within(accountDialog).queryByText('MIGUEL')).not.toBeInTheDocument();
    expect(within(accountDialog).getAllByLabelText('$90.00 MXN')).toHaveLength(2);
    expect(apiMock.collectSpaceAccount).not.toHaveBeenCalled();
    expect(apiMock.releaseSpace).not.toHaveBeenCalled();
    expect(apiMock.spaceSession).toHaveBeenCalledWith('staff-token', 67);
    expect(account.sesion).toMatchObject({ id: 'session-67', estado: 'abierta' });
    expect(account.cuenta).toMatchObject({ total: 90, pagado: 0, pendiente: 90 });
  });
});
