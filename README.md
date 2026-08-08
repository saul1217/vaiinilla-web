# Vaiinilla Web

Panel Web de Vaiinilla para dos superficies independientes:

- **VAI-31:** Administración/POS, selección de acceso, invitaciones de personal y sesiones de caja.
- **VAI-32:** Super Admin Web, con autenticación reforzada, resumen global y administración de establecimientos.

La aplicación consume el backend de Vaiinilla; no se conecta directamente a Supabase.

## Requisitos

- Node.js 20 o superior.
- Una aplicación Web registrada en el proyecto Firebase de Vaiinilla.
- El backend disponible en Railway.

## Configuración local

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` como `.env.local` y completa la configuración Web de Firebase:

   ```env
   VITE_API_URL=https://vaiinillaback-development.up.railway.app/api/v1
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

3. Inicia el proyecto:

   ```bash
   npm run dev
   ```

## Rutas principales

| Ruta | Función |
| --- | --- |
| `/acceso` | Inicio de sesión de Administración/POS |
| `/accesos` | Accesos autorizados devueltos por el backend |
| `/app` | Resumen administrativo |
| `/app/invitaciones` | Crear, consultar, revocar y reenviar invitaciones |
| `/app/pos` | Consultar, abrir y cerrar la sesión de caja |
| `/invitaciones/aceptar` | Confirmar identidad y aceptar una invitación recibida por correo |
| `/acceso/verificar` | Procesar el enlace de verificación de correo de Firebase |
| `/acceso/recuperar` | Definir una contraseña nueva desde un enlace de recuperación |
| `/legal/terminos/:version` | Publicar los Términos vigentes |
| `/legal/privacidad/:version` | Publicar el Aviso de privacidad vigente |
| `/plataforma/acceso` | Inicio separado de Super Admin con MFA/TOTP |
| `/plataforma` | Resumen global de la plataforma |
| `/plataforma/establecimientos` | Crear, configurar, suspender y reactivar establecimientos |

## Seguridad

- Firebase conserva únicamente la sesión de identidad del navegador.
- Los tokens de contexto de establecimiento y plataforma viven solo en memoria y se eliminan al cambiar de usuario, cerrar sesión o vencer.
- Administración/POS y Super Admin abren contextos diferentes en el backend; la Web no inventa permisos ni permite elegir roles públicos.
- Las operaciones mutables usan `Idempotency-Key`.
- Super Admin exige que Firebase complete el segundo factor TOTP antes de solicitar el contexto de plataforma.
- El token de invitación se retira inmediatamente de la URL, vive como máximo dos horas en la pestaña actual y se elimina al activar el acceso.

## Alta desde una invitación

La persona invitada no necesita existir previamente en Firebase ni en Supabase. Desde
`/invitaciones/aceptar` puede crear su cuenta, verificar el correo, completar nombre y
consentimiento, y activar la membresía. Si ya tiene cuenta, la misma ruta reutiliza su
identidad y solo pide los pasos que falten. El rol siempre viene firmado por la invitación;
la Web nunca lo deja elegir.

Los documentos de `src/content/legal-documents.ts` permanecen deliberadamente como
`published: false` hasta recibir texto aprobado. Mientras falten, el alta se bloquea y las
rutas legales muestran un estado explícito de documento pendiente.

Para un smoke interno temporal se puede definir
`VITE_ALLOW_UNPUBLISHED_LEGAL_TESTING=true`. La interfaz mostrará un aviso permanente y
habilitará el alta solo para cuentas de prueba. Esta variable debe eliminarse o volver a
`false` antes de abrir la Web a usuarios reales.

## Verificación

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

Las pruebas E2E usan Playwright. Si es la primera ejecución, instala Chromium con `npx playwright install chromium`.

## Publicación

`vercel.json` incluye la reescritura necesaria para que las rutas de React funcionen al recargar en Vercel. Antes del smoke real:

1. Configura las mismas variables `VITE_*` en el proyecto Web.
2. Agrega el dominio local y el dominio publicado a los dominios autorizados de Firebase.
3. En Firebase Authentication → Templates, personaliza la URL de acción del correo de
   verificación como `https://app.vaiinilla.app/acceso/verificar` y la de recuperación
   como `https://app.vaiinilla.app/acceso/recuperar`.
4. Publica los Términos y el Aviso de privacidad aprobados y cambia ambos documentos a
   `published: true`.
5. Configura `APP_PUBLIC_URL=https://app.vaiinilla.app` y agrega el dominio a
   `CORS_ORIGINS` del backend en Railway.
6. Comprueba los flujos reales de alta, acceso, invitaciones, caja, recuperación y TOTP
   con cuentas de prueba antes de abrir el dominio a usuarios.
