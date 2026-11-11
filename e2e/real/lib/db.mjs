// Postgres desechable del harness E2E real: crea la base, los roles de Supabase y el rol de
// runtime, aplica TODAS las migraciones del backend desde cero y siembra los datos sintéticos.
// Solo acepta un Postgres local (127.0.0.1/localhost) y bases con el prefijo vtest_e2e_.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const PREFIJO_BASE = 'vtest_e2e_';
export const ROL_RUNTIME = 'vaiinilla_e2e_runtime';

// psql sin las variables PG* del entorno del usuario: la conexión sale solo de la URL.
function entornoPsql() {
  const copia = { ...process.env };
  for (const k of Object.keys(copia)) if (k.startsWith('PG')) delete copia[k];
  return copia;
}

export function urlCon(adminUrl, base, usuario) {
  const u = new URL(adminUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new Error(`El harness solo usa un Postgres local; recibió ${u.hostname}.`);
  }
  u.pathname = `/${base}`;
  if (usuario) {
    u.username = usuario;
    u.password = '';
  }
  return u.toString();
}

export function psql(url, args, { input } = {}) {
  const r = spawnSync('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-q', ...args], {
    encoding: 'utf8',
    env: entornoPsql(),
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'psql falló').trim());
  return r.stdout;
}

function exigirNombre(base) {
  if (!new RegExp(`^${PREFIJO_BASE}[a-z0-9_]{1,40}$`).test(base)) {
    throw new Error(`Nombre de base no permitido para el harness: ${base}`);
  }
}

export function crearBase(adminUrl, base) {
  exigirNombre(base);
  const admin = urlCon(adminUrl, 'postgres');
  psql(admin, ['-c', `DROP DATABASE IF EXISTS ${base} WITH (FORCE)`]);
  psql(admin, [
    '-c',
    `CREATE DATABASE ${base} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`,
  ]);
  // Los roles son del clúster: se crean solo si faltan (otros trabajos los comparten).
  psql(admin, [
    '-c',
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vaiinilla_app') THEN CREATE ROLE vaiinilla_app NOLOGIN NOBYPASSRLS; END IF;
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_RUNTIME}') THEN
         CREATE ROLE ${ROL_RUNTIME} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
       END IF;
     END $$;`,
  ]);
  return urlCon(adminUrl, base);
}

export function aplicarMigraciones(urlBase, dirMigraciones) {
  const archivos = readdirSync(dirMigraciones)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const archivo of archivos) {
    try {
      psql(urlBase, ['-f', join(dirMigraciones, archivo)]);
    } catch (err) {
      throw new Error(`Migración ${archivo} falló: ${err.message}`);
    }
  }
  return archivos.length;
}

// El backend corre con un rol LOGIN sin BYPASSRLS que hereda de vaiinilla_app, como en Supabase
// (vaiinilla_app_login). Así RLS y los grants de las migraciones aplican igual que en producción.
export function prepararRolRuntime(urlBase, base) {
  psql(urlBase, [
    '-c',
    `GRANT vaiinilla_app TO ${ROL_RUNTIME}; GRANT CONNECT ON DATABASE ${base} TO ${ROL_RUNTIME};`,
  ]);
}

export function borrarBase(adminUrl, base) {
  exigirNombre(base);
  psql(urlCon(adminUrl, 'postgres'), ['-c', `DROP DATABASE IF EXISTS ${base} WITH (FORCE)`]);
}
