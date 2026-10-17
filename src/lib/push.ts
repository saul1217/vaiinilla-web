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

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    // El worker no pasa por Vite, así que la configuración se le entrega aquí.
    const listo = await navigator.serviceWorker.ready;
    listo.active?.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const token = await getToken(getMessaging(app), {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return 'error';

    await api.registerDevice(sessionToken, token);
    tokenActual = token;
    return 'ok';
  } catch (error) {
    console.warn('[push] no se pudo activar:', error);
    return 'error';
  }
}

/** Baja del token al cerrar sesión. Silencioso: tampoco debe romper el logout. */
export async function disablePush(sessionToken: string): Promise<void> {
  if (!tokenActual) return;
  try {
    await api.unregisterDevice(sessionToken, tokenActual);
  } catch (error) {
    console.warn('[push] no se pudo dar de baja el token:', error);
  } finally {
    tokenActual = null;
  }
}
