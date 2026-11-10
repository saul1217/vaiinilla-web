import { VaiinillaApiError } from './api-error';
import type {
  BusinessSettings,
  SchoolDayClosure,
  SchoolGuardianRequest,
  SchoolGuardianship,
  SchoolMenuDays,
  SchoolRosterStudent,
  SchoolSettingsInput,
  SchoolStudentRef,
  SchoolStudentRequest,
} from '../types/api';

/*
 * Reglas del admin de Escuela, las mismas que la app de Android
 * (vaiinilla-android domain/school/SchoolAdminModels.kt, data/school/SchoolAdminJson.kt y
 * ui/admin/school/AdminSchoolViewModel.kt).
 */

/** Claves de caché por negocio: la escuela de una tienda no se ve en otra. */
export const schoolKeys = (storeId: string) => ({
  settings: ['escuela', storeId, 'configuracion'] as const,
  menu: ['escuela', storeId, 'menu-dias'] as const,
  reserved: (date: string) => ['escuela', storeId, 'apartados', date] as const,
  catalog: ['escuela', storeId, 'catalogo'] as const,
  roster: ['escuela', storeId, 'padron'] as const,
  guardianRequests: ['escuela', storeId, 'solicitudes-tutela'] as const,
  guardianships: (query: string) => ['escuela', storeId, 'tutores', query] as const,
  studentRequests: ['escuela', storeId, 'solicitudes-alumno'] as const,
});

// region Ajustes

export const MAX_DAYS_AHEAD = 14;

/** Lo que se edita en «Recarga con tarjeta» y «Apartar comida»: todo como texto hasta que se manda. */
export interface SchoolRulesDraft {
  reloadMinimum: string;
  reloadMaximum: string;
  daysAhead: number;
  /** "HH:MM" o vacío (sin hora). */
  orderCutoff: string;
  cancelCutoff: string;
}

/** "50.00" → "50" para el campo; "50.50" se queda. */
export function fieldMoney(server: string | null | undefined): string {
  return (server ?? '').replace(/\.00$/, '');
}

export function rulesDraft(settings: BusinessSettings): SchoolRulesDraft {
  return {
    reloadMinimum: fieldMoney(settings.recarga_minima),
    reloadMaximum: fieldMoney(settings.recarga_maxima),
    daysAhead: settings.dias_adelanto_pedido ?? 0,
    orderCutoff: settings.hora_corte_pedido?.slice(0, 5) ?? '',
    cancelCutoff: settings.hora_corte_cancelacion?.slice(0, 5) ?? '',
  };
}

export function sameRules(a: SchoolRulesDraft, b: SchoolRulesDraft): boolean {
  return (Object.keys(a) as (keyof SchoolRulesDraft)[]).every((key) => a[key] === b[key]);
}

/** Un monto positivo con a lo más dos decimales, en centavos; vacío o inválido, null. */
export function amountCents(text: string): number | null {
  const clean = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null;
  const [pesos = '0', cents = ''] = clean.split('.');
  const value = Number(pesos) * 100 + Number(cents.padEnd(2, '0'));
  return value > 0 ? value : null;
}

/** "50" → "50.00"; vacío o inválido, null. */
export function money(text: string): string | null {
  const cents = amountCents(text);
  if (cents === null) return null;
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function isHour(text: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text);
}

/** El primer problema del borrador, con los textos de Android; null si se puede guardar. */
export function rulesProblem(draft: SchoolRulesDraft): string | null {
  if (!Number.isInteger(draft.daysAhead) || draft.daysAhead < 0 || draft.daysAhead > MAX_DAYS_AHEAD) {
    return `Se aparta de 0 a ${MAX_DAYS_AHEAD} días antes.`;
  }
  for (const hour of [draft.orderCutoff, draft.cancelCutoff]) {
    if (hour.trim() !== '' && !isHour(hour.trim())) return 'Escribe las horas como 08:30.';
  }
  // El servidor siempre tiene un rango: vaciar el campo no lo quita.
  const minimum = amountCents(draft.reloadMinimum);
  if (minimum === null) return 'Escribe el mínimo de recarga como 50 o 50.00.';
  const maximum = amountCents(draft.reloadMaximum);
  if (maximum === null) return 'Escribe el máximo de recarga como 2000.';
  if (minimum > maximum) return 'El mínimo de recarga no puede pasar del máximo.';
  return null;
}

/** El cuerpo de PATCH /establecimiento/configuracion para las reglas; los montos que no son monto no se mandan. */
export function rulesInput(draft: SchoolRulesDraft): SchoolSettingsInput {
  const input: SchoolSettingsInput = {
    dias_adelanto_pedido: draft.daysAhead,
    hora_corte_pedido: draft.orderCutoff.trim() || null,
    hora_corte_cancelacion: draft.cancelCutoff.trim() || null,
  };
  const minimum = money(draft.reloadMinimum);
  const maximum = money(draft.reloadMaximum);
  if (minimum) input.recarga_minima = minimum;
  if (maximum) input.recarga_maxima = maximum;
  return input;
}

export function daysLabel(days: number): string {
  if (days === 0) return 'Solo hoy';
  if (days === 1) return 'Hasta 1 día antes';
  return `Hasta ${days} días antes`;
}

/** La hora que se escribe: solo dígitos y los dos puntos, hasta «HH:MM». */
export function clockInput(raw: string): string {
  return raw.replace(/[^\d:]/g, '').slice(0, 5);
}

// endregion

// region Cada día

/** Suma días a una fecha "AAAA-MM-DD" sin pasar por la zona del navegador. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y!, m! - 1, d! + days));
  return value.toISOString().slice(0, 10);
}

/** El "hoy" de la escuela, del servidor: "2026-10-21" o "2026-10-21T00:00:00Z" → "2026-10-21". */
export function schoolToday(menu: SchoolMenuDays): string {
  return menu.programacion.hoy.slice(0, 10);
}

/** De hoy a hoy + MAX_DAYS_AHEAD, siempre con las fechas de la escuela, no del reloj del navegador. */
export function stripDates(today: string, daysAhead: number = MAX_DAYS_AHEAD): string[] {
  return Array.from({ length: Math.max(0, daysAhead) + 1 }, (_, index) => addDays(today, index));
}

const SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function weekdayShort(date: string): string {
  return SHORT[weekday(date)]!;
}

export function isWeekend(date: string): boolean {
  const day = weekday(date);
  return day === 0 || day === 6;
}

/** «Hoy», «Mañana» o «Jueves 24». */
export function longLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === addDays(today, 1)) return 'Mañana';
  return `${LONG[weekday(date)]} ${Number(date.slice(8, 10))}`;
}

/** El motivo, si ese día la escuela no da servicio. */
export function closure(menu: SchoolMenuDays, date: string): string | null {
  return menu.sin_servicio.find((day) => day.fecha.slice(0, 10) === date)?.motivo ?? null;
}

/** Lo que se vende ese día; vacío cuando no hay menú y vale el catálogo completo. */
export function dayMenu(menu: SchoolMenuDays, date: string): number[] {
  return [...(menu.dias.find((day) => day.fecha.slice(0, 10) === date)?.producto_ids ?? [])].sort((a, b) => a - b);
}

export function sameIds(a: number[], b: number[]): boolean {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export const REASON_MIN = 3;
export const REASON_MAX = 80;

export function reasonOk(reason: string): boolean {
  const length = reason.trim().length;
  return length >= REASON_MIN && length <= REASON_MAX;
}

/** «$100» o «$100.50». */
export function moneyLabel(amount: string | null | undefined): string {
  return `$${fieldMoney(amount ?? '0.00') || '0'}`;
}

/** «Día cerrado. Se cancelaron 3 apartados y regresaron $100 a su saldo.» */
export function closureSummary(result: SchoolDayClosure): string {
  let text = 'Día cerrado.';
  if (result.cancelados === 0) text += ' No había nada apartado.';
  else if (result.cancelados === 1) text += ` Se canceló 1 apartado y regresaron ${moneyLabel(result.devuelto)} a su saldo.`;
  else text += ` Se cancelaron ${result.cancelados} apartados y regresaron ${moneyLabel(result.devuelto)} a su saldo.`;
  const pending = result.sin_cancelar.length;
  if (pending > 0) text += ` ${pending} no se pudo cancelar: ciérralo otra vez.`;
  return text;
}

export function reservedLabel(orders: number): string {
  if (orders === 0) return 'Nada apartado todavía';
  if (orders === 1) return 'Apartado · 1 pedido';
  return `Apartado · ${orders} pedidos`;
}

/** Lo que dice el aviso de cerrar un día según lo apartado. */
export function closeDayMessage(orders: number): string {
  const what = orders === 0 ? 'No hay nada apartado.'
    : orders === 1 ? 'Se cancela 1 apartado y el saldo regresa a cada alumno.'
    : `Se cancelan ${orders} apartados y el saldo regresa a cada alumno.`;
  return `${what} Ese día ya no se podrá apartar. Los tutores ven el motivo.`;
}

export function closeDayTitle(date: string, today: string): string {
  const day = longLabel(date, today).toLowerCase();
  return date === today || date === addDays(today, 1) ? `¿Cerrar ${day}?` : `¿Cerrar el ${day}?`;
}

export function saveMenuLabel(count: number): string {
  return count === 0 ? 'Vender todo el menú este día' : `Guardar menú · ${count}`;
}

// endregion

// region Padrón

export const MAX_ROSTER = 5000;

export interface RosterProblem {
  /** 0 cuando no es de una línea (la lista completa). */
  line: number;
  reason: string;
}

export interface RosterParse {
  students: SchoolRosterStudent[];
  problems: RosterProblem[];
}

export function problemText(problem: RosterProblem): string {
  return problem.line > 0 ? `Línea ${problem.line}: ${problem.reason}` : problem.reason.charAt(0).toUpperCase() + problem.reason.slice(1);
}

/** Solo se guarda una lista limpia: algo leído y ningún problema. */
export function canSaveRoster(result: RosterParse): boolean {
  return result.students.length > 0 && result.problems.length === 0;
}

function splitLine(line: string): string[] {
  const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
  return line.split(separator).map((column) => column.trim());
}

/**
 * Lo que la administración pega desde su hoja de cálculo: una línea por alumno, «matrícula, nombre, grupo»,
 * separado por tabulador (como sale de Excel), coma o punto y coma. Lo que no se pudo leer se dice por línea.
 */
export function parseRoster(text: string): RosterParse {
  const students: SchoolRosterStudent[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const columns = splitLine(line);
    const id = (columns[0] ?? '').toUpperCase();
    // El encabezado de la hoja («Matrícula, Nombre, Grupo») no es un alumno.
    if (students.length === 0 && problems.length === 0 && id.toLowerCase().startsWith('matr')) return;
    const name = columns[1] || null;
    const group = columns[2] || null;
    const number = index + 1;
    if (!id) problems.push({ line: number, reason: 'sin matrícula' });
    else if (id.length > 64 || (name?.length ?? 0) > 120 || (group?.length ?? 0) > 40) problems.push({ line: number, reason: 'texto demasiado largo' });
    else if (seen.has(id)) problems.push({ line: number, reason: 'matrícula repetida' });
    else {
      seen.add(id);
      students.push({ matricula: id, nombre: name, grupo: group });
    }
  });
  if (students.length > MAX_ROSTER) problems.push({ line: 0, reason: `más de ${MAX_ROSTER} alumnos` });
  return { students, problems };
}

/** «En 3 grupos: 1°A, 2°B, 3°C» (hasta cuatro nombres). */
export function groupsLine(roster: SchoolRosterStudent[]): string | null {
  const groups = [...new Set(roster.map((student) => student.grupo).filter((group): group is string => !!group))].sort();
  if (groups.length === 0) return null;
  const shown = groups.slice(0, 4).join(', ') + (groups.length > 4 ? '…' : '');
  return groups.length === 1 ? `Grupo ${shown}` : `En ${groups.length} grupos: ${shown}`;
}

export function studentsLabel(count: number): string {
  return count === 1 ? '1 alumno' : `${count} alumnos`;
}

export interface RosterDiff {
  removed: number;
  added: number;
  /** Misma matrícula con otro nombre o grupo. */
  updated: number;
}

const rosterId = (student: SchoolRosterStudent) => student.matricula.trim().toUpperCase();

/** Qué cambia al reemplazar el padrón de ahora por la lista nueva, por matrícula. */
export function rosterDiff(current: SchoolRosterStudent[], next: SchoolRosterStudent[]): RosterDiff {
  const before = new Map(current.map((student) => [rosterId(student), student]));
  const after = new Set<string>();
  let added = 0;
  let updated = 0;
  for (const student of next) {
    const id = rosterId(student);
    after.add(id);
    const old = before.get(id);
    if (!old) added += 1;
    else if ((old.nombre ?? null) !== (student.nombre ?? null) || (old.grupo ?? null) !== (student.grupo ?? null)) updated += 1;
  }
  const removed = [...before.keys()].filter((id) => !after.has(id)).length;
  return { removed, added, updated };
}

/** Se confirma antes de reemplazar un padrón que ya tiene alumnos si la lista nueva cambia algo. */
export function rosterNeedsConfirm(current: SchoolRosterStudent[], diff: RosterDiff): boolean {
  return current.length > 0 && (diff.removed > 0 || diff.added > 0 || diff.updated > 0);
}

/** «Se quitan 2, se agregan 1.» y, si aplica, cuántos cambian de nombre o grupo. */
export function rosterDiffMessage(diff: RosterDiff): string {
  let text = `Se quitan ${diff.removed}, se agregan ${diff.added}.`;
  if (diff.updated > 0) text += diff.updated === 1 ? ' 1 cambia de nombre o grupo.' : ` ${diff.updated} cambian de nombre o grupo.`;
  if (diff.removed > 0) text += ' Los hijos ya dados de alta se quedan.';
  return text;
}

export function rosterSavedNotice(count: number): string {
  if (count === 0) return 'Padrón quitado';
  if (count === 1) return 'Padrón guardado: 1 alumno';
  return `Padrón guardado: ${count} alumnos`;
}

// endregion

// region Tutores

export const MIN_SEARCH_LENGTH = 2;

export const personName = (person: { nombre: string | null; email: string | null }) =>
  person.nombre?.trim() || person.email || 'Sin nombre';

export const studentName = (student: SchoolStudentRef) => student.nombre?.trim() || 'Sin nombre';

/** «A-001 · 3°B» o lo que haya. */
export function studentLine(student: SchoolStudentRef): string {
  return [student.matricula, student.grupo].filter((part): part is string => !!part && part.trim() !== '').join(' · ');
}

/** «Ana López · A-001 · 3°B». */
export function studentTitle(student: SchoolStudentRef): string {
  return [studentName(student), studentLine(student)].filter(Boolean).join(' · ');
}

/** Lo que la escuela sabe del alumno; el padrón solo se nombra si la escuela tiene uno. */
export function requestFacts(request: SchoolGuardianRequest, hasRoster: boolean): string {
  const facts: string[] = [];
  if (hasRoster) facts.push(request.en_padron ? 'En el padrón' : 'No está en el padrón');
  facts.push(request.otros_tutores === 0 ? 'Sin otro tutor' : request.otros_tutores === 1 ? 'Ya tiene 1 tutor' : `Ya tiene ${request.otros_tutores} tutores`);
  facts.push(request.alumno.tiene_cuenta ? 'Tiene su propia cuenta' : 'Sin cuenta propia');
  return facts.join(' · ');
}

export function rejectGuardianMessage(request: SchoolGuardianRequest): string {
  const name = studentName(request.alumno);
  return request.alumno.tiene_cuenta
    ? `No verá ni cuidará a ${name}.`
    : `No verá ni cuidará a ${name}. Si nadie más lo cuida, su matrícula queda libre para su verdadero tutor.`;
}

/** Los tutores de cada alumno juntos, en el orden en que llegaron, con el principal primero. */
export function byStudent(rows: SchoolGuardianship[]): SchoolGuardianship[][] {
  const groups = new Map<string, SchoolGuardianship[]>();
  for (const row of rows) {
    const key = row.alumno.usuario_id ?? row.tutela_id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => [...group.filter((row) => row.principal), ...group.filter((row) => !row.principal)]);
}

// endregion

// region Devoluciones y bajas

export const MIN_REJECTION_REASON = 3;

const cents = (amount: string | null) => amountCents(amount ?? '') ?? 0;

export const isRefund = (request: SchoolStudentRequest) => request.tipo === 'devolucion';
export const isCashRefund = (request: SchoolStudentRequest) => isRefund(request) && request.como_devolver === 'efectivo';
export const hasBalance = (request: SchoolStudentRequest) => cents(request.saldo_actual) > 0;
export const balanceChanged = (request: SchoolStudentRequest) => cents(request.saldo_al_pedir) !== cents(request.saldo_actual);

/** Solo los tipos que esta versión conoce. */
export function knownStudentRequests(rows: SchoolStudentRequest[]): SchoolStudentRequest[] {
  return rows.filter((row) => row.tipo === 'devolucion' || row.tipo === 'baja_datos');
}

/** Una devolución necesita saldo; una baja, saldo en cero. */
export function canResolve(request: SchoolStudentRequest): boolean {
  return isRefund(request) ? hasBalance(request) : !hasBalance(request);
}

/** «Devolver $150 en efectivo» o «Borrar sus datos». */
export function studentRequestWhat(request: SchoolStudentRequest): string {
  if (!isRefund(request)) return 'Borrar sus datos';
  const method = request.como_devolver === 'efectivo' ? ' en efectivo' : request.como_devolver === 'transferencia' ? ' por transferencia' : '';
  return `Devolver ${moneyLabel(request.saldo_actual)}${method}`;
}

export function studentRequestWarning(request: SchoolStudentRequest): string | null {
  if (isRefund(request)) {
    if (!hasBalance(request)) return 'Ya no le queda saldo: recházala.';
    if (balanceChanged(request)) return `Al pedirla tenía ${moneyLabel(request.saldo_al_pedir)}; se entrega lo de hoy.`;
    return null;
  }
  return hasBalance(request) ? `Todavía tiene ${moneyLabel(request.saldo_actual)}: primero devuélveselo a su tutor.` : null;
}

export function studentRequestConfirmTitle(request: SchoolStudentRequest): string {
  return isRefund(request)
    ? `¿Ya le entregaste ${moneyLabel(request.saldo_actual)} a ${personName(request.tutor)}?`
    : `¿Dar de baja a ${studentName(request.alumno)}?`;
}

export function studentRequestConfirmMessage(request: SchoolStudentRequest): string {
  if (!isRefund(request)) {
    return 'Deja de estar en la escuela: se apaga su credencial y se borran sus controles, alergias y lo que lo identifica. No se puede deshacer.';
  }
  if (isCashRefund(request)) {
    return 'Sale de la caja abierta y queda en su corte. Su saldo queda en cero; lo que gaste después ya no entra en esta solicitud.';
  }
  return 'Su saldo queda en cero. Si sigue comprando, lo que quede después ya no se le devuelve con esta solicitud.';
}

export function resolvedText(request: SchoolStudentRequest): string {
  const amount = moneyLabel(request.saldo_actual);
  if (!isRefund(request)) return `${studentName(request.alumno)} quedó dado de baja`;
  if (isCashRefund(request)) return `Listo: salieron ${amount} de la caja para ${personName(request.tutor)}`;
  return `Listo: entrega ${amount} a ${personName(request.tutor)}`;
}

// endregion

/** Administración no cobra: este código solo le llega al devolver saldo en efectivo con la caja cerrada. */
export const CASH_SESSION_REQUIRED_TEXT = 'Abre la caja primero: el efectivo se registra en ella.';

const ERROR_TEXTS: Record<string, string> = {
  GUARDIANSHIP_NOT_PENDING: 'Esa solicitud ya se revisó. Actualiza la lista.',
  GUARDIANSHIP_NOT_FOUND: 'Ese tutor ya no cuida a este alumno. Busca otra vez.',
  REQUEST_NOT_PENDING: 'Esa solicitud ya se resolvió. Actualiza la lista.',
  REFUND_BALANCE_FIRST: 'Todavía tiene saldo: primero hay que devolvérselo a su tutor.',
  STUDENT_HAS_ACTIVE_ORDERS: 'Tiene comida por entregar: entrégala o cancélala antes de darlo de baja.',
  REJECTION_REASON_REQUIRED: 'Escribe por qué no procede.',
  DATE_IN_THE_PAST: 'Ese día ya pasó.',
  NO_SERVICE_DAY_NOT_FOUND: 'Ese día ya tenía servicio. Actualiza la pantalla.',
};

/** El texto de un error de la escuela: los códigos conocidos con los textos de Android, lo demás con su mensaje. */
export function schoolErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof VaiinillaApiError) {
    if (error.code === 'CASH_SESSION_REQUIRED') {
      return error.message && error.message !== error.code ? error.message : CASH_SESSION_REQUIRED_TEXT;
    }
    const known = ERROR_TEXTS[error.code];
    if (known) return known;
    if (error.status === 403) return 'No tienes permiso para esta parte de la escuela.';
    return error.message || fallback;
  }
  return fallback;
}
