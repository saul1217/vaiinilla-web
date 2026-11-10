/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID: string;
  /** Clave pública de Web Push. Sin ella el panel no se suscribe a notificaciones. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  /** DSN de Sentry. Sin él, Sentry no se carga. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ALLOW_UNPUBLISHED_LEGAL_TESTING?: string;
  readonly VITE_VILLO_OWNER_SESION_NORMAL?: string;
  /** Habilita pagos parciales con efectivo y terminal para pedidos sueltos en Caja. */
  readonly VITE_POS_MIXED_PAYMENTS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
