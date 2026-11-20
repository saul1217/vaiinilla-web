// El contrato (contrato/openapi.json) y cómo buscar en él una ruta. Lo usan la revisión del
// código (revisar.mjs) y la de cada petición del arnés de botones (trafico.mjs). Sin dependencias.
//
// Este archivo es igual en vaiinilla-expo, vaiinilla-web y vaiinilla_landing.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PREFIJO_API = '/api/v1';

export const contrato = JSON.parse(readFileSync(join(AQUI, 'openapi.json'), 'utf8'));
export const excepciones = existsSync(join(AQUI, 'excepciones.json'))
  ? JSON.parse(readFileSync(join(AQUI, 'excepciones.json'), 'utf8'))
  : [];

export function resolver(esquema) {
  let actual = esquema;
  for (let vueltas = 0; actual && actual.$ref && vueltas < 20; vueltas += 1) {
    actual = actual.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((nodo, parte) => nodo?.[parte], contrato);
  }
  return actual;
}

/** Propiedades de un esquema, juntando allOf/oneOf/anyOf. null si el esquema es libre. */
export function propiedades(esquema) {
  const e = resolver(esquema);
  if (!e || typeof e !== 'object') return null;
  const partes = [...(e.allOf ?? []), ...(e.oneOf ?? []), ...(e.anyOf ?? [])];
  if (partes.length) {
    const juntas = {};
    let libre = false;
    for (const parte of partes) {
      const p = propiedades(parte);
      if (p === null) libre = true;
      else Object.assign(juntas, p);
    }
    if (e.properties) Object.assign(juntas, e.properties);
    return libre && !e.properties ? null : juntas;
  }
  if (e.properties) return e.properties;
  return null;
}

/** El esquema de los elementos de un arreglo, o null. */
export function elementos(esquema) {
  const e = resolver(esquema);
  return e && e.type === 'array' && e.items ? e.items : null;
}

/** El esquema del body que documenta una operación, o null. */
export function cuerpoDe(operacion) {
  return resolver(operacion?.requestBody)?.content?.['application/json']?.schema ?? null;
}

const plantillas = Object.entries(contrato.paths)
  .filter(([ruta]) => ruta.startsWith(`${PREFIJO_API}/`))
  .map(([ruta, operaciones]) => ({ ruta, segmentos: ruta.slice(PREFIJO_API.length + 1).split('/'), operaciones }));

/**
 * Las operaciones que le quedan a una ruta. Los segmentos variables del código llegan como `{}` y
 * casan con cualquier segmento; uno fijo casa con el mismo texto o con un parámetro. Gana la ruta
 * que alinea más variables con parámetros y, después, más segmentos fijos iguales: así
 * `pedidos/semana` es esa ruta y no `pedidos/{id}`. Si empatan varias, se devuelven todas.
 * null si ninguna ruta casa; [{ ruta, operacion: null }] si la ruta existe sin ese método.
 */
export function buscarOperacion(metodo, segmentosCodigo) {
  let mejor = -1;
  let candidatas = [];
  let rutaSinMetodo = null;
  for (const plantilla of plantillas) {
    if (plantilla.segmentos.length !== segmentosCodigo.length) continue;
    let puntaje = 0;
    const casa = plantilla.segmentos.every((s, i) => {
      const c = segmentosCodigo[i];
      if (s.startsWith('{')) {
        if (c === '{}') puntaje += 100;
        return true;
      }
      if (c === s) puntaje += 1;
      return c === '{}' || c === s;
    });
    if (!casa) continue;
    const operacion = plantilla.operaciones[metodo.toLowerCase()];
    if (!operacion) {
      rutaSinMetodo ??= plantilla.ruta;
      continue;
    }
    if (puntaje > mejor) {
      mejor = puntaje;
      candidatas = [];
    }
    if (puntaje === mejor) candidatas.push({ ruta: plantilla.ruta, operacion });
  }
  if (candidatas.length) return candidatas;
  return rutaSinMetodo ? [{ ruta: rutaSinMetodo, operacion: null }] : null;
}
