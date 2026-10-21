# QA-049 · Regresión de interfaz y accesibilidad del panel

Cubre «Reservas de hoy» (`/app/espacios`) y Caja (`/app/pos`). Spec: `e2e/ui-regresion.spec.ts`; Lighthouse: `lighthouserc.cjs`.

## Ejecución
- `E2E_BASE_URL` = preview de Vercel del mismo commit; API de develop; cuentas en `E2E_PASSWORD`, `E2E_ADMIN_EMAIL`, `E2E_CAJERO_EMAIL`.
- Antes de correr, CI siembra el establecimiento con `/dev/test-setup`.
- `npm run test:ui` (capturas, axe, teclado, estados) y `npm run lhci` (con `LHCI_URL`).
- Referencias en `e2e/__screenshots__/`, **solo** generadas en el contenedor fijo de Playwright en CI (`--update-snapshots` ahí, nunca en local).

## Alcance
- Capturas a 390x844 y 1280x800, tema claro. Reloj congelado (`page.clock`), animaciones desactivadas; horas, contadores y folios enmascarados (`[data-qa-volatil]`, `time`, `.status-badge`).
- axe bloquea solo `serious` y `critical`. Excepciones en `e2e/axe-excepciones.json`, cada una con `id` y `ticket`.
- Teclado: Escape cierra el diálogo y devuelve el foco; objetivos ≥ 44 px; sin desbordamiento horizontal a 390 px; estados de carga, vacío y error.
- Lighthouse: accesibilidad ≥ 0.95 y buenas prácticas ≥ 0.9 (error), rendimiento ≥ 0.8 (aviso), CLS ≤ 0.1.

## Condiciones de QA_INTERFAZ_REGRESION para las capturas contra develop
- La tienda de CI tiene horarios, productos y fotos fijos, sembrados por CI y sin edición manual.
- Las capturas esperan a que termine la carga de datos y ocultan horas, contadores y folios.
- Si una corrida falla por los datos de develop y no por la interfaz, se marca como **bloqueada**, no como regresión, y **nunca se actualizan las referencias** en ese caso. El spec salta con `BLOQUEADA` cuando la API no entrega datos o falta la reserva sembrada.

## Pendiente (requiere permisos que el bot no tiene)
Un job en `.github/workflows` que espere el preview, ejecute `/dev/test-setup`, corra `npm run test:ui` en `mcr.microsoft.com/playwright` y `npm run lhci`. Las referencias de capturas deben generarse la primera vez en ese contenedor.
