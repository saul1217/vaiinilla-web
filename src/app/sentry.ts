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
const SENSITIVE_KEYS = new Set(['token', 'access_token']);
/** JWT dentro de un texto: el encabezado en base64url de `{"` siempre empieza con eyJ. */
const JWT_IN_TEXT = /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
/** Valor completo con forma de JWT aunque no empiece con eyJ (segmentos largos para no tocar dominios ni versiones). */
const JWT_WHOLE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
/** `"token": "..."` o `"access_token": "..."` dentro de un texto que no es JSON completo. */
const TOKEN_IN_JSON_TEXT = /("(?:access_)?token"\s*:\s*")(?:[^"\\]|\\.)*"/gi;
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

export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1);
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
