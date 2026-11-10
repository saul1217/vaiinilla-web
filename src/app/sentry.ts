import * as Sentry from '@sentry/react';

const SENSITIVE_PARAMS = /([?&#;](?:token|nuevo|access_token|id_token|refresh_token|apiKey|key|email|code)=)[^&#\s"']*/gi;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

/** Quita tokens, `?nuevo=` y correos de una URL o texto. */
export function scrubUrl(value: string): string {
  return value.replace(SENSITIVE_PARAMS, '$1[Filtered]').replace(EMAIL, '[email]');
}

function scrubHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return;
  for (const name of Object.keys(headers)) {
    if (/^(authorization|cookie|set-cookie|x-.*token.*)$/i.test(name)) delete headers[name];
    else headers[name] = scrubUrl(headers[name] ?? '');
  }
}

const FILTERED = '[Filtered]';
/** Claves cuyo valor siempre se oculta, sin importar qué traiga. */
const SENSITIVE_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'secret',
  'cookie',
]);
/** JWT dentro de un texto: el encabezado en base64url de `{"` siempre empieza con eyJ. */
const JWT_IN_TEXT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
/** Valor completo con forma de JWT aunque no empiece con eyJ (segmentos largos para no tocar dominios ni versiones). */
const JWT_WHOLE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
/** `"token": "..."` (o cualquier otra clave sensible) dentro de un texto que no es JSON completo. */
const TOKEN_IN_JSON_TEXT = new RegExp(`("(?:${[...SENSITIVE_KEYS].join('|')})"\\s*:\\s*")(?:[^"\\\\]|\\\\.)*"`, 'gi');
/** Token de dispositivo VILLO dentro de un texto (p. ej. `Bearer villo_...`): 'villo_' + 43 caracteres base64url. */
const VILLO_IN_TEXT = /villo_[A-Za-z0-9_-]{43}/g;
const MAX_DEPTH = 12;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Redacta un texto suelto: tokens `villo_`, JWT, tokens en JSON incrustado, parámetros de URL y correos. */
export function redactString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('villo_') || JWT_WHOLE.test(trimmed)) return FILTERED;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return JSON.stringify(redactDeep(parsed));
    } catch {
      // No es JSON válido: se limpia como texto.
    }
  }
  return scrubUrl(
    value
      .replace(JWT_IN_TEXT, FILTERED)
      .replace(VILLO_IN_TEXT, FILTERED)
      .replace(TOKEN_IN_JSON_TEXT, `$1${FILTERED}"`),
  );
}

/**
 * Recorre objetos y arreglos anidados (y JSON en texto) y cambia por "[Filtered]" los valores de
 * `token`/`access_token` y cualquier texto con forma de token. Modifica en el lugar y conserva lo demás.
 */
export function redactDeep<T>(value: T, depth = 0, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value === 'string') return redactString(value) as T;
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    const list = value as unknown[];
    for (let i = 0; i < list.length; i++) list[i] = redactDeep(list[i], depth + 1, seen);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const v = record[key];
    if (isSensitiveKey(key) && v !== null && v !== undefined && v !== '') record[key] = FILTERED;
    else record[key] = redactDeep(v, depth + 1, seen);
  }
  return value;
}

/** Valor de un parámetro de query: se oculta si la clave es sensible; si no, se limpia como texto (villo_, JWT, correos). */
function redactQueryValue(key: string, value: unknown): unknown {
  let name = key;
  try {
    name = decodeURIComponent(key);
  } catch {
    // Clave mal codificada: se compara tal cual.
  }
  if (isSensitiveKey(name.trim()) && value !== null && value !== undefined && value !== '') return FILTERED;
  return typeof value === 'string' ? redactString(value) : redactDeep(value);
}

type QueryParams = NonNullable<NonNullable<Sentry.ErrorEvent['request']>['query_string']>;

/**
 * Redacta `query_string` en sus tres formas (cadena `a=1&b=2`, objeto `{a: '1'}` o lista de pares
 * `[['a', '1']]`) con las mismas reglas de claves sensibles y valores villo_* o con forma de JWT.
 */
export function redactQueryString(query: QueryParams): QueryParams {
  if (typeof query === 'string') {
    const hasMark = query.startsWith('?');
    const body = hasMark ? query.slice(1) : query;
    const pairs = body.split('&').map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return redactString(pair);
      const key = pair.slice(0, eq);
      return `${key}=${redactQueryValue(key, pair.slice(eq + 1)) as string}`;
    });
    // scrubUrl cubre además los parámetros que ya se tapaban en URLs (nuevo, key, code, email...).
    const out = scrubUrl(`?${pairs.join('&')}`);
    return hasMark ? out : out.slice(1);
  }
  if (Array.isArray(query)) {
    return query.map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return redactDeep(pair);
      const [key, value] = pair;
      return [key, redactQueryValue(String(key), scrubQueryParam(String(key), value))];
    }) as QueryParams;
  }
  if (query && typeof query === 'object') {
    const record = query as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = redactQueryValue(key, scrubQueryParam(key, record[key]));
    }
  }
  return query;
}

/** Aplica a un par suelto las reglas de parámetros de URL (nuevo, key, code, email...) que ya usa scrubUrl. */
function scrubQueryParam(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value;
  // Solo los parámetros de URL; los correos del valor los limpia después redactString.
  const prefix = `?${key}=`;
  return `${prefix}${value}`.replace(SENSITIVE_PARAMS, '$1[Filtered]').slice(prefix.length);
}

export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (event.request.query_string) {
      event.request.query_string = redactQueryString(event.request.query_string);
    }
    delete event.request.cookies;
    // El cuerpo de la petición puede traer contraseñas o datos personales que no son tokens: no se envía.
    delete event.request.data;
    scrubHeaders(event.request.headers);
  }
  delete event.user;
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  if (event.message) event.message = redactString(event.message);
  event.exception?.values?.forEach((ex) => {
    if (ex.value) ex.value = redactString(ex.value);
  });
  redactDeep(event.extra);
  redactDeep(event.contexts);
  redactDeep(event.tags);
  event.breadcrumbs?.forEach((b) => {
    if (b.message) b.message = redactString(b.message);
    redactDeep(b.data);
  });
  return event;
}

export function beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.message) breadcrumb.message = redactString(breadcrumb.message);
  redactDeep(breadcrumb.data);
  return breadcrumb;
}

export function initSentry(dsn: string) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0.02,
    replaysOnErrorSampleRate: 0.5,
    integrations: [Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })],
    beforeSend,
    beforeBreadcrumb,
  });
}
