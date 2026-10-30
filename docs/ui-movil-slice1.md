# UI móvil · Slice 1

Implementación del 30 de octubre de 2026. Alcance: shell, navegación, cabeceras y primitivas. Referencia: `/workspace/vaiinilla-pm/ui-movil/PLAN-REESTRUCTURA.md`, incluida Revisión Tech Lead.

## Decisiones y límites

| Decisión | Fuente | Implementación |
| --- | --- | --- |
| Identidad compacta, título grande y selección fuerte | I01-tablero, L01-oscuro-personal; §2–3 | Una identidad móvil, AppPageHeader, selección tinta/superficie con tokens existentes en ambos temas. |
| Navegación según permisos | Tabla de roles del Slice 1 | Un destino para Mesero/Caja/Cocina. Admin: Inicio/Menú/Pedir/Pedidos y Más con cuatro enlaces reales. Router 5 y guards intactos. |
| Un diálogo responsive | Slice 1, ajustes TL 3–4 | AppSheet compone Modal opt-in con Radix; slots, scroll, tamaños, título como foco inicial y retorno explícito/opener/fallback conectado y visible. |
| Selección por teclado | Slice 1 y guía Refero craft-details | Radios nativos, fieldset/legend, un tab stop, flechas y Home/End; primera migración en filtro de mesas. |
| Sin conexión inferida por polling | AJUSTE TL de cabeceras | En vivo solo con heartbeat existente en Caja/Cocina; el tablero no lo anuncia por el mero éxito del polling. |
| Límites responsive | Slice 1 | Tab bar <768; riel 88 px de 768 a 1023; sidebar 232 px desde 1024. Plataforma conserva su shell. |

Refero devolvió `NO_SUBSCRIPTION`. Se inspeccionaron las referencias iOS proporcionadas y la guía local de craft; no se atribuyen resultados a investigación externa inaccesible.

Las páginas solo migran sus cabeceras. Las hojas operativas de mesa, pago, renta, QR, sesión y editores quedan en sus propietarios actuales para los slices posteriores; este cambio no modifica sus ciclos de vida, drafts o callbacks. No se abrió el tablero de Caja en una nueva hoja, porque ese cambio corresponde al Slice 3 y exige conservar su propietario de consultas. CompactOrderRow, ReceiptSurface, AppFeedback y AppSectionHeader quedan disponibles para esas migraciones.

Se comprobó por diff que router, clientes API, tipos, helpers monetarios y políticas no cambian. Tampoco se alteraron queries, intervalos, invalidaciones, payloads ni handlers operativos inline. Los únicos callbacks nuevos controlan presentación/navegación/foco.

## Archivos

- Shell: `src/components/app-shell.tsx`.
- Primitivas: `ui.tsx`, `app-sheet.tsx`, `app-page-header.tsx`, `segmented-control.tsx`, `compact-order-row.tsx`, `receipt-surface.tsx`, `app-feedback.tsx` en `src/components/`.
- Primera adopción de segmentos y cabecera: `src/components/waiter-board.tsx`.
- Cabeceras: páginas POS, Cocina, Inicio Admin, Pedidos, Menú, Espacios, Cashback, Flujo e Invitaciones.
- Estilos: `src/styles/app-primitives.css`, import en `main.tsx`; retiro de reglas tenant sustituidas en `index.css`; corte del catálogo a una columna ajustado a <360 en `admin-screens.css`.
- Unitarias: shell/UI/tablero/Cocina y nuevas de hoja, cabecera y segmentos.
- E2E: `staff-screens`, `staff-theme`, `ui-regresion`, `panel`, `visual-legibilidad`; fixture/helper `src/test/staff-contrast.ts` actualizado con las hojas y navegación reales. `capturas-r2` conserva escenarios/selectores y solo pierde aserciones de tipos redundantes por ESLint; igual en `invitation-row-menu.test.tsx`.

## Verificación y pendientes

Se ejecutaron `npx tsc -b` (pasa), `npx vitest run` (335 pruebas en 59 archivos, todas pasan), `npx eslint .` y build Vite de producción (pasa). ESLint bajó de 17 a 7 errores existentes: todos en `src/types/api.ts:627` por literales unidos a `string`. Se mantiene el archivo intacto por el límite de contratos; no se desactivó ninguna regla.

Build con dependencias y entorno iguales: HEAD en copia temporal frente a árbol de trabajo, sin cambiar git ni generar dist en el repo. Tamaños gzip (kB):

| Chunk | Antes | Después |
| --- | ---: | ---: |
| JS principal | 99.72 | 100.98 |
| CSS principal | 30.47 | 32.16 |
| POS | 78.31 | 78.57 |
| Cocina | 5.28 | 5.25 |

El incremento corresponde al shell, las primitivas compartidas y sus estilos. Se conservan las rutas lazy, sin dependencias nuevas ni consultas nuevas.

No se ejecutó Chromium/Playwright ni Lighthouse, por instrucción del usuario. No se modificaron baselines. Permanecen pendientes la comparación visual, axe/targets/overflow reales, zoom 200 %, teclado virtual y red/polling en navegador. Los nuevos e2e cubren los cortes de navegación, destinos Admin, persistencia de tema, Tab/Escape y foco de cuenta en ambos temas; están preparados, no certificados como pasados.

Para snapshots sigue aplicando §10: contenedor fijo, preview del commit y datos QA verificados; `E2E_BASE_URL` explícita. Las bases Caja/Reservas deben regenerarse allí. El workflow actual no ejecuta ui-regresion en contenedor fijo: la aceptación visual queda pendiente de esa infraestructura. Los specs con mocks de módulos (`staff-screens`, `capturas-r2`) requieren Vite, no preview compilado. No se amplían artefactos CI con imágenes de sesiones.
