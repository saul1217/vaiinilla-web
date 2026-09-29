import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TableCall } from '../lib/mesero-api';
import { WaiterBoard } from './waiter-board';

const call: TableCall = {
  id: 'call-1',
  espacio: { id: 4, nombre: 'Mesa 4', tipo: 'mesa' },
  pedido_id: null,
  motivo: 'atencion',
  estado: 'pendiente',
  cliente: { nombre: 'Ana' },
  tomada_por: null,
  creado_en: '2026-09-25T18:00:00.000Z',
  tomada_en: null,
  cerrada_en: null,
  version: 1,
};

const boardFor = (nextCall: TableCall) => [
  {
    espacio: call.espacio,
    llamada: nextCall,
    pedidos: [],
  },
];

const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta: {}, error: null }), { status });

afterEach(() => vi.unstubAllGlobals());

describe('WaiterBoard', () => {
  it('recarga el tablero inmediatamente si otro mesero gana la transición', async () => {
    let boardReads = 0;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/espacios/tablero')) {
        boardReads += 1;
        return response(boardFor(boardReads === 1 ? call : { ...call, estado: 'en_camino', version: 2, tomada_por: { usuario_id: 'u-luis', nombre: 'Luis' } }));
      }
      if (url.endsWith('/llamadas/call-1/transiciones') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: null,
            meta: {},
            error: { code: 'VERSION_CONFLICT', message: 'La llamada cambió; recarga el tablero.' },
          }),
          { status: 409 },
        );
      }
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WaiterBoard token="jwt-mesero" />
      </QueryClientProvider>,
    );

    await screen.findByRole('button', { name: /mesa 4\. llamando/i });
    fireEvent.click(screen.getByRole('button', { name: /mesa 4\. llamando/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Voy' }));

    await waitFor(() => expect(boardReads).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getAllByText(/va luis/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/otra persona tomó la llamada/i)).toBeInTheDocument();
    queryClient.clear();
  });
});
