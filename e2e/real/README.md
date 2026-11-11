# E2E real (tanda 3, P2-a)

Escenarios Playwright que recorren la UI real contra el backend real y un Postgres desechable,
sin `page.route`, sin fixtures de API y sin mocks en el camino bajo prueba.

## Qué levanta `npm run e2e:real`

1. Una base `vtest_e2e_<pid>` en el Postgres local (`E2E_PG_ADMIN_URL`, por omisión
   `postgres://postgres@127.0.0.1:5432/postgres`; solo acepta 127.0.0.1/localhost).
2. Los roles `anon`, `authenticated`, `service_role` y `vaiinilla_app` si faltan, todas las
   migraciones del backend desde cero y el rol LOGIN `vaiinilla_e2e_runtime` (sin BYPASSRLS,
   hereda de `vaiinilla_app`), con el que corre el backend, como en Supabase.
3. El emulador de Firebase Auth (`firebase-tools@14.27.0`) con las cuentas de `cuentas.mjs`.
   Son cuentas que solo existen dentro del emulador.
4. `seed.sql`: dos cafeterías sintéticas (DEV-Cafe Norte y DEV-Cafe Sur), sus personas,
   membresías, menú y mesas. El seed solo prepara; la interacción va por la UI.
5. El backend (`E2E_BACK_DIR/src/index.js`) con llaves RSA generadas al vuelo y
   `FIREBASE_AUTH_EMULATOR_HOST`, y la web en Vite dev con `VITE_API_URL` local y
   `VITE_FIREBASE_AUTH_EMULATOR_HOST` (la web solo usa el emulador en dev y con host local).
6. Playwright con `playwright.real.config.ts`: un worker, **retries 0**, trace al fallar.

Todos los puertos son al azar. Al terminar mata los procesos y borra la base (`E2E_KEEP_DB=1`
la conserva para depurar). Los logs de cada servicio quedan en `test-results/e2e-real-logs/`.

```bash
git clone https://github.com/saul1217/vaiinilla_back ../vaiinilla_back
(cd ../vaiinilla_back && git checkout <sha del PR #257> && npm ci)
npx playwright install chromium
E2E_BACK_DIR=../vaiinilla_back npm run e2e:real
npm run e2e:conteo                 # cuadra manifiesto y tests; falla si no coinciden o si A < 86 o C < 10
npm run e2e:conteo:info            # lo mismo, pero los mínimos solo se reportan (PR intermedio)
npm run e2e:conteo:aceptacion      # además exige que la última corrida pase completa y sin reintentos
```

## Reglas para agregar escenarios

- El título empieza con el ID del manifiesto: `[A-CAF-MES-01] …`. Cada ID va en
  `manifiesto.json` con bloque, rol, tipo, precondiciones, acción UI, resultado esperado, spec y modo.
- Nada de `test.skip`, `fixme`, `only` o `fail`: el conteo los rechaza en cualquier archivo de
  `e2e/real` (búsqueda recursiva). Si una precondición no se cumple, el escenario falla.
- Nada de interceptar la red (`page.route`, `context.route`, `routeFromHAR`, `route.fulfill`,
  `msw`, `setupServer`): el conteo también lo rechaza, en specs, fixtures y `lib/`.
- La base solo se lee al final (`consultar`), nunca para hacer el paso bajo prueba.
- Un fallo encontrado se registra en `docs/qa/fallos-encontrados.md`; no se debilita la aserción.
