import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaiinillaApiError } from './api-error';
import { AssistantPartialFailure, applyStep, mergeRecipe, nameKey, parseProposal, proposalSteps, stepKey } from './assistant-proposal';

const apiMock = vi.hoisted(() => ({ saveBusinessSettings: vi.fn(), createInvitation: vi.fn(), createInventorySupply: vi.fn(), listManagedSpaces: vi.fn(), updateSpace: vi.fn(), createSpaceBatch: vi.fn() }));
vi.mock('./api', () => ({ api: apiMock }));

describe('assistant-proposal', () => {
  beforeEach(() => vi.clearAllMocks());

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
    const step = { section: 'cambios' as const, label: 'Ajustes', cambios: { tipo: 'bar', permite_pago_al_final: true } };
    const error = await applyStep('t', step, 'k').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssistantPartialFailure);
    expect((error as AssistantPartialFailure).failed).toEqual(['permite_pago_al_final']);
    expect(apiMock.saveBusinessSettings).toHaveBeenNthCalledWith(2, 't', { tipo: 'bar' });
  });

  it('sin red no insiste campo por campo', async () => {
    apiMock.saveBusinessSettings.mockRejectedValueOnce(new Error('sin red'));
    await expect(applyStep('t', { section: 'cambios', label: 'Ajustes', cambios: { tipo: 'bar' } }, 'k')).rejects.toThrow('sin red');
    expect(apiMock.saveBusinessSettings).toHaveBeenCalledTimes(1);
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
