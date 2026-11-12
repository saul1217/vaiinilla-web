#!/usr/bin/env node
// Harness E2E real (P2-a, tanda 3): web (Vite) + backend real + Postgres desechable migrado desde
// cero + emulador de Firebase Auth. Sin page.route ni mocks de API: el navegador habla con el
// backend de verdad y las aserciones finales leen la base con una conexión aparte.
//
// Uso:  E2E_BACK_DIR=/ruta/a/vaiinilla_back npm run e2e:real [-- <args de playwright>]
// Opcionales:
//   E2E_PG_ADMIN_URL   Postgres local con superusuario (por omisión postgres://postgres@127.0.0.1:5432/postgres)
//   E2E_FIREBASE_CMD   comando del emulador (por omisión «npx --yes firebase-tools@14.27.0»)
//   E2E_KEEP_DB=1      no borra la base al terminar (para depurar)
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarMigraciones, borrarBase, crearBase, prepararRolRuntime, psql, ROL_RUNTIME, urlCon } from './lib/db.mjs';
import { configEmulador, crearCuentaEmulador, detener, esperarUrl, lanzar, puertoLibre } from './lib/servicios.mjs';
import { CUENTAS, PASSWORD_E2E, PROYECTO_FIREBASE } from './cuentas.mjs';

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const entrada = process.env;
const BACK_DIR = entrada.E2E_BACK_DIR ? resolve(entrada.E2E_BACK_DIR) : '';
const ADMIN_URL = entrada.E2E_PG_ADMIN_URL || 'postgres://postgres@127.0.0.1:5432/postgres';
const FIREBASE_CMD = (entrada.E2E_FIREBASE_CMD || 'npx --yes firebase-tools@14.27.0').split(' ');
const BASE = `vtest_e2e_${process.pid}`;
const TMP = mkdtempSync(join(tmpdir(), 'vaiinilla-e2e-real-'));
const DIR_LOGS = join(WEB_DIR, 'test-results', 'e2e-real-logs');

function paso(texto) {
  console.log(`[e2e:real] ${texto}`);
}

// Entorno mínimo para los hijos: PATH/HOME y lo que cada servicio necesita, nada más.
function entornoBase() {
  const { PATH, HOME, LANG, TERM, CI } = entrada;
  return Object.fromEntries(Object.entries({ PATH, HOME, LANG, TERM, CI }).filter(([, v]) => v !== undefined));
}

async function main() {
  if (!BACK_DIR || !existsSync(join(BACK_DIR, 'src', 'index.js'))) {
    throw new Error('Define E2E_BACK_DIR con un checkout de vaiinilla_back (por ejemplo el head del PR #257).');
  }
  const dirMigraciones = join(BACK_DIR, 'supabase', 'migrations');
  const [puertoAuth, puertoBack, puertoWeb] = [await puertoLibre(), await puertoLibre(), await puertoLibre()];
  const hostAuth = `127.0.0.1:${puertoAuth}`;
  const urlBack = `http://127.0.0.1:${puertoBack}`;
  const urlWeb = `http://127.0.0.1:${puertoWeb}`;

  paso(`Postgres desechable ${BASE}`);
  const urlBase = crearBase(ADMIN_URL, BASE);
  const t0 = Date.now();
  const migraciones = aplicarMigraciones(urlBase, dirMigraciones);
  prepararRolRuntime(urlBase, BASE);
  paso(`${migraciones} migraciones aplicadas desde cero en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  paso(`Emulador de Firebase Auth en ${hostAuth}`);
  const emulador = lanzar(
    'firebase-auth',
    FIREBASE_CMD[0],
    [...FIREBASE_CMD.slice(1), 'emulators:start', '--only', 'auth', '--project', PROYECTO_FIREBASE],
    { cwd: configEmulador(join(TMP, 'firebase'), puertoAuth), entorno: entornoBase(), dirLogs: DIR_LOGS },
  );
  await esperarUrl(`http://${hostAuth}/`, { hijo: emulador, segundos: 180 });

  const uids = {};
  for (const [clave, cuenta] of Object.entries(CUENTAS)) {
    uids[clave] = await crearCuentaEmulador(hostAuth, PROYECTO_FIREBASE, { ...cuenta, password: PASSWORD_E2E });
  }
  const variables = Object.entries(uids).flatMap(([clave, uid]) => ['-v', `uid_${clave}=${uid}`]);
  psql(urlBase, [...variables, '-f', join(WEB_DIR, 'e2e', 'real', 'seed.sql')]);
  paso(`Seed sintético con ${Object.keys(uids).length} cuentas en el emulador`);

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = (k, type) => Buffer.from(k.export({ type, format: 'pem' })).toString('base64');
  paso(`Backend real (${BACK_DIR}) en ${urlBack}`);
  const backend = lanzar('backend', process.execPath, ['src/index.js'], {
    cwd: BACK_DIR,
    dirLogs: DIR_LOGS,
    entorno: {
      ...entornoBase(),
      NODE_ENV: 'development',
      PORT: String(puertoBack),
      CORS_ORIGINS: urlWeb,
      DATABASE_URL: urlCon(ADMIN_URL, BASE, ROL_RUNTIME),
      VAIINILLA_JWT_PRIVATE_KEY_B64: pem(privateKey, 'pkcs8'),
      VAIINILLA_JWT_PUBLIC_KEY_B64: pem(publicKey, 'spki'),
      QR_TOKEN_SECRET: randomBytes(32).toString('hex'),
      RATE_LIMIT_HASH_KEY: randomBytes(24).toString('hex'),
      FIREBASE_PROJECT_ID: PROYECTO_FIREBASE,
      FIREBASE_AUTH_EMULATOR_HOST: hostAuth,
      APP_PUBLIC_URL: urlWeb,
    },
  });
  await esperarUrl(`${urlBack}/health`, { hijo: backend });

  paso(`Web (Vite dev) en ${urlWeb}`);
  const web = lanzar(
    'web',
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(puertoWeb), '--strictPort'],
    {
      cwd: WEB_DIR,
      dirLogs: DIR_LOGS,
      // Las variables del proceso ganan a .env.development: la web nunca apunta al API remoto.
      entorno: {
        ...entornoBase(),
        VITE_API_URL: `${urlBack}/api/v1`,
        VITE_FIREBASE_API_KEY: 'demo-e2e-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: `${PROYECTO_FIREBASE}.firebaseapp.com`,
        VITE_FIREBASE_PROJECT_ID: PROYECTO_FIREBASE,
        VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
        VITE_FIREBASE_AUTH_EMULATOR_HOST: hostAuth,
        VITE_FIREBASE_VAPID_KEY: '',
        VITE_SENTRY_DSN: '',
      },
    },
  );
  await esperarUrl(urlWeb, { hijo: web });

  const contexto = join(TMP, 'contexto.json');
  writeFileSync(contexto, JSON.stringify({ urlWeb, urlBack, urlBaseDatos: urlBase, uids }));
  paso('Playwright (retries 0, config playwright.real.config.ts)');
  const args = ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.real.config.ts', ...process.argv.slice(2)];
  return new Promise((resolveRun) => {
    const pw = spawn(process.execPath, args, {
      cwd: WEB_DIR,
      stdio: 'inherit',
      env: { ...entornoBase(), E2E_REAL_CONTEXTO: contexto, E2E_REAL_BASE_URL: urlWeb },
    });
    pw.on('exit', (code) => resolveRun(code ?? 1));
  });
}

let codigo = 1;
try {
  codigo = await main();
} catch (err) {
  console.error(`[e2e:real] ${err.message}`);
  console.error(`[e2e:real] Logs de los servicios en ${DIR_LOGS}`);
} finally {
  await detener();
  if (entrada.E2E_KEEP_DB === '1') paso(`Base conservada: ${BASE}`);
  else {
    try {
      borrarBase(ADMIN_URL, BASE);
      paso(`Base ${BASE} borrada`);
    } catch (err) {
      console.error(`[e2e:real] No se pudo borrar ${BASE}: ${err.message}`);
    }
  }
  rmSync(TMP, { recursive: true, force: true });
}
process.exit(codigo);
