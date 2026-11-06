import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),
  getToken: vi.fn(),
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
  isSupported: vi.fn(() => Promise.resolve(true)),
}));

vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid');
vi.stubEnv('VITE_FIREBASE_API_KEY', 'key');
vi.stubEnv('VITE_FIREBASE_APP_ID', 'app');

const { enablePush, releasePush, currentPushToken } = await import('./push');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(() => Promise.resolve({})),
      getRegistration: vi.fn(() => Promise.resolve({})),
    },
  });
  mocks.getToken.mockResolvedValue('fcm-dispositivo');
  mocks.registerDevice.mockResolvedValue(undefined);
  mocks.unregisterDevice.mockResolvedValue(undefined);
});

describe('baja del token push al cerrar sesión', () => {
  it('da de baja el token de este dispositivo con la credencial de quien sale', async () => {
    await enablePush('sesion-A');
    expect(currentPushToken()).toBe('fcm-dispositivo');

    await releasePush('sesion-A');

    expect(mocks.unregisterDevice).toHaveBeenCalledTimes(1);
    expect(mocks.unregisterDevice).toHaveBeenCalledWith('sesion-A', 'fcm-dispositivo');
    expect(currentPushToken()).toBeNull();
  });

  it('al pasar de A a B, ese token queda registrado solo para B', async () => {
    // Modelo del back: UNIQUE (usuario_id, fcm_token).
    const filas = new Set<string>();
    mocks.registerDevice.mockImplementation((sesion: string, fcm: string) => {
      filas.add(`${sesion}|${fcm}`);
      return Promise.resolve();
    });
    mocks.unregisterDevice.mockImplementation((sesion: string, fcm: string) => {
      filas.delete(`${sesion}|${fcm}`);
      return Promise.resolve();
    });

    await enablePush('sesion-A');
    await releasePush('sesion-A');
    await enablePush('sesion-B');

    expect([...filas]).toEqual(['sesion-B|fcm-dispositivo']);
  });

  it('un fallo de red no bloquea el cierre de sesión', async () => {
    await enablePush('sesion-A');
    mocks.unregisterDevice.mockRejectedValue(new Error('sin red'));

    await expect(releasePush('sesion-A')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('sin credencial no llama al back', async () => {
    await releasePush(null);
    expect(mocks.unregisterDevice).not.toHaveBeenCalled();
  });

  it('sin permiso de notificaciones ni token no intenta nada', async () => {
    vi.stubGlobal('Notification', { permission: 'default' });
    await releasePush('sesion-A');
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.unregisterDevice).not.toHaveBeenCalled();
  });
});
