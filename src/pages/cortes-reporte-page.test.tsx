import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import { CORTES_QUERY_ROOT } from '../lib/cortes-reporte';
import { CortesReportePage } from './cortes-reporte-page';

const apiMock = vi.hoisted(() => ({ cashDayCut: vi.fn(), accountingReport: vi.fn(), cashSessionCut: vi.fn() }));
vi.mock('../lib/api', () => ({ api: apiMock }));

type FakeTenant = { token: string; access: { membresia_id: string }; context: { establecimiento_id: string; membresia_id: string; usuario_id: string } };
const session = vi.hoisted(() => ({ tenant: null as FakeTenant | null }));
vi.mock('../context/session-context', () => ({ useSessions: () => ({ tenant: session.tenant }) }));

const tenantOf = (negocio: string, membresia = `m-${negocio}`, usuario = 'u-1'): FakeTenant => ({
  token: `token-${negocio}`,
  access: { membresia_id: membresia },
  context: { establecimiento_id: negocio, membresia_id: membresia, usuario_id: usuario },
});

const dayCut = (fecha: string, turnos: { id: string; esperado: string }[], ventas = '100.00') => ({
  fecha,
  tipo: 'final',
  resumen: { ventas, pedidos: 2, ticket_promedio: '50.00' },
  turnos: turnos.map((t) => ({ id: t.id, fecha_operativa: fecha, abierta_en: null, efectivo: { fondo: '50.00', efectivo_esperado: t.esperado } })),
  efectivo: { fondo: '50.00', efectivo_esperado: '150.00' },
});

let client: QueryClient;
function renderPage() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><CortesReportePage /></QueryClientProvider>);
  return { ...view, rerenderPage: () => view.rerender(<QueryClientProvider client={client}><CortesReportePage /></QueryClientProvider>) };
}

describe('CortesReportePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.tenant = tenantOf('negocio-a');
    apiMock.cashDayCut.mockImplementation((_t: string, fecha: string) => Promise.resolve(dayCut(fecha, [{ id: 'caja-1', esperado: '150.00' }])));
  });

  it('presenta los campos del contrato de cortes del backend', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /\$150\.00/ })).toBeInTheDocument();
    expect(screen.getByText('Efectivo esperado')).toBeInTheDocument();
  });

  it('muestra el desglose contable por forma de pago, categoría, producto, personal y espacio', async () => {
    apiMock.accountingReport.mockResolvedValue({
      negocio: 'Boliche Norte',
      periodo: { desde: '2026-11-01', hasta: '2026-11-04' },
      resumen: { ventas: '300.00', pedidos: 3, ticket_promedio: '100.00' },
      formas_pago: [{ metodo: 'terminal', pedidos: 2, monto: '200.00' }, { metodo: 'efectivo', pedidos: 1, monto: '100.00' }],
      propinas: { total: '30.00', efectivo: '10.00', terminal: '20.00' },
      cancelados: { pedidos: 1, monto: '40.00' },
      por_categoria: [{ categoria: 'Bebidas', cantidad: 4, importe: '120.00' }],
      por_producto: [{ producto: 'Limonada', categoria: 'Bebidas', cantidad: 4, importe: '120.00' }],
      por_personal: [{ usuario_id: 'u-9', nombre: 'Ana', rol: 'mesero', pedidos: 2, ventas: '200.00', ticket_promedio: '100.00' }, { usuario_id: null, pedidos: 1, ventas: '100.00' }],
      por_espacio: [{ espacio_id: 7, nombre: 'Pista 3', tipo: 'cancha', pedidos: 1, ventas: '150.00', rentas: '100.00', consumo: '50.00' }, { espacio_id: null, pedidos: 2, ventas: '150.00' }],
      por_dia: [{ fecha: '2026-11-01', pedidos: 1, ventas: '100.00' }, { fecha: '2026-11-02', pedidos: 2, ventas: '200.00' }],
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Contabilidad' }));
    expect(await screen.findByText(/Ventas del periodo · Boliche Norte/)).toBeInTheDocument();
    for (const title of ['Por forma de pago', 'Por categoría', 'Por producto', 'Por personal', 'Por mesa o pista', 'Por día']) {
      expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Limonada')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Mesero')).toBeInTheDocument();
    expect(screen.getByText('Clientes (app o QR)')).toBeInTheDocument();
    expect(screen.getByText('Pista 3')).toBeInTheDocument();
    expect(screen.getByText('Pista o cancha')).toBeInTheDocument();
    expect(screen.getByText('Para llevar o mostrador')).toBeInTheDocument();
    expect(apiMock.accountingReport).toHaveBeenCalledWith('token-negocio-a', expect.any(String), expect.any(String), expect.any(AbortSignal));
  });

  it.each([
    [401, 'UNAUTHENTICATED', 'Tu sesión terminó'],
    [403, 'FORBIDDEN_ROLE', 'Sin permiso'],
    [500, 'INTERNAL_ERROR', 'El servidor tuvo un problema'],
  ])('ante un %i muestra el error con reintento', async (status, code, title) => {
    apiMock.cashDayCut.mockRejectedValueOnce(new VaiinillaApiError(status, { code, message: 'x' }));
    renderPage();
    expect(await screen.findByText(title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /\$150\.00/ })).toBeInTheDocument();
    expect(apiMock.cashDayCut).toHaveBeenCalledTimes(2);
  });

  it('ante un error de red muestra el error con reintento', async () => {
    apiMock.cashDayCut.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('distingue el 404 de un endpoint no soportado', async () => {
    apiMock.cashDayCut.mockRejectedValue(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Recurso no encontrado.' }));
    renderPage();
    expect(await screen.findByText('Cortes no disponibles en este servidor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('al cambiar la fecha suelta el turno seleccionado', async () => {
    apiMock.cashSessionCut.mockResolvedValue({ tipo: 'final', turno: { id: 'caja-1', fecha_operativa: '2026-11-04', efectivo: { efectivo_esperado: '150.00' } }, resumen: { ventas: '75.00' } });
    apiMock.cashDayCut.mockImplementation((_t: string, fecha: string) => Promise.resolve(dayCut(fecha, fecha === '2026-11-05' ? [{ id: 'caja-2', esperado: '999.00' }] : [{ id: 'caja-1', esperado: '150.00' }])));
    renderPage();
    fireEvent.change(screen.getByLabelText('Fecha operativa'), { target: { value: '2026-11-04' } });
    fireEvent.click(await screen.findByRole('button', { name: /\$150\.00/ }));
    expect(await screen.findByText(/Corte del turno/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fecha operativa'), { target: { value: '2026-11-05' } });
    expect(await screen.findByText(/Resumen del día 2026-11-05/)).toBeInTheDocument();
    expect(screen.queryByText(/Corte del turno/)).not.toBeInTheDocument();
    expect(apiMock.cashSessionCut).toHaveBeenCalledTimes(1);
  });

  it('al cambiar de negocio no se cuelan datos del anterior y cancela lo que estaba en curso', async () => {
    let abortedA = false;
    apiMock.cashDayCut.mockImplementation((token: string, fecha: string, signal: AbortSignal) => {
      if (token === 'token-negocio-a') {
        // La petición del negocio A se queda colgada hasta que la cancelen.
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { abortedA = true; reject(new DOMException('Aborted', 'AbortError')); }));
      }
      return Promise.resolve(dayCut(fecha, [{ id: 'caja-b', esperado: '20.00' }], '20.00'));
    });
    const { rerenderPage } = renderPage();
    await waitFor(() => expect(apiMock.cashDayCut).toHaveBeenCalledWith('token-negocio-a', expect.any(String), expect.any(AbortSignal)));

    session.tenant = tenantOf('negocio-b');
    act(() => rerenderPage());

    expect(await screen.findByRole('button', { name: /\$20\.00/ })).toBeInTheDocument();
    expect(abortedA).toBe(true);
    const keys = client.getQueryCache().findAll({ queryKey: [CORTES_QUERY_ROOT] }).map((q) => q.queryKey);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key[1] === 'negocio-b' && key[2] === 'm-negocio-b')).toBe(true);
  });

  it('no reutiliza la caché de otro negocio aunque coincida la fecha', async () => {
    apiMock.cashDayCut.mockImplementation((token: string, fecha: string) => Promise.resolve(dayCut(fecha, [{ id: `caja-${token}`, esperado: token === 'token-negocio-a' ? '111.00' : '222.00' }])));
    const { rerenderPage } = renderPage();
    expect(await screen.findByRole('button', { name: /\$111\.00/ })).toBeInTheDocument();

    session.tenant = tenantOf('negocio-b');
    act(() => rerenderPage());
    expect(await screen.findByRole('button', { name: /\$222\.00/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /\$111\.00/ })).not.toBeInTheDocument();

    // Misma persona y negocio, otra membresía (otro rol): tampoco comparte caché.
    session.tenant = tenantOf('negocio-b', 'm-otra');
    act(() => rerenderPage());
    await waitFor(() => expect(apiMock.cashDayCut).toHaveBeenCalledTimes(3));
  });
});
