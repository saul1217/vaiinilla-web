import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test as base, type Page } from '@playwright/test';
import { CUENTAS, PASSWORD_E2E } from './cuentas.mjs';

export type Cuenta = keyof typeof CUENTAS;

interface Contexto {
  urlWeb: string;
  urlBack: string;
  urlBaseDatos: string;
  uids: Record<Cuenta, string>;
}

function leerContexto(): Contexto {
  const archivo = process.env.E2E_REAL_CONTEXTO;
  if (!archivo) throw new Error('Corre estos escenarios con `npm run e2e:real` (levanta web, backend y Postgres).');
  return JSON.parse(readFileSync(archivo, 'utf8')) as Contexto;
}

export const TENANT_A = 'e2e00000-0000-4000-8000-00000000000a';
export const TENANT_B = 'e2e00000-0000-4000-8000-00000000000b';

/**
 * Lectura independiente de la base DESPUÉS del paso humano (superusuario local, sin pasar por el
 * backend). Nunca se usa para la interacción bajo prueba. Devuelve las filas como objetos.
 */
export function consultar<T = Record<string, unknown>>(sql: string): T[] {
  const { urlBaseDatos } = leerContexto();
  const envuelto = `SELECT coalesce(json_agg(t), '[]'::json) FROM (${sql}) t`;
  const r = spawnSync('psql', [urlBaseDatos, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', envuelto], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || 'psql falló');
  return JSON.parse(r.stdout) as T[];
}

/** Inicia sesión por la pantalla real /acceso (emulador de Firebase Auth + /sesiones/contexto). */
export async function iniciarSesion(page: Page, cuenta: Cuenta) {
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(CUENTAS[cuenta].email);
  await page.getByLabel('Contraseña').fill(PASSWORD_E2E);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/accesos$|\/app/, { timeout: 20_000 });
  if (page.url().endsWith('/accesos')) {
    await page.locator('button.access-card:not(.access-card--skeleton)').first().click();
  }
  await expect(page).toHaveURL(/\/app/);
}

export const test = base;
export { expect };
