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

function scrubData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') data[k] = scrubUrl(v);
  }
}

export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubUrl(`?${event.request.query_string}`).slice(1);
    }
    delete event.request.cookies;
    delete event.request.data;
    scrubHeaders(event.request.headers);
  }
  delete event.user;
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  event.breadcrumbs?.forEach((b) => scrubData(b.data));
  return event;
}

export function beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.message) breadcrumb.message = scrubUrl(breadcrumb.message);
  scrubData(breadcrumb.data);
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
