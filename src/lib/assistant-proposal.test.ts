import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { AssistantPartialFailure, AssistantTransitionFailure, applyStep, mergeRecipe, nameKey, parseProposal, proposalSteps, stepErrorMessage, stepKey } from './assistant-proposal';

const apiMock = vi.hoisted(() => ({ businessSettings: vi.fn(), preflightBusinessTransition: vi.fn(), applyBusinessTransition: vi.fn(), saveBusinessSettings: vi.fn(), createInvitation: vi.fn(), createInventorySupply: vi.fn(), listManagedSpaces: vi.fn(), updateSpace: vi.fn(), createSpaceBatch: vi.fn() }));
vi.mock('./api', () => ({ api: apiMock }));

describe('assistant-proposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.businessSettings.mockResolvedValue({ tipo: 'cafeteria', entrega_requiere_qr: true, permite_pago_al_final: false, entrega_en_espacio: 'mesa' });
  });

  it('la llave de un paso es un UUID estable para la misma propuesta y distinta entre propuestas', async () => {
    const a = await stepKey('propuesta-1', 'menu-0');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    await expect(stepKey('propuesta-1', 'menu-0')).resolves.toBe(a);
    await expect(stepKey('propuesta-2', 'menu-0')).resolves.not.toBe(a);
  });

  it('el id de cada paso no depende de qué otras secciones se marcaron', () => {
    const proposal = parseProposal({ cambios: { tipo: 'bar' }, insumos: [{ nombre: 'Sal', unidad: 'kg' }, { nombre: 'Limón', unidad: 'kg' }] })!;
    expect(proposalSteps(proposal, new Set(['insumos'])).map((s) => s.id)).toEqual(['insumos-0', 'insumos-1']);
    expect(proposalSteps(proposal, new Set(['cambios', 'insumos'])).map((s) => s.id)).toEqual(['cambios-0', 'insumos-0', 'insumos-1']);
  });

  it('compara nombres sin acentos ni mayúsculas', () => {
    expect(nameKey('  Limón ')).toBe(nameKey('limon'));
  });

  it('la receta conserva las líneas por opción y las que el asistente no menciona', () => {
    const current = [
      { insumo_id: 1, cantidad: 100, opcion_id: null },
      { insumo_id: 2, cantidad: 1, opcion_id: null },
      { insumo_id: 1, cantidad: 50, opcion_id: 9 },
    ];
    expect(mergeRecipe(current, [{ insumo_id: 1, cantidad: 120 }, { insumo_id: 3, cantidad: 2 }])).toEqual([
      { insumo_id: 2, cantidad: 1, opcion_id: null },
      { insumo_id: 1, cantidad: 50, opcion_id: 9 },
      { insumo_id: 1, cantidad: 120, opcion_id: null },
      { insumo_id: 3, cantidad: 2, opcion_id: null },
    ]);
  });

  it('si el servidor rechaza los ajustes juntos, los guarda uno por uno y dice cuál faltó', async () => {
    apiMock.saveBusinessSettings
      .mockRejectedValueOnce(new VaiinillaApiError(422, { code: 'VALIDATION_ERROR', message: 'Regla cruzada' }))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new VaiinillaApiError(422, { code: 'VALIDATION_ERROR', message: 'No' }));
    const step = { section: 'cambios' as const, label: 'Ajustes', cambios: { gracia_liberacion_min: 9, visible_en_directorio: true } };
    const error = await applyStep('t', step, 'k').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistantPartialFailure);
    expect((error as AssistantPartialFailure).failed).toEqual(['visible_en_directorio']);
    expect(apiMock.saveBusinessSettings).toHaveBeenNthCalledWith(2, 't', { gracia_liberacion_min: 9 });
    expect(apiMock.preflightBusinessTransition).not.toHaveBeenCalled();
  });

  it('sin red no insiste campo por campo', async () => {
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('sin red'));
    await expect(applyStep('t', { section: 'cambios', label: 'Ajustes', cambios: { gracia_liberacion_min: 9 } }, 'k')).rejects.toThrow('sin red');
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledTimes(1);
  });

  it('el tipo y los modos van por preflight y transición, nunca por el PATCH', async () => {
    apiMock.preflightBusinessTransition.mockResolvedValue({ permitido: true, reason_codes: [], bloqueos: [], version_actual: 4, capacidades_resultantes: {} });
    apiMock.applyBusinessTransition.mockResolvedValue({ permitido: true });
    apiMock.saveBusinessSettings.mockResolvedValue({});
    const cambios = { tipo: 'bar', permite_pago_al_final: true, entrega_requiere_qr: true, entrega_en_espacio: 'barra' as const, gracia_liberacion_min: 9 };
    await applyStep('t', { section: 'cambios', label: 'Ajustes', cambios }, 'k');
    // entrega_requiere_qr ya vale true: no abre transición ni viaja en el PATCH.
    const transition = { tipo: 'bar', permite_pago_al_final: true, entrega_en_espacio: 'barra' };
    expect(apiMock.preflightBusinessTransition).toHaveBeenCalledWith('t', { cambios: transition });
    expect(apiMock.applyBusinessTransition).toHaveBeenCalledWith('t', { version_esperada: 4, cambios: transition }, await stepKey('k', 'transicion', '4'));
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledTimes(1);
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('t', { gracia_liberacion_min: 9 });
  });

  it('si la revisión bloquea, guarda lo demás, no aplica la transición y enseña motivos y operaciones', async () => {
    apiMock.preflightBusinessTransition.mockResolvedValue({
      permitido: false,
      reason_codes: ['OPERATIONS_IN_FLIGHT'],
      bloqueos: [{ code: 'OPEN_ORDERS', count: 1, message: 'Hay pedidos abiertos o en curso.' }],
      version_actual: 4,
      capacidades_resultantes: {},
      operaciones: { items: [{ code: 'OPEN_ORDERS', id: '9', referencia: '12', estado: 'preparando', desde: null, panel: 'pedidos' }], pagina: 1, limite: 20, total: 3, hay_mas: true },
    });
    apiMock.saveBusinessSettings.mockResolvedValue({});
    const error = await applyStep('t', { section: 'cambios', label: 'Ajustes', cambios: { tipo: 'bar', gracia_liberacion_min: 9 } }, 'k').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistantTransitionFailure);
    expect(apiMock.applyBusinessTransition).not.toHaveBeenCalled();
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledWith('t', { gracia_liberacion_min: 9 });
    expect(apiMock.saveBusinessSettings.mock.calls.every(([, body]) => !('tipo' in (body as object)))).toBe(true);
    const message = stepErrorMessage(error);
    expect(message).toContain('No se cambió tipo; lo demás sí se guardó.');
    expect(message).toContain('Pedido abierto 12 (preparando) y 2 más');
    expect(message).toContain('Reintentar');
  });

  it('un 409 de versión al aplicar pide volver a revisar; reintentar repite el preflight con otra llave', async () => {
    apiMock.preflightBusinessTransition
      .mockResolvedValueOnce({ permitido: true, reason_codes: [], bloqueos: [], version_actual: 4, capacidades_resultantes: {} })
      .mockResolvedValueOnce({ permitido: true, reason_codes: [], bloqueos: [], version_actual: 5, capacidades_resultantes: {} });
    apiMock.applyBusinessTransition
      .mockRejectedValueOnce(new VaiinillaApiError(409, { code: 'CONFIG_VERSION_CONFLICT', message: 'Versión desactualizada.', details: [{ version_actual: 5 }] }))
      .mockResolvedValueOnce({ permitido: true });
    const step = { section: 'cambios' as const, label: 'Ajustes', cambios: { tipo: 'bar' } };
    const error = await applyStep('t', step, 'k').catch((e: unknown) => e);
    expect(stepErrorMessage(error)).toContain('volver a revisarlo');
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
    await applyStep('t', step, 'k');
    expect(apiMock.preflightBusinessTransition).toHaveBeenCalledTimes(2);
    const [first, second] = apiMock.applyBusinessTransition.mock.calls.map((call) => call[2] as string);
    expect(first).toBe(await stepKey('k', 'transicion', '4'));
    expect(second).toBe(await stepKey('k', 'transicion', '5'));
    expect(apiMock.applyBusinessTransition.mock.calls[1]?.[1]).toEqual({ version_esperada: 5, cambios: { tipo: 'bar' } });
  });

  it('un 404 de la transición se enseña y no cae al PATCH heredado', async () => {
    apiMock.preflightBusinessTransition.mockRejectedValue(new VaiinillaApiError(404, { code: 'NOT_FOUND', message: 'Not found' }));
    const error = await applyStep('t', { section: 'cambios', label: 'Ajustes', cambios: { permite_pago_al_final: true } }, 'k').catch((e: unknown) => e);
    expect(stepErrorMessage(error)).toContain('(404)');
    expect(apiMock.saveBusinessSettings).not.toHaveBeenCalled();
  });

  it('una invitación que ya existía cuenta como hecha', async () => {
    apiMock.createInvitation.mockRejectedValueOnce(new VaiinillaApiError(409, { code: 'INVITATION_PENDING_EXISTS', message: 'Ya' }));
    await expect(applyStep('t', { section: 'personal', label: 'Invitar', invite: { email: 'a@b.mx', rol: 'cajero' } }, 'k')).resolves.toBeUndefined();
  });

  it('a las canchas nuevas sin precio les pone el precio por hora', async () => {
    apiMock.createSpaceBatch.mockResolvedValue({ creados: 2 });
    apiMock.listManagedSpaces.mockResolvedValue([
      { id: 1, nombre: 'Pista 1', tipo: 'cancha', activo: true, precio_hora: null },
      { id: 2, nombre: 'Pista 2', tipo: 'cancha', activo: true, precio_hora: '300.00' },
      { id: 3, nombre: 'Pista 9', tipo: 'cancha', activo: true, precio_hora: null },
    ]);
    apiMock.updateSpace.mockResolvedValue({});
    await applyStep('t', { section: 'espacios', label: 'Pistas', group: { tipo: 'cancha', prefijo: 'Pista', cantidad: 2, precio_hora: '350.00' } }, 'k');
    expect(apiMock.updateSpace).toHaveBeenCalledTimes(1);
    expect(apiMock.updateSpace).toHaveBeenCalledWith('t', 1, { precio_hora: '350.00' }, expect.any(String));
  });
});
