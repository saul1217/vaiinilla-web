import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
}));

vi.mock('./api', () => ({
  api: { registerDevice: mocks.registerDevice, unregisterDevice: mocks.unregisterDevice },
}));
vi.mock('firebase/app', () => ({
  getApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(() => ({})),
}));
vi.mock('firebase/messaging', () => ({
  getMessaging: vi.fn(() => ({})),
  getToken: mocks.getToken,
  deleteToken: mocks.deleteToken,
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid');
vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
vi.stubEnv('VITE_FIREBASE_APP_ID', 'app');

const { syncPushSession } = await import('./push');

const SW_SOURCE = readFileSync('public/firebase-messaging-sw.js', 'utf8');

// Cache Storage falso compartido entre la "página" y el worker.
function fakeCaches(opts: { failOpen?: boolean } = {}) {
  const store = new Map<string, string>();
  return {
    store,
    open: vi.fn(() => {
      if (opts.failOpen) return Promise.reject(new Error('Cache Storage no disponible'));
      return Promise.resolve({
        put: async (key: string, res: Response) => {
          store.set(key, await res.text());
        },
        match: (key: string) => {
          const v = store.get(key);
          return Promise.resolve(
            v === undefined ? undefined : { text: () => Promise.resolve(v) },
          );
        },
      });
    }),
  };
}

/** Evalúa el worker real y devuelve cuántas notificaciones mostró para un push. */
async function pushAlWorker(cachesFalso: ReturnType<typeof fakeCaches>): Promise<number> {
  const showNotification = vi.fn(() => Promise.resolve(undefined));
  let onBackground: ((p: unknown) => Promise<unknown>) | undefined;
  const sandbox = {
    importScripts: () => undefined,
    caches: cachesFalso,
    URL,
    console,
    firebase: {
      initializeApp: () => undefined,
      messaging: () => ({
        onBackgroundMessage: (fn: (p: unknown) => Promise<unknown>) => {
          onBackground = fn;
        },
      }),
    },
    self: {
      location: {
        href: 'https://x.test/firebase-messaging-sw.js?apiKey=k&projectId=p&appId=a&messagingSenderId=m',
      },
      registration: { showNotification },
      addEventListener: () => undefined,
    },
  };
  runInNewContext(SW_SOURCE, sandbox);
  expect(onBackground).toBeTypeOf('function');
  await onBackground!({ data: { alert: 'por_cobrar', folio: '12' } });
  return showNotification.mock.calls.length;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('service worker falla cerrado', () => {
  it('marcador ausente: no muestra contenido', async () => {
    expect(await pushAlWorker(fakeCaches())).toBe(0);
  });

  it('marcador con valor no reconocido: no muestra contenido', async () => {
    const c = fakeCaches();
    c.store.set('/__push-sesion__', 'ON?');
    expect(await pushAlWorker(c)).toBe(0);
  });

  it('error de Cache Storage: no muestra contenido', async () => {
    expect(await pushAlWorker(fakeCaches({ failOpen: true }))).toBe(0);
  });

  it("marcador 'on': muestra el aviso", async () => {
    const c = fakeCaches();
    c.store.set('/__push-sesion__', 'on');
    expect(await pushAlWorker(c)).toBe(1);
  });
});

describe('la página apaga el marcador sin depender del logout', () => {
  async function conPushActivo() {
    const c = fakeCaches();
    vi.stubGlobal('caches', c);
    window.localStorage.setItem('vaiinilla_push_activo', 'si');
    await syncPushSession(true);
    return c;
  }

  it('con sesión válida y push activado, el worker muestra el aviso', async () => {
    const c = await conPushActivo();
    expect(c.store.get('/__push-sesion__')).toBe('on');
    expect(await pushAlWorker(c)).toBe(1);
  });

  it('sesión revocada: la app carga sin sesión y deja el marcador en off', async () => {
    const c = await conPushActivo();
    await syncPushSession(false);
    expect(c.store.get('/__push-sesion__')).toBe('off');
    expect(await pushAlWorker(c)).toBe(0);
  });

  it('logout omitido (pestaña cerrada): al recargar sin sesión no hay avisos', async () => {
    const c = await conPushActivo();
    // Sin releasePush ni disablePush: solo la carga de la app sin sesión.
    await syncPushSession(false);
    expect(await pushAlWorker(c)).toBe(0);
  });

  it('con sesión pero sin push activado en este dispositivo, queda en off', async () => {
    const c = fakeCaches();
    vi.stubGlobal('caches', c);
    await syncPushSession(true);
    expect(c.store.get('/__push-sesion__')).toBe('off');
  });

  it('Cache Storage roto no lanza al sincronizar', async () => {
    vi.stubGlobal('caches', fakeCaches({ failOpen: true }));
    await expect(syncPushSession(false)).resolves.toBeUndefined();
  });
});
