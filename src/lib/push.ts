// Alta del navegador en las notificaciones push del backend.
//
// El backend ya envía los avisos de staff (llamada de mesa, pedido listo en espacio,
// turno por terminar) a quien tenga un token registrado; aquí solo conseguimos el
// token de este navegador y lo damos de alta con POST /devices.
//
// Complementa, no reemplaza, los avisos del tablero: el sondeo cubre la pestaña
// abierta y esto cubre el resto (pestaña en segundo plano, navegador cerrado,
// teléfono bloqueado), que es donde `new Notification()` no alcanza en móviles.
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { api } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/** Sin clave VAPID no hay suscripción posible; el panel sigue con el sondeo. */
export const pushConfigured = Boolean(vapidKey && firebaseConfig.apiKey && firebaseConfig.appId);

/** El último token dado de alta, para poder darlo de baja al cerrar sesión. */
let tokenActual: string | null = null;

export function currentPushToken(): string | null {
  return tokenActual;
}

/**
 * El worker recibe la configuración en su propia URL, no por postMessage: el
 * navegador lo apaga cuando está inactivo y lo revive para atender el push, y en ese
 * momento no hay página que se la mande. La URL de registro sí sobrevive.
 *
 * Son valores públicos (viajan en el bundle), así que no hay nada que proteger aquí.
 */
function rutaDelWorker(): string {
  const p = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? '',
  });
  return `/firebase-messaging-sw.js?${p.toString()}`;
}

const PREFERENCIA = 'vaiinilla_push_activo';

/**
 * Preferencia del usuario, separada del permiso del navegador: puede tener el
 * permiso concedido y aun así querer las notificaciones apagadas (su día libre, o
 * trabaja con el panel a la vista y no quiere el doble aviso).
 */
export function pushPreferido(): boolean {
  try {
    return window.localStorage.getItem(PREFERENCIA) === 'si';
  } catch {
    return false;
  }
}

function guardarPreferencia(activo: boolean): void {
  try {
    window.localStorage.setItem(PREFERENCIA, activo ? 'si' : 'no');
  } catch {
    // Sin almacenamiento la preferencia dura lo que la pestaña; no es crítico.
  }
}

/**
 * Pide permiso si hace falta, consigue el token y lo registra. Devuelve el estado
 * resultante para que la interfaz pueda explicarlo.
 *
 * Nunca lanza: el push es una mejora, y que falle no debe romper el tablero.
 */
export async function enablePush(
  sessionToken: string,
): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  if (!pushConfigured) return 'unsupported';
  try {
    if (!(await isSupported())) return 'unsupported';
    if (typeof Notification === 'undefined') return 'unsupported';

    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') {
      const respuesta = await Notification.requestPermission();
      if (respuesta !== 'granted') return 'denied';
    }

    const registration = await navigator.serviceWorker.register(rutaDelWorker());

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return 'error';

    await api.registerDevice(sessionToken, token);
    tokenActual = token;
    guardarPreferencia(true);
    return 'ok';
  } catch (error) {
    console.warn('[push] no se pudo activar:', error);
    return 'error';
  }
}

/**
 * Apaga las notificaciones: da de baja el token y recuerda la preferencia.
 *
 * Silencioso por diseño — se usa tanto desde el interruptor como al cerrar sesión, y
 * en ninguno de los dos casos debe romper el flujo. Si el token ya no está en memoria
 * (por ejemplo tras recargar), lo recupera del registro para poder borrarlo.
 */
export async function disablePush(sessionToken: string): Promise<void> {
  guardarPreferencia(false);
  let token = tokenActual;
  if (!token && pushConfigured) {
    try {
      const registration = await navigator.serviceWorker.getRegistration(rutaDelWorker());
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      token = await getToken(getMessaging(app), {
        vapidKey,
        serviceWorkerRegistration: registration ?? undefined,
      });
    } catch {
      token = null;
    }
  }
  if (!token) return;
  try {
    await api.unregisterDevice(sessionToken, token);
  } catch (error) {
    console.warn('[push] no se pudo dar de baja el token:', error);
  } finally {
    tokenActual = null;
  }
}
