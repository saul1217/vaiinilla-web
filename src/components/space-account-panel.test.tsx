import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceAvailability, SpaceSessionDetail } from '../types/api';
import { SpaceAccountPanel } from './space-account-panel';

const apiMock = vi.hoisted(() => ({
  spaceSession: vi.fn(),
  getOrder: vi.fn(),
  collectSpaceAccount: vi.fn(),
  abonarSpaceAccount: vi.fn(),
  releaseSpace: vi.fn(),
  startCounterRental: vi.fn(),
  payCounterRental: vi.fn(),
  cancelCounterRental: vi.fn(),
  catalog: vi.fn(),
  createSessionOrder: vi.fn(),
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
    apiMock.getOrder.mockRejectedValue(new Error('No hay detalle disponible'));
    apiMock.catalog.mockResolvedValue({
      categorias: [],
      productos: [{
        id: 91, categoria_id: 1, estacion_preparacion: 'cocina', nombre: 'Quesadilla',
        descripcion: null, ingredientes: null, alergenos: null, tiempo_estimado_min: 10,
        precio_mostrador: '50.00', precio_digital: '50.00', disponible: true,
        imagen_url: null, grupos_opcion: [],
      }],
    });
    apiMock.createSessionOrder.mockResolvedValue({ id: 'p3', folio: 13 });
  });

  it('permite al mesero crear un pedido para Kikin en la sesión abierta', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        ...openAccount.cuenta!,
        grupos: [
          { etiqueta: 'Kikin', participante_id: 'participant-kikin', pedidos: ['p1'], total: 120, pagado: 0, pendiente: 120 },
          { etiqueta: 'David', participante_id: 'participant-david', pedidos: ['p2'], total: 80.5, pagado: 0, pendiente: 80.5 },
        ],
      },
    });
    render(<SpaceAccountPanel token="staff-token" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'Agregar pedido' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Para' }), 'participant-kikin');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Producto' }), '91');
    await user.click(screen.getByRole('button', { name: 'Agregar producto' }));
    await user.click(screen.getByRole('button', { name: 'Enviar a la cuenta' }));

    await waitFor(() => expect(apiMock.createSessionOrder).toHaveBeenCalledWith(
      'staff-token',
      7,
      expect.objectContaining({ sessionId: 's1', participantId: 'participant-kikin', items: [{ producto_id: 91, cantidad: 1, opcion_ids: [] }] }),
      expect.any(String),
    ));
  });

  it('permite al mesero mandar a la cuenta un pedido general de la sesión', async () => {
    const user = userEvent.setup();
    render(<SpaceAccountPanel token="staff-token" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: 'Agregar pedido' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Producto' }), '91');
    await user.click(screen.getByRole('button', { name: 'Agregar producto' }));
    await user.click(screen.getByRole('button', { name: 'Enviar a la cuenta' }));

    await waitFor(() => expect(apiMock.createSessionOrder).toHaveBeenCalledWith(
      'staff-token',
      7,
      expect.objectContaining({ sessionId: 's1', participantId: null }),
      expect.any(String),
    ));
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
      propina: '0.00',
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
      propina: '0.00',
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

  it('partes iguales: cobra la primera de tres con la terminal', async () => {
    const user = userEvent.setup();
    apiMock.abonarSpaceAccount.mockResolvedValue({
      abono: { id: 'a1', metodo_pago: 'terminal', monto: '66.83', monto_recibido: null, cambio: '0.00' },
      restante: '133.67',
      liquidada: false,
      pedidos_cobrados: 0,
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Partes iguales' }));
    await user.click(within(dialog).getByRole('button', { name: 'Una persona más' }));
    await user.click(within(dialog).getByRole('radio', { name: /Terminal/ }));
    // $200.50 entre 3 = 66.83 (hacia abajo); el último pago cubre el centavo.
    expect(within(dialog).getByText(/Cobra \$66\.83 MXN en la terminal/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() =>
      expect(apiMock.abonarSpaceAccount).toHaveBeenCalledWith('t', 7, {
        metodo: 'terminal',
        modo: 'partes',
        monto: undefined,
        partes: 3,
        montoRecibido: undefined,
        restanteEsperado: '200.50',
        propina: '0.00',
      }),
    );
    expect(await screen.findByText(/Abonado \$66.83.*Falta \$133.67/)).toBeInTheDocument();
  });

  it('por monto en efectivo, con cambio', async () => {
    const user = userEvent.setup();
    apiMock.abonarSpaceAccount.mockResolvedValue({
      abono: { id: 'a1', metodo_pago: 'efectivo', monto: '100.00', monto_recibido: '120.00', cambio: '20.00' },
      restante: '100.50',
      liquidada: false,
      pedidos_cobrados: 0,
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Por monto' }));
    const amount = within(dialog).getByRole('textbox', { name: 'Monto de este pago' });
    await user.clear(amount);
    await user.type(amount, '300.00');
    expect(within(dialog).getByText('Es más de lo que falta.')).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '100.00');
    await user.type(within(dialog).getByRole('textbox', { name: 'Efectivo recibido' }), '120.00');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));

    await waitFor(() =>
      expect(apiMock.abonarSpaceAccount).toHaveBeenCalledWith('t', 7, expect.objectContaining({ modo: 'monto', monto: '100.00', montoRecibido: '120.00' })),
    );
  });

  it('con abonos en curso no se cobra por pedidos y se ve lo abonado', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: { ...openAccount.cuenta!, abonado: 100, restante: 100.5, abonos: [] },
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    expect(await screen.findByText('Abonado')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cobrar cuenta/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Por pedidos' })).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: 'Por monto' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByRole('textbox', { name: 'Monto de este pago' })).toHaveValue('100.50');
  });

  it('cobra la parte de quien dijo "esto lo pago yo"', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: { ...openAccount.cuenta!, pedidos: [order('p1', 11, 120), { ...order('p2', 12, 80.5), pagara: 'Ana' }] },
    });
    apiMock.collectSpaceAccount.mockResolvedValue({ pedidos_cobrados: 1, total: '80.50', metodo_pago: 'terminal', monto_recibido: null, cambio: '0.00', restante: '120.00' });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Paga Ana/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Parte de Ana' }));
    await user.click(within(dialog).getByRole('radio', { name: /Terminal/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cobro' }));

    await waitFor(() =>
      expect(apiMock.collectSpaceAccount).toHaveBeenCalledWith('t', 7, expect.objectContaining({ pedidoIds: ['p2'], totalEsperado: '80.50' })),
    );
  });

  it('agrupa la cuenta por persona con subtotales y el total de la mesa', async () => {
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        ...openAccount.cuenta!,
        grupos: [
          { etiqueta: 'Jesús', participante_id: 'part-jesus', pedidos: ['p1'], total: 120, pagado: 0, pendiente: 120 },
          { etiqueta: 'David', participante_id: 'part-david', pedidos: ['p2'], total: 80.5, pagado: 0, pendiente: 80.5 },
          { etiqueta: 'Miguel', participante_id: 'part-miguel', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
        ],
      },
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    expect(await screen.findByText('JESÚS')).toBeInTheDocument();
    expect(screen.getByText('DAVID')).toBeInTheDocument();
    expect(screen.queryByText('MIGUEL')).not.toBeInTheDocument();
    expect(screen.queryByText(/Subtotal Miguel:/)).not.toBeInTheDocument();
    // Cada pedido bajo su persona aunque el nombre del cliente no coincida con la etiqueta.
    const jesus = screen.getByText('JESÚS').closest('.space-account__group') as HTMLElement;
    const david = screen.getByText('DAVID').closest('.space-account__group') as HTMLElement;
    expect(within(jesus).getByText(/#11/)).toBeInTheDocument();
    expect(within(david).getByText(/#12/)).toBeInTheDocument();
    expect(within(jesus).getAllByText('$120.00 MXN')).toHaveLength(2);
    expect(within(david).getAllByText('$80.50 MXN')).toHaveLength(2);
    expect(within(jesus).getByText(/Subtotal Jesús:/)).toBeInTheDocument();
    expect(within(david).getByText(/Subtotal David:/)).toBeInTheDocument();
    // El total de la mesa se queda igual.
    expect(screen.getAllByLabelText('$200.50 MXN')).toHaveLength(2);
  });

  it('agrupa por id aunque dos pedidos tengan el mismo nombre de cliente', async () => {
    const sameName = (id: string, folio: number, total: number) => ({ ...order(id, folio, total), cliente: { nombre: 'Mismo Nombre' } });
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        pedidos: [sameName('p1', 11, 120), sameName('p2', 12, 80.5)],
        total: 200.5,
        pendiente: 200.5,
        pagado: 0,
        saldada: false,
        grupos: [
          { etiqueta: 'Jesús', participante_id: 'part-jesus', pedidos: ['p1'], total: 120, pagado: 0, pendiente: 120 },
          { etiqueta: 'David', participante_id: 'part-david', pedidos: ['p2'], total: 80.5, pagado: 0, pendiente: 80.5 },
          { etiqueta: 'David R.', participante_id: 'part-david-r', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
          { etiqueta: 'Miguel', participante_id: 'part-miguel', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
        ],
      },
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    const jesus = await screen.findByText('JESÚS').then((el) => el.closest('.space-account__group') as HTMLElement);
    const david = screen.getByText('DAVID').closest('.space-account__group') as HTMLElement;
    expect(within(jesus).getByText(/#11/)).toBeInTheDocument();
    expect(within(jesus).queryByText(/#12/)).toBeNull();
    expect(within(david).getByText(/#12/)).toBeInTheDocument();
    expect(within(david).queryByText(/#11/)).toBeNull();
  });

  it('muestra Persona 1/2 y Pedido general de una sesión cerrada', async () => {
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      sesion: { ...openAccount.sesion!, estado: 'cerrada' },
      cuenta: {
        pedidos: [order('p1', 11, 120), order('p2', 12, 50), order('p3', 13, 30.5)],
        total: 200.5,
        pendiente: 200.5,
        pagado: 0,
        saldada: false,
        grupos: [
          { etiqueta: 'Persona 1', participante_id: null, pedidos: ['p1'], total: 120, pagado: 0, pendiente: 120 },
          { etiqueta: 'Persona 2', participante_id: null, pedidos: ['p2'], total: 50, pagado: 0, pendiente: 50 },
          { etiqueta: 'Pedido general', participante_id: null, pedidos: ['p3'], total: 30.5, pagado: 0, pendiente: 30.5 },
        ],
      },
    });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    expect(await screen.findByText('PERSONA 1')).toBeInTheDocument();
    expect(screen.getByText('PERSONA 2')).toBeInTheDocument();
    expect(screen.getByText('PEDIDO GENERAL')).toBeInTheDocument();
    expect(screen.getByText(/Subtotal Persona 1:/)).toBeInTheDocument();
    expect(screen.getByText(/Subtotal Pedido general:/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('$200.50 MXN')).toHaveLength(2);
  });

  it('sin grupos se ve exactamente como hoy', async () => {
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    expect(await screen.findByText(/#11/)).toBeInTheDocument();
    expect(screen.getByText(/#12/)).toBeInTheDocument();
    expect(screen.queryByText('JESÚS')).toBeNull();
    expect(screen.queryByText(/Subtotal/)).toBeNull();
    expect(screen.queryByText('.space-account__group')).toBeNull();
    expect(screen.getAllByLabelText('$200.50 MXN')).toHaveLength(2);
  });

  it('imprime la cuenta agrupada por persona', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        pedidos: [
          { ...order('p1', 28, 50), items_resumen: '1× Quesadilla' },
          { ...order('p2', 29, 20), items_resumen: '1× Agua' },
          { ...order('p3', 27, 20), items_resumen: '1× Agua' },
        ],
        total: 90,
        pagado: 15,
        pendiente: 75,
        saldada: false,
        grupos: [
          { etiqueta: 'Kikin', participante_id: 'part-kikin', pedidos: ['p1', 'p2'], total: 70, pagado: 0, pendiente: 70 },
          { etiqueta: 'David', participante_id: 'part-david', pedidos: ['p3'], total: 20, pagado: 0, pendiente: 20 },
          { etiqueta: 'Miguel', participante_id: 'part-miguel', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
          { etiqueta: 'David R.', participante_id: 'part-david-r', pedidos: [], total: 0, pagado: 0, pendiente: 0 },
        ],
      },
    });
    const written: string[] = [];
    const fakeDoc = { write: (html: string) => written.push(html), open: vi.fn(), close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: fakeDoc, closed: false } as unknown as Window);
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} businessName="USAGI" />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Imprimir cuenta/ }));
    await waitFor(() => expect(written.length).toBeGreaterThan(1));
    const html = written.at(-1) ?? '';
    expect(html).toContain('<h1>USAGI</h1>');
    expect(html).not.toContain('VAIINILLA');
    expect(html).toContain('USAGI');
    expect(html).toContain('Mesa 7');
    expect(html).toContain('KIKIN');
    expect(html).toContain('DAVID');
    expect(html).toContain('1× Quesadilla');
    expect(html).toContain('1× Agua');
    expect(html).toContain('Subtotal Kikin');
    expect(html).toContain('Subtotal David');
    // Kikin's two backend order ids stay inside the same backend participant group.
    expect(html.match(/#28/g)).toHaveLength(1);
    expect(html.match(/#29/g)).toHaveLength(1);
    expect(html).toContain('<span>TOTAL</span><span class="amount">$90.00</span>');
    expect(html).toContain('<span>PAGADO</span><span class="amount">$15.00</span>');
    expect(html).toContain('<span>POR PAGAR</span><span class="amount">$75.00</span>');
    expect(html).not.toContain('DAVID R.');
    expect(html).not.toContain('MIGUEL');
    expect(html).not.toContain('Subtotal David R.');
    expect(html).not.toContain('Subtotal Miguel');
    expect(html).not.toMatch(/<(?:button|nav|a)(?:\s|>)/i);
    openSpy.mockRestore();
  });

  it('imprime el pedido #30 bajo Kikin cuando el backend entrega su grupo, nunca como pedido general', async () => {
    const user = userEvent.setup();
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        pedidos: [{ ...order('order-30', 30, 140), items_resumen: '1× Quesadilla · 1× Hamburguesa' }],
        total: 140,
        pagado: 0,
        pendiente: 140,
        saldada: false,
        grupos: [
          { etiqueta: 'Kikin', participante_id: '9c42b167-4785-4f6c-ac30-b11ad86c58a6', pedidos: ['order-30'], total: 140, pagado: 0, pendiente: 140 },
        ],
      },
    });
    const written: string[] = [];
    const fakeDoc = { write: (html: string) => written.push(html), open: vi.fn(), close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: fakeDoc, closed: false } as unknown as Window);
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    const kikinGroup = await screen.findByText('KIKIN');
    expect(kikinGroup.closest('.space-account__group')).toHaveTextContent('#30');
    expect(kikinGroup.closest('.space-account__group')).toHaveTextContent('1× Quesadilla · 1× Hamburguesa');
    await user.click(screen.getByRole('button', { name: /Imprimir cuenta/ }));

    await waitFor(() => expect(written.length).toBeGreaterThan(1));
    const html = written.at(-1) ?? '';
    expect(html).toContain('KIKIN');
    expect(html).toContain('Pedido #30');
    expect(html).toContain('1× Quesadilla · 1× Hamburguesa');
    expect(html).not.toContain('PEDIDO GENERAL');
    expect(html).toContain('Subtotal Kikin');
    openSpy.mockRestore();
  });

  it('imprime una cuenta larga con contenido completo y reglas de ajuste para móvil', async () => {
    const user = userEvent.setup();
    const longDescription = 'Producto de temporada con una descripción muy larga para probar que el renglón se envuelve sin recortarse '.repeat(4);
    apiMock.spaceSession.mockResolvedValue({
      ...openAccount,
      cuenta: {
        ...openAccount.cuenta!,
        pedidos: Array.from({ length: 24 }, (_, index) => ({
          ...order(`long-${index}`, index + 1, 12.5),
          items_resumen: index === 23 ? longDescription : `1× Artículo ${index + 1}`,
        })),
        total: 300,
        pendiente: 300,
        pagado: 0,
        grupos: [{ etiqueta: 'Participante con nombre largo de prueba', participante_id: 'p-long', pedidos: Array.from({ length: 24 }, (_, index) => `long-${index}`), total: 300, pendiente: 300, pagado: 0 }],
      },
    });
    const written: string[] = [];
    const fakeDoc = { write: (html: string) => written.push(html), open: vi.fn(), close: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ document: fakeDoc, closed: false } as unknown as Window);
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Imprimir cuenta/ }));

    await waitFor(() => expect(written.length).toBeGreaterThan(1));
    const html = written.at(-1) ?? '';
    expect(html).toContain(longDescription);
    expect(html).toContain('viewport');
    expect(html).toContain('@media screen and (max-width:420px)');
    expect(html).toContain('overflow-wrap:break-word');
    expect(html).toContain('#24');
    expect(html).toContain('$300.00');
    openSpy.mockRestore();
  });

  it('propina del 10 %: el efectivo cubre cuenta más propina y se manda aparte', async () => {
    const user = userEvent.setup();
    apiMock.collectSpaceAccount.mockResolvedValue({ pedidos_cobrados: 2, total: '200.50', metodo_pago: 'efectivo', monto_recibido: '250.00', cambio: '29.45', restante: '0.00', propina: '20.05' });
    render(<SpaceAccountPanel token="t" spaceId={7} availability={undefined} />, { wrapper: TestProvider });

    await user.click(await screen.findByRole('button', { name: /Cobrar cuenta/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '10%' }));
    expect(within(dialog).getByText(/Propina \$20\.05 MXN/)).toBeInTheDocument();
    // 200.50 + 20.05 = 220.55: con 220.00 no alcanza.
    await user.type(within(dialog).getByRole('textbox', { name: 'Efectivo recibido' }), '220.00');
    expect(within(dialog).getByRole('button', { name: 'Confirmar cobro' })).toBeDisabled();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Efectivo recibido' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Efectivo recibido' }), '250.00');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar cobro' }));

    await waitFor(() =>
      expect(apiMock.collectSpaceAccount).toHaveBeenCalledWith('t', 7, expect.objectContaining({ montoRecibido: '250.00', totalEsperado: '200.50', propina: '20.05' })),
    );
  });
});
