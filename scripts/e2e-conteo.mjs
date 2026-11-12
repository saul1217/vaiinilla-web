#!/usr/bin/env node
// Cuadra el manifiesto de escenarios (e2e/real/manifiesto.json) con los tests que Playwright
// lista de verdad en playwright.real.config.ts. Falla (código 1) si:
//   - un test no trae ID «[X-...]» al inicio del título, o un ID se repite;
//   - hay IDs en el manifiesto sin test, o tests sin entrada en el manifiesto;
//   - el spec del manifiesto no es el archivo donde vive el test;
//   - algún test está marcado skip/fixme/only (estático o en el código de e2e/real).
// Con --exigir-minimo además falla si no se alcanzan los mínimos (86 A y 10 C).
// Con --resultados <json> compara contra una corrida real (reporter json): todos los IDs del
// manifiesto deben haberse ejecutado y pasado, sin reintentos.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const exigirMinimo = args.includes('--exigir-minimo');
const iRes = args.indexOf('--resultados');
const archivoResultados = iRes >= 0 ? args[iRes + 1] : null;
const ID = /^\[([AC][A-Z0-9]*(?:-[A-Z0-9]+)+)\]/;

const errores = [];
const manifiesto = JSON.parse(readFileSync(join(RAIZ, 'e2e/real/manifiesto.json'), 'utf8'));

function recorrer(suite, archivo, salida) {
  const file = suite.file ?? archivo;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      salida.push({
        titulo: spec.title,
        archivo: `e2e/real/${spec.file ?? file}`,
        anotaciones: (t.annotations ?? []).map((a) => a.type),
        esperado: t.expectedStatus,
        resultados: t.results ?? [],
      });
    }
  }
  for (const hija of suite.suites ?? []) recorrer(hija, file, salida);
}

function leerReporte(json) {
  const tests = [];
  for (const s of json.suites ?? []) recorrer(s, s.file, tests);
  return tests;
}

function listar() {
  const r = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.real.config.ts', '--list', '--reporter=json'],
    { cwd: RAIZ, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`playwright --list falló:\n${r.stderr || r.stdout}`);
  return leerReporte(JSON.parse(r.stdout));
}

const tests = listar();
const porId = new Map();
for (const t of tests) {
  const m = ID.exec(t.titulo);
  if (!m) {
    errores.push(`Test sin ID de manifiesto: «${t.titulo}» (${t.archivo})`);
    continue;
  }
  if (porId.has(m[1])) errores.push(`ID repetido en los tests: ${m[1]}`);
  if (t.anotaciones.some((a) => ['skip', 'fixme', 'fail'].includes(a)) || t.esperado === 'skipped') {
    errores.push(`${m[1]} está marcado ${t.anotaciones.join(',') || t.esperado}: no cuenta como escenario ejecutable.`);
  }
  porId.set(m[1], t);
}

// Skips dinámicos (test.skip(cond)) o fixme dentro del cuerpo: no aparecen en --list.
for (const archivo of readdirSync(join(RAIZ, 'e2e/real')).filter((f) => f.endsWith('.spec.ts'))) {
  const fuente = readFileSync(join(RAIZ, 'e2e/real', archivo), 'utf8');
  if (/\btest(\.describe)?\.(skip|fixme|only)\s*\(/.test(fuente)) {
    errores.push(`e2e/real/${archivo} usa test.skip/fixme/only: prohibido en los escenarios de aceptación.`);
  }
}

const ids = new Set();
for (const e of manifiesto.escenarios) {
  if (ids.has(e.id)) errores.push(`ID repetido en el manifiesto: ${e.id}`);
  ids.add(e.id);
  if (!e.id.startsWith(`${e.bloque}-`)) errores.push(`${e.id}: el bloque «${e.bloque}» no coincide con el ID.`);
  for (const campo of ['rol', 'tipo', 'precondiciones', 'accion_ui', 'esperado', 'spec', 'modo']) {
    if (!e[campo]) errores.push(`${e.id}: falta «${campo}» en el manifiesto.`);
  }
  const t = porId.get(e.id);
  if (!t) errores.push(`${e.id} está en el manifiesto pero no hay test que lo ejecute.`);
  else if (relative(RAIZ, resolve(RAIZ, t.archivo)) !== e.spec) {
    errores.push(`${e.id}: el manifiesto dice ${e.spec} y el test vive en ${t.archivo}.`);
  }
}
for (const id of porId.keys()) if (!ids.has(id)) errores.push(`${id} tiene test pero no está en el manifiesto.`);

const contar = (clave) =>
  manifiesto.escenarios.reduce((acc, e) => ({ ...acc, [e[clave]]: (acc[e[clave]] ?? 0) + 1 }), {});
const porBloque = contar('bloque');
const A = porBloque.A ?? 0;
const C = porBloque.C ?? 0;

console.log(`Tests listados por Playwright: ${tests.length} · en el manifiesto: ${manifiesto.escenarios.length}`);
console.log(`Por bloque: ${JSON.stringify(porBloque)}`);
console.log(`Por rol:    ${JSON.stringify(contar('rol'))}`);
console.log(`Por tipo:   ${JSON.stringify(contar('tipo'))}`);
const errHumanos = [...new Set(manifiesto.escenarios.map((e) => e.error_humano).filter(Boolean))].sort((a, b) => a - b);
console.log(`Errores humanos cubiertos: ${errHumanos.join(', ') || 'ninguno'}`);
const minimoOk = A >= manifiesto.minimos.A && C >= manifiesto.minimos.C;
console.log(
  `Mínimo de aceptación (A ≥ ${manifiesto.minimos.A}, C ≥ ${manifiesto.minimos.C}): ${minimoOk ? 'CUMPLIDO' : `PENDIENTE (A ${A}, C ${C})`}`,
);
if (exigirMinimo && !minimoOk) errores.push(`No se alcanza el mínimo: A ${A}/${manifiesto.minimos.A}, C ${C}/${manifiesto.minimos.C}.`);

if (archivoResultados) {
  const corrida = leerReporte(JSON.parse(readFileSync(resolve(archivoResultados), 'utf8')));
  const estado = { passed: 0, failed: 0, skipped: 0, timedOut: 0, interrupted: 0 };
  let reintentos = 0;
  const ejecutados = new Map();
  for (const t of corrida) {
    const m = ID.exec(t.titulo);
    const ultimo = t.resultados.at(-1);
    reintentos += Math.max(0, t.resultados.length - 1);
    const s = ultimo?.status ?? 'skipped';
    estado[s] = (estado[s] ?? 0) + 1;
    if (m) ejecutados.set(m[1], s);
  }
  console.log(`Corrida ${archivoResultados}: ${JSON.stringify(estado)} · reintentos ${reintentos}`);
  for (const e of manifiesto.escenarios) {
    const s = ejecutados.get(e.id);
    if (s !== 'passed') errores.push(`${e.id} no pasó en la corrida (${s ?? 'no ejecutado'}).`);
  }
  if (reintentos > 0) errores.push(`La corrida tuvo ${reintentos} reintentos: la aceptación exige cero.`);
}

if (errores.length) {
  console.error(`\nNO CUADRA (${errores.length}):`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nManifiesto y tests cuadran.');
