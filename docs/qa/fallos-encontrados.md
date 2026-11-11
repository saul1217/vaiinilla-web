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

## Observaciones para los siguientes PR (no son fallos)

- La fila «Cliente/comensal» de la matriz A no tiene pantallas en esta web: el QR de mesa abre la
  web de compra (`BUYER_PUBLIC_URL`, otro repo) y las apps. Esos escenarios necesitan ese repo en
  el harness o se documentan como N/A con evidencia; no se inventan pantallas aquí.
- Este harness todavía no levanta Super Admin: el contexto de plataforma exige correo verificado y
  TOTP. El emulador lo permite, pero se deja para el PR de BAS y Super Admin (orden de la sección 10).
