// Procesos del harness: emulador de Firebase Auth, backend y Vite, cada uno en un puerto libre
// elegido al vuelo. Nada se queda corriendo: detener() mata cada grupo de procesos.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

export async function puertoLibre() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const vivos = new Set();

export function lanzar(nombre, comando, args, { cwd, entorno, dirLogs }) {
  mkdirSync(dirLogs, { recursive: true });
  const log = createWriteStream(join(dirLogs, `${nombre}.log`));
  const hijo = spawn(comando, args, { cwd, env: entorno, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  hijo.stdout.pipe(log);
  hijo.stderr.pipe(log);
  hijo.nombre = nombre;
  vivos.add(hijo);
  hijo.on('exit', () => vivos.delete(hijo));
  return hijo;
}

export async function esperarUrl(url, { hijo, segundos = 90 } = {}) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    if (hijo && hijo.exitCode !== null) {
      throw new Error(`${hijo.nombre} terminó (código ${hijo.exitCode}) antes de responder en ${url}.`);
    }
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Tiempo agotado esperando ${url}.`);
}

export async function detener() {
  const esperas = [];
  for (const hijo of vivos) {
    esperas.push(new Promise((r) => hijo.once('exit', r)));
    try {
      process.kill(-hijo.pid, 'SIGTERM');
    } catch {
      // ya terminó
    }
  }
  const tope = new Promise((r) => setTimeout(r, 8000));
  await Promise.race([Promise.all(esperas), tope]);
  for (const hijo of vivos) {
    try {
      process.kill(-hijo.pid, 'SIGKILL');
    } catch {
      // ya terminó
    }
  }
}

// El emulador de Auth es la identidad real de Firebase en local (sin service account ni red):
// el backend lo verifica con FIREBASE_AUTH_EMULATOR_HOST y la web con connectAuthEmulator.
export function configEmulador(dir, puerto) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'firebase.json'),
    JSON.stringify({ emulators: { auth: { host: '127.0.0.1', port: puerto }, ui: { enabled: false }, singleProjectMode: true } }),
  );
  return dir;
}

export async function crearCuentaEmulador(hostEmulador, proyecto, { uid, email, password, nombre }) {
  const base = `http://${hostEmulador}/identitytoolkit.googleapis.com/v1/projects/${proyecto}`;
  const r = await fetch(`${base}/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, email, password, displayName: nombre, emailVerified: true }),
  });
  if (!r.ok) throw new Error(`Emulador Auth rechazó la cuenta ${email}: ${r.status} ${await r.text()}`);
  return (await r.json()).localId;
}
