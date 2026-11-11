# Registro de fallos E2E de la web (tanda 3)

Registro canónico de los fallos que reproduce un escenario Playwright de la web (sección 11 de
`tanda3-modos.md`). Si un fallo es transversal web/back, la entrada vive aquí y el PR del back
enlaza el ID. Los IDs son correlativos con el registro del back (`vaiinilla_back`,
`docs/qa/fallos-encontrados.md`, que llega a T3-0010 en el PR #257); el siguiente libre aquí es
**T3-0012**. Nunca se borra la reproducción de un fallo pendiente.

## Corridas

### 2026-11-11 · PR 1 de la tanda (harness real, P2-a)

- Web: rama `bot/81-harness-e2e-transicion-modos` sobre `develop` `79174e5`.
- Backend: PR #257, `5ae884e5e4c905c6c87c9d71787c07f7a069d8ff` (`bot/44-villo-tanda2-modos-negocio`).
- Entorno: Node 22.23.4, Playwright 1.62 (Chromium de Playwright), PostgreSQL 17.11 local
  desechable (`vtest_e2e_<pid>`, borrada al terminar), emulador de Firebase Auth de
  firebase-tools 14.27.0.
- Migraciones: 159/159 desde cero en cada corrida (≈38 s). Roles: `anon`, `authenticated`,
  `service_role`, `vaiinilla_app` y el rol LOGIN de runtime `vaiinilla_e2e_runtime` sin BYPASSRLS.
- Comando: `E2E_BACK_DIR=<checkout del back> npm run e2e:real`, luego `npm run e2e:conteo`.
- Resultado: 10 escenarios A declarados, 10 ejecutados, 10 pasados, 0 fallidos, 0 omitidos,
  0 reintentos. Manifiesto y tests cuadran. Mínimo 86 A + 10 C: **pendiente** (A 10, C 0).
- Fallos nuevos: T3-0011. T3-0006 (registrado en el back) queda arreglado aquí.

### 2026-11-11 · W1 (preflight y transición en la web) y pendientes de #163

- Web: rama `bot/84-w1-preflight-transicion-web` sobre `develop` `d0141b1`.
- Backend: PR #257, `5ae884e5e4c905c6c87c9d71787c07f7a069d8ff`.
- Escenarios nuevos: A-CAF-ADM-05, A-CAF-ADM-06 y A-CAF-ADM-07 en `e2e/real/w1-transicion.spec.ts`
  (transición permitida, bloqueo por caja abierta y versión vencida entre dos sesiones).
- Resultado de la corrida (local, NO GitHub Actions): SHA `775ba74500767d20e8283bca9d92d7ffc55db784`,
  2026-11-11, Linux (Ubuntu 24.04), Node 22.23.4, npm 10.9.9, Playwright 1.62.1, PostgreSQL 17.11.
  `E2E_BACK_DIR=<back 5ae884e> npm run e2e:real`: 159 migraciones desde cero (30.4 s), seed
  `e2e/real/seed.sql`, 13/13 pasados, 0 fallidos, 0 reintentos, código de salida 0 (dos corridas
  seguidas, las dos 13/13). `npm run e2e:conteo:aceptacion`: corrida 13 pasados, 0 reintentos;
  falla solo por el mínimo (A 13/86, C 0/10), como debe en un PR intermedio.
- Vitest completo tres veces (`npx vitest run --maxWorkers=2`): 760/760, 760/760 y 758/760. Los dos
  fallos de la tercera son los intermitentes que pidió identificar la revisión de #163:
  `cortes-reporte-page.test.tsx` («presenta los campos del contrato de cortes del backend», no
  encontró el botón `$150.00` a los 1382 ms) y `tenant-dashboard-hotel.test.tsx` («muestra el
  acceso a Hotel…», no encontró el enlace «Hotel» a los 1310 ms). En ambos el `findBy` vence su
  espera de 1 s cuando la máquina va cargada; no tocan nada de este PR. Queda registrado, sin
  cambiar esas pruebas aquí.
- Fallos nuevos: ninguno. T3-0011 queda CERRADO (ver abajo).
- No cubierto por e2e real, con motivo: la aceptación del asistente necesita la respuesta del
  modelo de IA (`POST /establecimiento/asistente`), que no se levanta en local sin una llave real;
  el 503 de candado y el 404 no se pueden provocar sin interceptar la red o manipular la base a
  mitad del paso. Los tres quedan cubiertos por Vitest (`assistant-proposal.test.ts`,
  `store-flow-page.test.tsx`, `api.test.ts`).

## T3-0006 — La configuración E2E de la web mezcla los puertos 5173 y 4173

- Fecha: 2026-11-11
- Tipo de tienda: no aplica (infraestructura de pruebas de la web)
- Rol: no aplica
- SHA/PR detección: web `79174e5` (develop) / revisión de tanda 3 (registrado primero en el back, PR #257)
- Severidad: baja — infraestructura; la corrida local tenía rechazos de conexión en vez de resultados.
- Pasos para reproducir:
  1. En `vaiinilla-web`, correr `npx playwright test` sin `E2E_BASE_URL`.
  2. `playwright.config.ts` levanta Vite en `127.0.0.1:4173`, pero `e2e/ui-regresion.spec.ts:35`,
     `e2e/panel.spec.ts:25` y `e2e/visual-legibilidad.spec.ts:28` usaban `http://127.0.0.1:5173`.
- Resultado esperado: todas las specs usan el servidor que levanta la configuración.
- Resultado obtenido: esas specs apuntaban a un puerto sin servidor (`ECONNREFUSED`).
- Evidencia: lectura del código en `79174e5`.
- Estado: arreglado en el commit `18fd5c3` de esta rama: `e2e/base-url.ts` es la única fuente del
  puerto (`E2E_PORT`, 4173 por omisión) y la config y las tres specs la usan; `E2E_BASE_URL` sigue
  apuntando a un servidor desplegado. Si el CORS del API remoto solo admite 5173, se corre con
  `E2E_PORT=5173` en vez de fijar el puerto en un spec. El harness real usa puertos al azar.

## T3-0011 — El mesero ve «Pagar al final» aunque el negocio no lo permite y el pedido se rechaza

- Fecha: 2026-11-11
- Tipo de tienda: cafeteria (DEV-Cafe Norte, `permite_pago_al_final = false`, valor por omisión)
- Rol: mesero (tenant sintético DEV-Cafe Norte)
- SHA/PR detección: web `0d06a2a` + back `5ae884e` / este PR (escenario A-CAF-MES-01)
- Severidad: media — error recuperable con estado íntegro (el servidor rechaza y no escribe), pero
  la UI induce una acción incorrecta y el mesero no puede enviar el pedido hasta desmarcar.
- Pasos humanos para reproducir:
  1. Caja abre turno en `/app/pos`.
  2. El mesero entra a `/app/pos`, abre «Mesa 3» y pulsa «Nuevo pedido en esta mesa».
  3. Agrega DEV-Chilaquiles, marca «Pagar al final, con la cuenta de la mesa» y pulsa «Enviar pedido».
- Resultado esperado: si el negocio no permite pagar al final, la opción no se ofrece; el pedido se
  envía sin pago diferido. DB: un pedido en Mesa 3.
- Resultado obtenido: la casilla aparece; al enviar, el formulario muestra «Este establecimiento no
  permite pagar al final.» con «Reintentar» y no se crea el pedido (DB sin pedido, estado íntegro).
- Evidencia: corrida del harness del 2026-11-11, trace de Playwright de A-CAF-MES-01 (local,
  datos sintéticos). Causa: `src/components/staff-order-form.tsx` mostraba la casilla con solo
  `destino === 'en_espacio'`, sin mirar `configuracion.permite_pago_al_final`.
- Estado: arreglado en el commit `52f543d` de esta rama (su mensaje lo nombra T3-0007 por error;
  el ID correcto es T3-0011 porque T3-0007 ya existe en el back). La casilla solo se ofrece si el
  negocio no la prohíbe, y si la configuración llega con `false` se desmarca aunque el mesero la
  hubiera tocado. Pruebas: `staff-order-form.test.tsx` (caso T3-0011) y A-CAF-MES-01 en el harness.
- Cierre (PR W1, rama `bot/84-w1-preflight-transicion-web`, pendiente obligatorio de la revisión de
  #163): `enviar()` ya no confía solo en la casilla. Mientras la configuración carga, «Enviar
  pedido» queda deshabilitado y un envío por teclado se bloquea con «Espera un momento: estamos
  cargando la configuración del negocio.». Con la configuración cargada y
  `permite_pago_al_final = false`, el cuerpo nunca lleva `pago_diferido: true`. Si el servidor
  responde `422 PAYMENT_AT_END_NOT_ALLOWED` (`pedidos.service.js`, cambio de ajuste a media
  captura), la UI lo explica, desmarca la casilla y relee la configuración. Si la configuración
  falla (por ejemplo 403), decide el servidor, como antes. Pruebas nuevas en
  `staff-order-form.test.tsx`. **Estado: CERRADO.**

## Observaciones para los siguientes PR (no son fallos)

- **Fila «Cliente/comensal»: N/A en el harness de `vaiinilla-web`** (decisión del Tech Lead del
  11-nov, sección 6 del brief W1). Evidencia en esta web: `src/app/router.tsx` solo tiene rutas
  públicas de acceso, legal, invitaciones, Stripe y `/villo`; todo lo demás es `/app` (tenant con
  `RoleGuard`) o `/plataforma`, y lo que no coincide cae en `NotFoundPage`. No hay `/e/:slug`, ni
  `/:slug/m/:token`, ni carrito, ni `POST /pedidos` de cliente. `store-flow-page` y `menu-page`
  son administración. **Pero la compra web sí existe en otro repo**: el backend arma el QR de mesa
  como `${BUYER_PUBLIC_URL}/${slug}/m/${token}` y el de la tienda como `${BUYER_PUBLIC_URL}/e/${slug}`
  (`vaiinilla_back/src/services/espacios.service.js`, `urlQr` y `urlTienda`), y esas rutas viven
  en `saul1217/vaiinilla_landing` (`src/app/router.tsx:47-63`: `/pedir`, `/e/:slug`,
  `/e/:slug/carrito`, `/:slug/m/:token`, `/cuenta/pedidos`; su README la describe como
  «experiencia de comprador»; `src/lib/api.ts:308` hace `POST /pedidos`). La decisión dice que
  si aparece una superficie web de compra se reabre la fila: queda pendiente de decidir si la fila
  Cliente se cubre sumando la landing al harness o se mantiene fuera.
- Este harness todavía no levanta Super Admin: el contexto de plataforma exige correo verificado y
  TOTP. El emulador lo permite, pero se deja para el PR de BAS y Super Admin (orden de la sección 10).
