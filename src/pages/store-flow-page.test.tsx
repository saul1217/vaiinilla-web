import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from '../lib/api-error';
import { StoreFlowPage } from './store-flow-page';

const apiMock = vi.hoisted(() => ({
  businessSettings: vi.fn(),
  saveBusinessSettings: vi.fn(),
  preflightBusinessTransition: vi.fn(),
  applyBusinessTransition: vi.fn(),
  cardPayments: vi.fn().mockResolvedValue(null),
}));

vi.mock('../lib/api', () => ({ api: apiMock }));
vi.mock('../context/session-context', () => ({
  useSessions: () => ({ tenant: { token: 'tenant-token', context: { establecimiento_id: 'est-1', rol: 'admin' } } }),
}));

const cafeteria = {
  tipo: 'cafeteria',
  entrega_requiere_qr: true,
  permite_pago_al_final: false,
  gracia_liberacion_min: 5,
  franjas_pedido: [],
  tipos_disponibles: ['cafeteria'],
  entrega_en_espacio: 'mesa',
};

const allowed = { permitido: true, reason_codes: [], bloqueos: [], version_actual: 7, capacidades_resultantes: {} };
const padelTransition = { tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true };

function renderFlow() {
  const result = render(<StoreFlowPage />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Configurar cómo funciona tu tienda' }));
  return result;
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('Flujo de mi tienda', () => {
  beforeEach(() => {
    apiMock.businessSettings.mockReset().mockResolvedValue(cafeteria);
    apiMock.saveBusinessSettings.mockReset().mockResolvedValue({ ...cafeteria, tipo: 'padel' });
    apiMock.preflightBusinessTransition.mockReset().mockResolvedValue(allowed);
    apiMock.applyBusinessTransition.mockReset().mockResolvedValue({ ...allowed, version_actual: 8 });
  });

  it('muestra el flujo actual y no hay nada que guardar sin cambios', async () => {
    renderFlow();
    expect(await screen.findByText('Paga con saldo, tarjeta o efectivo al pedir')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cafetería escolar/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('una plantilla de otro tipo pasa por la revisión, se confirma y la transición va aparte del PATCH', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Prepara en cuanto llega el pedido, sin esperar el cobro')).toBeInTheDocument();
    expect(screen.getByText('La cancha se libera al quedar saldada')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    // Primero la revisión de solo lectura: nada se escribe todavía.
    expect(await screen.findByText(/Versión revisada: 7/)).toBeInTheDocument();
    expect(apiMock.preflightBusinessTransition).toHaveBeenCalledWith('tenant-token', { cambios: padelTransition });
    expect(apiMock.applyBusinessTransition).not.toHaveBeenCalled();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    const review = screen.getByRole('list', { name: 'Cambios de tipo o modo' });
    expect(review).toHaveTextContent('Tipo de negocio: Cafetería → Club de pádel');
    expect(review).toHaveTextContent('Cuándo pagan: Al pedir → Al final, con cuenta abierta');
    expect(review).toHaveTextContent('Entrega: Con QR → Sin QR');
    await user.click(screen.getByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    expect(apiMock.applyBusinessTransition).toHaveBeenCalledTimes(1);
    const [token, body, key] = apiMock.applyBusinessTransition.mock.calls[0] as [string, unknown, string];
    expect(token).toBe('tenant-token');
    expect(body).toEqual({ version_esperada: 7, cambios: padelTransition });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    // La plantilla no cambió ningún ajuste ordinario: no hay PATCH, se relee lo guardado.
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('un cambio solo de ajustes ordinarios va directo al PATCH, sin preflight', async () => {
    const user = userEvent.setup();
    apiMock.saveBusinessSettings.mockResolvedValue({ ...cafeteria, gracia_liberacion_min: 12 });
    renderFlow();
    const grace = await screen.findByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '12');
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    expect(apiMock.preflightBusinessTransition).not.toHaveBeenCalled();
    expect(apiMock.applyBusinessTransition).not.toHaveBeenCalled();
    const body = apiMock.saveBusinessSettings.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.gracia_liberacion_min).toBe(12);
    for (const field of ['tipo', 'entrega_requiere_qr', 'permite_pago_al_final', 'entrega_en_espacio']) expect(body).not.toHaveProperty(field);
  });

  it('cambiar cómo llega el pedido en mesa es transición y conserva los ajustes ordinarios', async () => {
    const user = userEvent.setup();
    apiMock.saveBusinessSettings.mockResolvedValue({ ...cafeteria, entrega_en_espacio: 'barra', gracia_liberacion_min: 9 });
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /Pasan por él a la barra/ }));
    const grace = screen.getByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '9');
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    expect(apiMock.preflightBusinessTransition).toHaveBeenCalledWith('tenant-token', { cambios: { entrega_en_espacio: 'barra' } });
    expect(apiMock.applyBusinessTransition.mock.calls[0]?.[1]).toEqual({ version_esperada: 7, cambios: { entrega_en_espacio: 'barra' } });
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', expect.objectContaining({ gracia_liberacion_min: 9 }));
    expect(apiMock.saveBusinessSettings.mock.calls[0]?.[1]).not.toHaveProperty('entrega_en_espacio');
  });

  it('una revisión bloqueada enseña motivos y operaciones, no aplica ni hace PATCH, y se puede volver a revisar', async () => {
    const user = userEvent.setup();
    apiMock.preflightBusinessTransition.mockResolvedValueOnce({
      ...allowed,
      permitido: false,
      reason_codes: ['OPERATIONS_IN_FLIGHT'],
      bloqueos: [{ code: 'OPEN_CASH_SESSION', count: 1, message: 'Hay una sesión de caja abierta.' }],
      operaciones: { items: [{ code: 'OPEN_CASH_SESSION', id: 's1', referencia: 'Caja 1', estado: 'abierta', desde: null, panel: 'caja' }], pagina: 1, limite: 20, total: 1, hay_mas: false },
    });
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    expect(await screen.findByText(/No se puede aplicar todavía/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Operaciones que bloquean' })).toHaveTextContent('Caja abierta Caja 1 · abierta');
    expect(screen.queryByRole('button', { name: 'Aplicar cambio' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a revisar' }));
    expect(await screen.findByRole('button', { name: 'Aplicar cambio' })).toBeInTheDocument();
    expect(apiMock.preflightBusinessTransition).toHaveBeenCalledTimes(2);
    expect(apiMock.applyBusinessTransition).not.toHaveBeenCalled();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('un 409 de versión al aplicar no guarda nada y pide volver a revisar con una llave nueva', async () => {
    const user = userEvent.setup();
    apiMock.applyBusinessTransition.mockRejectedValueOnce(
      new VaiinillaApiError(409, { code: 'CONFIG_VERSION_CONFLICT', message: 'Versión desactualizada.', details: [{ version_actual: 8 }] }),
    );
    apiMock.preflightBusinessTransition.mockResolvedValueOnce(allowed).mockResolvedValueOnce({ ...allowed, version_actual: 8 });
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/cambió en otra sesión desde la revisión/)).toBeInTheDocument();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Aplicar cambio' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a revisar' }));
    expect(await screen.findByText(/Versión revisada: 8/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    const calls = apiMock.applyBusinessTransition.mock.calls as [string, { version_esperada: number }, string][];
    expect(calls.map(([, body]) => body.version_esperada)).toEqual([7, 8]);
    expect(calls[1]?.[2]).not.toBe(calls[0]?.[2]);
  });

  it('volver a revisar tras un 409 de versión relee lo guardado y no revierte lo que cambió otra sesión', async () => {
    const user = userEvent.setup();
    // Otra sesión quitó el QR mientras este admin revisaba su cambio de entrega en mesa.
    const otraSesion = { ...cafeteria, entrega_requiere_qr: false };
    apiMock.businessSettings.mockResolvedValueOnce(cafeteria).mockResolvedValue(otraSesion);
    apiMock.applyBusinessTransition.mockRejectedValueOnce(
      new VaiinillaApiError(409, { code: 'CONFIG_VERSION_CONFLICT', message: 'Versión desactualizada.', details: [{ version_actual: 8 }] }),
    );
    apiMock.preflightBusinessTransition.mockResolvedValueOnce(allowed).mockResolvedValueOnce({ ...allowed, version_actual: 8 });
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /El cliente elige/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    await user.click(await screen.findByRole('button', { name: 'Volver a revisar' }));
    expect(await screen.findByText(/Versión revisada: 8/)).toBeInTheDocument();
    expect(apiMock.preflightBusinessTransition).toHaveBeenLastCalledWith('tenant-token', { cambios: { entrega_en_espacio: 'ambas' } });
    expect(screen.getByRole('list', { name: 'Cambios de tipo o modo' })).not.toHaveTextContent('Entrega:');
    await user.click(screen.getByRole('button', { name: 'Aplicar cambio' }));
    await waitFor(() => expect(apiMock.applyBusinessTransition).toHaveBeenCalledTimes(2));
    expect(apiMock.applyBusinessTransition.mock.calls[1]?.[1]).toEqual({ version_esperada: 8, cambios: { entrega_en_espacio: 'ambas' } });
  });

  it('un 409 de bloqueo al aplicar lista las operaciones del servidor y no hace PATCH', async () => {
    const user = userEvent.setup();
    apiMock.applyBusinessTransition.mockRejectedValueOnce(
      new VaiinillaApiError(409, {
        code: 'CONFIG_TRANSITION_BLOCKED',
        message: 'La transición está bloqueada.',
        details: [{
          reason_codes: ['OPERATIONS_IN_FLIGHT'],
          bloqueos: [{ code: 'OPEN_ORDERS', count: 2 }],
          operaciones: { items: [{ code: 'OPEN_ORDERS', id: '1', referencia: '41', estado: 'preparando', desde: null, panel: 'pedidos' }], pagina: 1, limite: 20, total: 2, hay_mas: true },
          version_actual: 7,
        }],
      }),
    );
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/El servidor bloqueó el cambio al aplicarlo/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Operaciones que bloquean' })).toHaveTextContent('Pedido abierto 41 · preparando');
    expect(screen.getByText('Y 1 más.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a revisar' })).toBeInTheDocument();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('si el candado sigue ocupado, el error se ve y volver a aplicar usa la misma llave', async () => {
    const user = userEvent.setup();
    apiMock.applyBusinessTransition.mockRejectedValueOnce(
      new VaiinillaApiError(503, { code: 'CONFIG_LOCK_TIMEOUT', message: 'ocupado' }),
    );
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/sigue ocupada después de un reintento/)).toBeInTheDocument();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    const keys = apiMock.applyBusinessTransition.mock.calls.map((call) => call[2] as string);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('un 404 de la revisión se ve y conserva el borrador', async () => {
    const user = userEvent.setup();
    apiMock.preflightBusinessTransition.mockRejectedValueOnce(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Not found' }));
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    expect(await screen.findByText(/todavía no tiene la revisión de cambios de tipo o modo \(404\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Club de pádel/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeEnabled();
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('un 404 al aplicar se ve y permite cancelar sin perder el borrador', async () => {
    const user = userEvent.setup();
    apiMock.applyBusinessTransition.mockRejectedValueOnce(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Not found' }));
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/no tiene el cambio de tipo o modo \(404\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: /Club de pádel/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeEnabled();
  });

  it('al guardar muestra de inmediato lo guardado, sin pasar por los datos viejos', async () => {
    const user = userEvent.setup();
    const padel = { ...cafeteria, tipo: 'padel', entrega_requiere_qr: false, permite_pago_al_final: true, gracia_liberacion_min: 6 };
    apiMock.saveBusinessSettings.mockResolvedValue(padel);
    // La recarga posterior tarda: mientras, la pantalla debe mostrar ya lo guardado.
    apiMock.businessSettings.mockResolvedValueOnce(cafeteria).mockReturnValue(new Promise(() => {}));
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Club de pádel/ }));
    const grace = screen.getByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '6');
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await user.click(await screen.findByRole('button', { name: 'Aplicar cambio' }));
    expect(await screen.findByText(/Flujo guardado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Gracia al terminar un turno (minutos)')).toHaveValue(6);
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', { gracia_liberacion_min: 6 });
  });

  it('personalizar: pagar al final y entregar sin QR da un flujo personalizado', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /Al final, con cuenta abierta/ }));
    await user.click(screen.getByRole('radio', { name: /Entregar sin QR/ }));
    expect(screen.getByText(/es un flujo personalizado/)).toBeInTheDocument();
    expect(screen.getByText('Entrega sin QR en mesa y para llevar')).toBeInTheDocument();
  });

  it('conserva el borrador al cerrar y volver a abrir la hoja', async () => {
    const user = userEvent.setup();
    renderFlow();
    const grace = await screen.findByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '12');
    await user.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    await user.click(screen.getByRole('button', { name: 'Configurar cómo funciona tu tienda' }));
    expect(await screen.findByLabelText('Gracia al terminar un turno (minutos)')).toHaveValue(12);
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('lo que aún no existe sale como Próximamente', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: /Comedor de empresa/ }));
    expect(screen.getByText('Descuenta de la nómina')).toBeInTheDocument();
    expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
  });

  it('elegir solo ciertas horas muestra las franjas, las valida y las guarda ordenadas', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /Solo en ciertas horas/ }));
    expect(screen.getByText('Recibe pedidos solo de 12:00 a 15:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar otra franja' }));
    expect(screen.getByText('Recibe pedidos solo de 12:00 a 15:00 y 18:00 a 20:00')).toBeInTheDocument();
    // Una franja que termina a la misma hora en que empieza bloquea el guardado.
    const to = screen.getByLabelText('Franja 2: hasta');
    fireEvent.change(to, { target: { value: '18:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('distinta de la inicial');
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
    fireEvent.change(to, { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith(
        'tenant-token',
        expect.objectContaining({
          franjas_pedido: [
            { desde: '12:00', hasta: '15:00' },
            { desde: '18:00', hasta: '20:00' },
          ],
        }),
      ),
    );
  });

  it('volver a "a cualquier hora" quita las franjas', async () => {
    const user = userEvent.setup();
    apiMock.businessSettings.mockResolvedValue({ ...cafeteria, franjas_pedido: [{ desde: '12:00', hasta: '15:00' }] });
    renderFlow();
    await screen.findByLabelText('Franja 1: desde');
    await user.click(screen.getByRole('radio', { name: /A cualquier hora/ }));
    expect(screen.queryByLabelText('Franja 1: desde')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith(
        'tenant-token',
        expect.objectContaining({ franjas_pedido: [] }),
      ),
    );
  });

  it('una gracia fuera de 0 a 60 no se puede guardar', async () => {
    const user = userEvent.setup();
    renderFlow();
    const grace = await screen.findByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '90');
    expect(screen.getByText(/entero de 0 a 60/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeDisabled();
  });

  it('no ofrece hoteles', async () => {
    renderFlow();
    await screen.findByText('Cine, estadio o evento');
    expect(screen.queryByText(/hotel/i)).not.toBeInTheDocument();
  });

  it('muestra el error si el negocio tiene un tipo desconocido', async () => {
    apiMock.businessSettings.mockResolvedValue({ ...cafeteria, tipo: 'otro' });
    renderFlow();
    expect(await screen.findByText(/tipo que esta pantalla no conoce/)).toBeInTheDocument();
  });

  it('oculto del directorio por defecto; activarlo se guarda solo y la tienda trae su QR', async () => {
    apiMock.businessSettings.mockResolvedValue({
      ...cafeteria,
      visible_en_directorio: false,
      tienda_url: 'https://vaiinilla.app/e/cafeteria-centro',
    });
    apiMock.saveBusinessSettings.mockResolvedValue({
      ...cafeteria,
      visible_en_directorio: true,
      tienda_url: 'https://vaiinilla.app/e/cafeteria-centro',
    });
    const user = userEvent.setup();
    renderFlow();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar dónde te encuentran' }));

    const hidden = await screen.findByRole('radio', { name: /Solo con QR o código/ });
    expect(hidden).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('https://vaiinilla.app/e/cafeteria-centro')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /También en la lista de Vaiinilla/ }));
    await waitFor(() =>
      expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('tenant-token', { visible_en_directorio: true }),
    );
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /También en la lista de Vaiinilla/ })).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('un error de franjas no borra lo que ya se capturó en el formulario', async () => {
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /Solo en ciertas horas/ }));
    const grace = screen.getByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '10');
    fireEvent.change(screen.getByLabelText('Franja 1: hasta'), { target: { value: '12:00' } });
    expect(screen.getByRole('alert')).toHaveTextContent('distinta de la inicial');
    expect(screen.getByLabelText('Gracia al terminar un turno (minutos)')).toHaveValue(10);
    expect(screen.queryByText(/entero de 0 a 60/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Franja 1: desde')).toHaveValue('12:00');
    expect(screen.getByLabelText('Franja 1: hasta')).toHaveValue('12:00');
  });

  it('si el servidor rechaza el guardado, el formulario conserva lo capturado', async () => {
    const user = userEvent.setup();
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('Las franjas no pueden empalmarse.'));
    renderFlow();
    await user.click(await screen.findByRole('radio', { name: /Solo en ciertas horas/ }));
    const grace = screen.getByLabelText('Gracia al terminar un turno (minutos)');
    await user.clear(grace);
    await user.type(grace, '10');
    await user.click(screen.getByRole('button', { name: 'Guardar flujo' }));
    expect(await screen.findByText('Las franjas no pueden empalmarse.')).toBeInTheDocument();
    expect(screen.getByLabelText('Gracia al terminar un turno (minutos)')).toHaveValue(10);
    expect(screen.getByLabelText('Franja 1: desde')).toHaveValue('12:00');
    expect(screen.getByLabelText('Franja 1: hasta')).toHaveValue('15:00');
    expect(screen.getByRole('button', { name: 'Guardar flujo' })).toBeEnabled();
  });
});
