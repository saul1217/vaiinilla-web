import { describe, expect, it } from 'vitest';
import { VaiinillaApiError } from './api-error';
import {
  addDays,
  byStudent,
  canResolve,
  canSaveRoster,
  closeDayTitle,
  closure,
  closureSummary,
  dayMenu,
  groupsLine,
  longLabel,
  money,
  parseRoster,
  problemText,
  requestFacts,
  resolvedText,
  rosterDiff,
  rosterDiffMessage,
  rosterNeedsConfirm,
  rulesDraft,
  rulesInput,
  rulesProblem,
  schoolErrorMessage,
  stripDates,
  studentRequestWarning,
  studentRequestWhat,
  weekdayShort,
} from './school-admin';
import { guardianRequestFixture, guardianshipFixture, menuFixture, schoolSettingsFixture, studentRequestFixture } from '../test/school-fixtures';

describe('reglas de la escuela', () => {
  const draft = rulesDraft(schoolSettingsFixture());

  it('el borrador sale de la configuración con los montos como se escriben', () => {
    expect(draft).toEqual({ reloadMinimum: '50', reloadMaximum: '2000', daysAhead: 3, orderCutoff: '09:00', cancelCutoff: '' });
  });

  it('valida días, horas y montos con los textos de Android', () => {
    expect(rulesProblem(draft)).toBeNull();
    expect(rulesProblem({ ...draft, daysAhead: 15 })).toBe('Se aparta de 0 a 14 días antes.');
    expect(rulesProblem({ ...draft, orderCutoff: '9:5' })).toBe('Escribe las horas como 08:30.');
    expect(rulesProblem({ ...draft, reloadMinimum: '' })).toBe('Escribe el mínimo de recarga como 50 o 50.00.');
    expect(rulesProblem({ ...draft, reloadMaximum: 'mil' })).toBe('Escribe el máximo de recarga como 2000.');
    // Como números: como texto, "50" sería mayor que "2000".
    expect(rulesProblem({ ...draft, reloadMinimum: '2500' })).toBe('El mínimo de recarga no puede pasar del máximo.');
  });

  it('manda montos con dos decimales y horas vacías como null', () => {
    expect(money('50')).toBe('50.00');
    expect(money('$1,000.5')).toBe('1000.50');
    expect(money('0')).toBeNull();
    expect(rulesInput(draft)).toEqual({
      dias_adelanto_pedido: 3, hora_corte_pedido: '09:00', hora_corte_cancelacion: null, recarga_minima: '50.00', recarga_maxima: '2000.00',
    });
  });
});

describe('cada día', () => {
  it('arma la tira con las fechas de la escuela aunque cruce de mes', () => {
    const dates = stripDates('2026-11-28', 4);
    expect(dates).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(stripDates('2026-11-10')).toHaveLength(15);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('nombra los días como Android', () => {
    expect(longLabel('2026-11-10', '2026-11-10')).toBe('Hoy');
    expect(longLabel('2026-11-11', '2026-11-10')).toBe('Mañana');
    expect(longLabel('2026-11-12', '2026-11-10')).toBe('Jueves 12');
    expect(weekdayShort('2026-11-15')).toBe('Dom');
    expect(closeDayTitle('2026-11-11', '2026-11-10')).toBe('¿Cerrar mañana?');
    expect(closeDayTitle('2026-11-12', '2026-11-10')).toBe('¿Cerrar el jueves 12?');
  });

  it('lee menú y días cerrados del calendario', () => {
    const menu = menuFixture();
    expect(dayMenu(menu, '2026-11-11')).toEqual([2]);
    expect(dayMenu(menu, '2026-11-10')).toEqual([]);
    expect(closure(menu, '2026-11-12')).toBe('Junta de consejo técnico');
    expect(closure(menu, '2026-11-11')).toBeNull();
  });

  it('resume el cierre de un día', () => {
    expect(closureSummary({ fecha: '2026-11-12', motivo: 'x', cancelados: 0, devuelto: '0.00', sin_cancelar: [] })).toBe('Día cerrado. No había nada apartado.');
    expect(closureSummary({ fecha: '2026-11-12', motivo: 'x', cancelados: 3, devuelto: '100.00', sin_cancelar: [{ pedido_id: 'p' }] }))
      .toBe('Día cerrado. Se cancelaron 3 apartados y regresaron $100 a su saldo. 1 no se pudo cancelar: ciérralo otra vez.');
  });
});

describe('padrón pegado de la hoja de cálculo', () => {
  it('lee tabuladores, comas y punto y coma, y salta el encabezado', () => {
    const result = parseRoster('Matrícula\tNombre\tGrupo\na-001\tAna López\t3°B\nA-002, Beto Ruiz, 2°A\nA-003;Carla;\n');
    expect(result.problems).toEqual([]);
    expect(result.students).toEqual([
      { matricula: 'A-001', nombre: 'Ana López', grupo: '3°B' },
      { matricula: 'A-002', nombre: 'Beto Ruiz', grupo: '2°A' },
      { matricula: 'A-003', nombre: 'Carla', grupo: null },
    ]);
    expect(canSaveRoster(result)).toBe(true);
    expect(groupsLine(result.students)).toBe('En 2 grupos: 2°A, 3°B');
  });

  it('dice por línea lo que no se pudo leer y no deja guardar', () => {
    const result = parseRoster('A-001, Ana\n, Sin matrícula\nA-001, Repetida');
    expect(result.problems.map(problemText)).toEqual(['Línea 2: sin matrícula', 'Línea 3: matrícula repetida']);
    expect(canSaveRoster(result)).toBe(false);
  });
});

describe('tutores', () => {
  it('solo nombra el padrón si la escuela tiene uno', () => {
    expect(requestFacts(guardianRequestFixture(), true)).toBe('No está en el padrón · Sin otro tutor · Sin cuenta propia');
    expect(requestFacts(guardianRequestFixture({ otros_tutores: 2 }), false)).toBe('Ya tiene 2 tutores · Sin cuenta propia');
  });

  it('junta los tutores de cada alumno con el principal primero', () => {
    const second = guardianshipFixture({ tutela_id: 't2', principal: false, tutor: { nombre: 'Mario', email: null } });
    const first = guardianshipFixture({ tutela_id: 't1' });
    const other = guardianshipFixture({ tutela_id: 't3', alumno: { usuario_id: 'u-beto', nombre: 'Beto', matricula: null, grupo: null } });
    expect(byStudent([second, first, other]).map((group) => group.map((row) => row.tutela_id))).toEqual([['t1', 't2'], ['t3']]);
  });
});

describe('devoluciones y bajas', () => {
  it('una devolución en efectivo se entrega con el saldo de hoy', () => {
    const request = studentRequestFixture({ saldo_actual: '120.00' });
    expect(studentRequestWhat(request)).toBe('Devolver $120 en efectivo');
    expect(studentRequestWarning(request)).toBe('Al pedirla tenía $150; se entrega lo de hoy.');
    expect(canResolve(request)).toBe(true);
    expect(resolvedText(request)).toBe('Listo: salieron $120 de la caja para Laura Pérez');
  });

  it('sin saldo no se devuelve y una baja con saldo tampoco se resuelve', () => {
    expect(canResolve(studentRequestFixture({ saldo_actual: '0.00' }))).toBe(false);
    const removal = studentRequestFixture({ tipo: 'baja_datos', como_devolver: null, saldo_actual: '20.00' });
    expect(canResolve(removal)).toBe(false);
    expect(studentRequestWarning(removal)).toBe('Todavía tiene $20: primero devuélveselo a su tutor.');
    expect(resolvedText({ ...removal, saldo_actual: '0.00' })).toBe('Ana Pérez quedó dado de baja');
  });
});

describe('errores de la escuela', () => {
  it('usa los textos de Android para los códigos conocidos', () => {
    expect(schoolErrorMessage(new VaiinillaApiError(409, { code: 'GUARDIANSHIP_NOT_PENDING', message: 'x' }), 'f')).toBe('Esa solicitud ya se revisó. Actualiza la lista.');
    expect(schoolErrorMessage(new VaiinillaApiError(422, { code: 'CASH_SESSION_REQUIRED', message: 'Abre la caja para devolver efectivo: el dinero sale del cajón.' }), 'f'))
      .toBe('Abre la caja para devolver efectivo: el dinero sale del cajón.');
    expect(schoolErrorMessage(new Error('red'), 'No se guardó.')).toBe('No se guardó.');
  });
});

describe('diferencia del padrón', () => {
  const now = [
    { matricula: 'A-001', nombre: 'Ana', grupo: '3°B' },
    { matricula: 'A-002', nombre: 'Beto', grupo: '3°B' },
    { matricula: 'A-003', nombre: 'Caro', grupo: null },
  ];

  it('cuenta por matrícula lo que se quita, se agrega y cambia', () => {
    const diff = rosterDiff(now, [
      { matricula: 'a-001', nombre: 'Ana', grupo: '3°B' },
      { matricula: 'A-003', nombre: 'Caro', grupo: '2°A' },
      { matricula: 'A-004', nombre: null, grupo: null },
    ]);
    expect(diff).toEqual({ removed: 1, added: 1, updated: 1 });
    expect(rosterDiffMessage(diff)).toBe('Se quitan 1, se agregan 1. 1 cambia de nombre o grupo. Los hijos ya dados de alta se quedan.');
    expect(rosterNeedsConfirm(now, diff)).toBe(true);
  });

  it('no confirma la primera lista ni una igual a la de ahora', () => {
    expect(rosterNeedsConfirm([], rosterDiff([], now))).toBe(false);
    expect(rosterNeedsConfirm(now, rosterDiff(now, [...now].reverse()))).toBe(false);
  });

  it('solo agregar también se confirma y no menciona a los hijos', () => {
    const diff = rosterDiff(now, [...now, { matricula: 'A-010', nombre: null, grupo: null }]);
    expect(diff).toEqual({ removed: 0, added: 1, updated: 0 });
    expect(rosterDiffMessage(diff)).toBe('Se quitan 0, se agregan 1.');
    expect(rosterNeedsConfirm(now, diff)).toBe(true);
  });
});
