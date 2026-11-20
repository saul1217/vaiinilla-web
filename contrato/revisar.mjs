#!/usr/bin/env node
// Revisa que cada llamada de la app al backend exista en el contrato (contrato/openapi.json, copia
// del que exporta vaiinilla_back) y que los campos que manda en el body estén documentados.
//
// Lee el código con el compilador de TypeScript, sin ejecutarlo. Entiende tres formas:
//   client.request('POST', `pedidos/${id}/cobros`, { body: { ... } })   (Expo)
//   request(`/pedidos/${id}`, { method: 'PATCH', body: { ... } })        (web y landing)
//   fetch(`${apiUrl}/pedidos`, { method: 'POST', body: JSON.stringify({ ... }) })
//
// Lo que no puede leer (rutas armadas con variables, bodies que llegan de otra función) lo cuenta
// aparte: no lo da por bueno ni por malo.
//
//   node contrato/revisar.mjs            # sale con 1 si hay diferencias
//   node contrato/revisar.mjs --json     # el detalle completo
//
// Este archivo es igual en vaiinilla-expo, vaiinilla-web y vaiinilla_landing.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { METODOS, excepciones, resolver, propiedades, buscarOperacion } from './esquema.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const require = createRequire(join(RAIZ, 'package.json'));
const ts = require('typescript');

// --- Leer el código --------------------------------------------------------------------------

function archivosFuente(carpeta) {
  const salida = [];
  for (const nombre of readdirSync(carpeta)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosFuente(ruta));
    else if (/\.(ts|tsx)$/.test(nombre) && !/\.(test|spec)\.tsx?$/.test(nombre) && !nombre.endsWith('.d.ts'))
      salida.push(ruta);
  }
  return salida;
}

const texto = (nodo, fuente) => nodo.getText(fuente).replace(/\s+/g, ' ').slice(0, 120);

/** Valor de una cadena del código: literal, plantilla o suma. Las partes variables quedan como {}. */
function leerCadena(nodo, constantes) {
  if (!nodo) return null;
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  if (ts.isTemplateExpression(nodo)) {
    let salida = nodo.head.text;
    for (const tramo of nodo.templateSpans) {
      const interno = leerCadena(tramo.expression, constantes);
      salida += (interno !== null ? interno : '\u0000') + tramo.literal.text;
    }
    return salida;
  }
  if (ts.isBinaryExpression(nodo) && nodo.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = leerCadena(nodo.left, constantes);
    const b = leerCadena(nodo.right, constantes);
    return a === null || b === null ? null : a + b;
  }
  if (ts.isParenthesizedExpression(nodo)) return leerCadena(nodo.expression, constantes);
  if (ts.isIdentifier(nodo) && constantes.has(nodo.text)) return leerCadena(constantes.get(nodo.text), constantes);
  return null;
}

/** De una cadena de ruta a segmentos; la base del API (`${apiUrl}`) y el query se quitan. */
function segmentosDe(cadena) {
  if (cadena === null) return null;
  let ruta = cadena.split('?')[0];
  // Un `${apiUrl}` o `${API}` al principio es la base: lo que importa empieza después.
  ruta = ruta.replace(/^\u0000/, '');
  ruta = ruta.replace(/^https?:\/\/[^/]+/, '').replace(/^\/?api\/v1/, '');
  ruta = ruta.replace(/^\/+|\/+$/g, '');
  if (!ruta || ruta.startsWith('\u0000')) return null;
  return ruta.split('/').map((s) => (s.includes('\u0000') ? '{}' : s));
}

function propiedadDeObjeto(objeto, nombre) {
  if (!objeto || !ts.isObjectLiteralExpression(objeto)) return undefined;
  for (const p of objeto.properties) {
    if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name?.getText() === nombre)
      return ts.isPropertyAssignment(p) ? p.initializer : p.name;
  }
  return undefined;
}

/**
 * Las variables `const x = …` y `let x = …` de un bloque y sus padres, para seguir un
 * identificador. Guarda también la declaración, para buscar después `x.campo = …`.
 */
function constantesVisibles(nodo) {
  const mapa = new Map();
  let actual = nodo;
  while (actual) {
    const sentencias = actual.statements ?? actual.body?.statements;
    if (sentencias) {
      for (const s of sentencias) {
        if (!ts.isVariableStatement(s)) continue;
        for (const d of s.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.initializer && !mapa.has(d.name.text)) {
            mapa.set(d.name.text, d.initializer);
            declaraciones.set(d.initializer, actual);
          }
        }
      }
    }
    actual = actual.parent;
  }
  return mapa;
}

// Para cada valor inicial de una variable, el bloque donde se declaró.
const declaraciones = new WeakMap();

// Todas las funciones del proyecto por nombre: `function f() {}` y `const f = () => …`.
const funciones = new Map();
function indexarFunciones(fuente) {
  const visitar = (nodo) => {
    if (ts.isFunctionDeclaration(nodo) && nodo.name && nodo.body) agregar(nodo.name.text, nodo);
    if (
      ts.isVariableDeclaration(nodo) &&
      ts.isIdentifier(nodo.name) &&
      nodo.initializer &&
      (ts.isArrowFunction(nodo.initializer) || ts.isFunctionExpression(nodo.initializer))
    )
      agregar(nodo.name.text, nodo.initializer);
    if (ts.isMethodDeclaration(nodo) && nodo.body && ts.isIdentifier(nodo.name)) agregar(nodo.name.text, nodo);
    if (
      ts.isPropertyAssignment(nodo) &&
      ts.isIdentifier(nodo.name) &&
      (ts.isArrowFunction(nodo.initializer) || ts.isFunctionExpression(nodo.initializer))
    )
      agregar(nodo.name.text, nodo.initializer);
    ts.forEachChild(nodo, visitar);
  };
  const agregar = (nombre, f) => {
    if (!funciones.has(nombre)) funciones.set(nombre, []);
    funciones.get(nombre).push(f);
  };
  visitar(fuente);
}

/** Las funciones con ese nombre: primero las del mismo archivo; si no hay, la única del proyecto. */
function funcionesLlamadas(nombre, desde) {
  const todas = funciones.get(nombre) ?? [];
  const mismas = todas.filter((f) => f.getSourceFile() === desde.getSourceFile());
  if (mismas.length) return mismas;
  return todas.length === 1 ? todas : [];
}

/** Lo que devuelve una función: el cuerpo de una flecha o cada `return` que no esté en otra función. */
function retornos(funcion) {
  if (ts.isArrowFunction(funcion) && !ts.isBlock(funcion.body)) return [funcion.body];
  const salida = [];
  const visitar = (nodo) => {
    if (nodo !== funcion && ts.isFunctionLike(nodo)) return;
    if (ts.isReturnStatement(nodo) && nodo.expression) salida.push(nodo.expression);
    ts.forEachChild(nodo, visitar);
  };
  if (funcion.body) visitar(funcion.body);
  return salida;
}

/** Campos que se le agregan a una variable después: `x.campo = …`, `x['campo'] = …`. */
function camposAgregados(nombre, bloque) {
  const campos = [];
  const visitar = (nodo) => {
    if (
      ts.isBinaryExpression(nodo) &&
      nodo.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(nodo.left) || ts.isElementAccessExpression(nodo.left)) &&
      ts.isIdentifier(nodo.left.expression) &&
      nodo.left.expression.text === nombre
    ) {
      const campo = ts.isPropertyAccessExpression(nodo.left)
        ? nodo.left.name.text
        : ts.isStringLiteral(nodo.left.argumentExpression)
          ? nodo.left.argumentExpression.text
          : null;
      if (campo) campos.push(campo);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(bloque);
  return campos;
}

/**
 * Las formas posibles de un body: cada una es un objeto literal más los campos que se le agregan
 * después. Sigue `JSON.stringify(…)`, variables, funciones que lo arman (en el mismo archivo o
 * importadas) y envoltorios como `withoutNulls({ … })`. null si no lo puede leer.
 */
function formasDelBody(nodo, profundidad = 0) {
  if (!nodo || profundidad > 6) return null;
  if (
    ts.isParenthesizedExpression(nodo) ||
    ts.isAsExpression(nodo) ||
    ts.isNonNullExpression(nodo) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(nodo))
  )
    return formasDelBody(nodo.expression, profundidad + 1);
  if (ts.isObjectLiteralExpression(nodo)) return [{ objeto: nodo, extras: [] }];
  if (ts.isConditionalExpression(nodo)) {
    const a = formasDelBody(nodo.whenTrue, profundidad + 1);
    const b = formasDelBody(nodo.whenFalse, profundidad + 1);
    return a || b ? [...(a ?? []), ...(b ?? [])] : null;
  }
  if (ts.isIdentifier(nodo)) {
    const constantes = constantesVisibles(nodo);
    if (!constantes.has(nodo.text)) return null;
    const inicial = constantes.get(nodo.text);
    const formas = formasDelBody(inicial, profundidad + 1);
    const bloque = declaraciones.get(inicial);
    if (formas && bloque) {
      const extras = camposAgregados(nodo.text, bloque);
      return formas.map((f) => ({ ...f, extras: [...f.extras, ...extras] }));
    }
    return formas;
  }
  if (ts.isCallExpression(nodo)) {
    const nombre = ts.isIdentifier(nodo.expression)
      ? nodo.expression.text
      : ts.isPropertyAccessExpression(nodo.expression)
        ? nodo.expression.name.text
        : null;
    if (nombre === 'stringify') return formasDelBody(nodo.arguments[0], profundidad + 1);
    const llamadas = nombre ? funcionesLlamadas(nombre, nodo) : [];
    if (llamadas.length) {
      const formas = llamadas.flatMap((f) =>
        retornos(f).flatMap((r) => formasDelBody(r, profundidad + 1) ?? []),
      );
      if (formas.length) return formas;
    }
    // Un envoltorio que no se puede seguir (`withoutNulls({ … })`): se lee su primer argumento.
    if (nodo.arguments[0]) return formasDelBody(nodo.arguments[0], profundidad + 1);
  }
  return null;
}

/** Nombre de una propiedad de objeto literal, o null si es calculado. */
function nombreDe(p) {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return null;
}

/** Revisa los campos de una forma contra las propiedades del esquema, en profundidad. */
function revisarForma({ objeto, extras }, esquema, camino, problemas) {
  const props = propiedades(esquema);
  if (props === null) return;
  for (const campo of extras) if (!Object.hasOwn(props, campo)) problemas.add(`${camino}${campo}`);
  for (const p of objeto.properties) {
    if (ts.isSpreadAssignment(p)) {
      for (const forma of formasDelBody(p.expression) ?? []) revisarForma(forma, esquema, camino, problemas);
      continue;
    }
    if (!(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))) continue;
    const nombre = nombreDe(p);
    if (nombre === null) continue;
    if (!Object.hasOwn(props, nombre)) {
      problemas.add(`${camino}${nombre}`);
      continue;
    }
    if (resolver(props[nombre])?.readOnly) {
      problemas.add(`${camino}${nombre} (solo lectura)`);
      continue;
    }
    if (ts.isPropertyAssignment(p) && propiedades(props[nombre]) !== null) {
      for (const forma of formasDelBody(p.initializer) ?? [])
        revisarForma(forma, props[nombre], `${camino}${nombre}.`, problemas);
    }
  }
}

// --- Llamadas y envoltorios ------------------------------------------------------------------
//
// Una llamada al backend se lee como tres expresiones: método, ruta y body. Las apps envuelven
// `request` en ayudantes (`send(verbo, ruta, body)`, `saveSettings(cambios)`); una función que solo
// pasa sus parámetros a otra llamada al backend es un envoltorio, y cada llamada a ella cuenta
// como llamada al backend con los argumentos de quien la llama.

/** La llamada directa: request de Expo, request de la web o fetch a la base del API. */
function llamadaBase(nodo) {
  const callee = nodo.expression;
  const args = nodo.arguments;
  const constantes = constantesVisibles(nodo);
  // Expo: algo.request('POST', 'ruta', opciones). El método puede ser el parámetro de un envoltorio.
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'request' && args.length >= 2) {
    if (ts.isStringLiteral(args[0]) && !METODOS.includes(args[0].text)) return null;
    if (!ts.isStringLiteral(args[0]) && !ts.isIdentifier(args[0])) return null;
    return { metodo: args[0], ruta: args[1], body: propiedadDeObjeto(args[2], 'body') };
  }
  // web y landing: request('ruta', { method, body }). La ruta es texto; `request(await …)` o
  // `request(null)` es otra función que se llama igual.
  const pareceRuta = (a) =>
    a && (ts.isStringLiteral(a) || ts.isTemplateExpression(a) || ts.isNoSubstitutionTemplateLiteral(a) || ts.isBinaryExpression(a));
  if (ts.isIdentifier(callee) && callee.text === 'request' && pareceRuta(args[0])) {
    return { metodo: propiedadDeObjeto(args[1], 'method') ?? 'GET', ruta: args[0], body: propiedadDeObjeto(args[1], 'body') };
  }
  // fetch(`${apiUrl}/ruta`, { method, body: JSON.stringify(...) })
  if (ts.isIdentifier(callee) && callee.text === 'fetch' && args.length >= 1) {
    const cadena = leerCadena(args[0], constantes);
    if (cadena === null || !cadena.startsWith('\u0000')) return null; // fetch a otra cosa
    return { metodo: propiedadDeObjeto(args[1], 'method') ?? 'GET', ruta: args[0], body: propiedadDeObjeto(args[1], 'body') };
  }
  return null;
}

// nombre -> envoltorios. `local`: const o function del mismo archivo, se llama por su nombre;
// `metodo`: propiedad de un objeto (un repositorio), se llama como `algo.nombre(...)`.
const envoltorios = new Map();

function parametros(funcion) {
  return (funcion.parameters ?? []).map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
}

function funcionQueContiene(nodo) {
  let actual = nodo.parent;
  while (actual && !ts.isFunctionLike(actual)) actual = actual.parent;
  return actual ?? null;
}

const esParametro = (expr, nombres) => expr && typeof expr !== 'string' && ts.isIdentifier(expr) && nombres.includes(expr.text);

/** El envoltorio al que apunta una llamada, si hay uno solo que le quede. */
function envoltorioDe(nodo) {
  const callee = nodo.expression;
  if (ts.isIdentifier(callee)) {
    const locales = (envoltorios.get(callee.text) ?? []).filter(
      (e) => e.tipo === 'local' && e.funcion.getSourceFile() === nodo.getSourceFile(),
    );
    return locales.length === 1 ? locales[0] : null;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    // Por nombre solo cuando ninguna otra función del proyecto se llama igual: `x.create(...)`
    // puede ser cualquier repositorio.
    const metodos = (envoltorios.get(callee.name.text) ?? []).filter((e) => e.tipo === 'metodo');
    const homonimas = funciones.get(callee.name.text) ?? [];
    return metodos.length === 1 && homonimas.length === 1 ? metodos[0] : null;
  }
  return null;
}

/** Método, ruta y body de una llamada directa o a un envoltorio, con los argumentos ya puestos. */
function leerTriple(nodo) {
  const base = llamadaBase(nodo);
  if (base) return base;
  const envoltorio = envoltorioDe(nodo);
  if (!envoltorio) return null;
  const poner = (parte) => (parte && typeof parte === 'object' && 'param' in parte ? nodo.arguments[parte.param] : parte);
  return { metodo: poner(envoltorio.metodo), ruta: poner(envoltorio.ruta), body: poner(envoltorio.body) };
}

/** Busca envoltorios hasta que no aparezca ninguno nuevo (un envoltorio puede envolver a otro). */
function buscarEnvoltorios() {
  const yaVistos = new Set();
  for (let vuelta = 0; vuelta < 6; vuelta += 1) {
    let nuevos = 0;
    for (const [nombre, lista] of funciones) {
      for (const funcion of lista) {
        if (yaVistos.has(funcion)) continue;
        const nombres = parametros(funcion);
        if (!nombres.some(Boolean)) continue;
        let encontrada = null;
        const visitar = (nodo) => {
          if (encontrada || (nodo !== funcion && ts.isFunctionLike(nodo) && nodo !== funcion.body)) {
            if (nodo !== funcion && ts.isFunctionLike(nodo)) return;
          }
          if (!encontrada && ts.isCallExpression(nodo)) {
            const triple = leerTriple(nodo);
            if (triple && [triple.metodo, triple.ruta, triple.body].some((p) => esParametro(p, nombres)))
              encontrada = triple;
          }
          ts.forEachChild(nodo, visitar);
        };
        if (ts.isArrowFunction(funcion) && !ts.isBlock(funcion.body)) visitar(funcion.body);
        else if (funcion.body) visitar(funcion.body);
        if (!encontrada) continue;
        const comoParte = (p) => (esParametro(p, nombres) ? { param: nombres.indexOf(p.text) } : p);
        const tipo =
          ts.isPropertyAssignment(funcion.parent) || ts.isMethodDeclaration(funcion) ? 'metodo' : 'local';
        if (!envoltorios.has(nombre)) envoltorios.set(nombre, []);
        envoltorios.get(nombre).push({
          funcion,
          tipo,
          metodo: comoParte(encontrada.metodo),
          ruta: comoParte(encontrada.ruta),
          body: comoParte(encontrada.body),
        });
        yaVistos.add(funcion);
        nuevos += 1;
      }
    }
    if (nuevos === 0) break;
  }
}

export function revisar() {
  const llamadas = [];
  const fuentes = archivosFuente(join(RAIZ, 'src')).map((archivo) =>
    ts.createSourceFile(archivo, readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true),
  );
  fuentes.forEach(indexarFunciones);
  buscarEnvoltorios();
  const envueltas = new Set([...envoltorios.values()].flat().map((e) => e.funcion));
  for (const fuente of fuentes) {
    const archivo = fuente.fileName;
    const visitar = (nodo) => {
      if (ts.isCallExpression(nodo)) {
        const triple = leerTriple(nodo);
        // La llamada de adentro de un envoltorio no cuenta: cuentan las llamadas a él.
        const contenedora = triple && funcionQueContiene(nodo);
        const interna =
          contenedora &&
          envueltas.has(contenedora) &&
          [triple.metodo, triple.ruta, triple.body].some((p) => esParametro(p, parametros(contenedora)));
        if (triple && !interna) {
          const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente));
          llamadas.push({
            ...triple,
            constantes: constantesVisibles(nodo),
            donde: `${relative(RAIZ, archivo)}:${line + 1}`,
            codigo: texto(nodo, fuente),
          });
        }
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(fuente);
  }

  const problemas = [];
  const sinLeer = [];
  let revisadas = 0;
  for (const llamada of llamadas) {
    const metodoLeido =
      typeof llamada.metodo === 'string' ? llamada.metodo : leerCadena(llamada.metodo, llamada.constantes);
    if (metodoLeido === null) {
      sinLeer.push({ donde: llamada.donde, motivo: 'método variable', codigo: llamada.codigo });
      continue;
    }
    llamada.metodo = metodoLeido.toUpperCase();
    // Un envoltorio que resultó no ser del backend (`locks.request(clave, fn)`) se ignora.
    if (!METODOS.includes(llamada.metodo)) continue;
    const segmentos = segmentosDe(leerCadena(llamada.ruta, llamada.constantes));
    if (!segmentos) {
      sinLeer.push({ donde: llamada.donde, motivo: 'ruta armada fuera de la llamada', codigo: llamada.codigo });
      continue;
    }
    const legible = `${llamada.metodo} /${segmentos.join('/')}`;
    const candidatas = buscarOperacion(llamada.metodo, segmentos);
    if (!candidatas) {
      problemas.push({ donde: llamada.donde, llamada: legible, problema: 'la ruta no está en el contrato' });
      continue;
    }
    if (!candidatas[0].operacion) {
      problemas.push({
        donde: llamada.donde,
        llamada: legible,
        problema: `${candidatas[0].ruta} existe pero no acepta ${llamada.metodo}`,
      });
      continue;
    }
    const encontrada = {
      ruta: candidatas.map((c) => c.ruta).join(' | '),
      cuerpos: candidatas
        .map((c) => resolver(c.operacion.requestBody)?.content?.['application/json']?.schema)
        .filter(Boolean),
    };
    revisadas += 1;
    if (!llamada.body) continue;
    const formas = formasDelBody(llamada.body);
    if (!formas) {
      sinLeer.push({ donde: llamada.donde, motivo: 'body que no se pudo seguir', codigo: llamada.codigo });
      continue;
    }
    // Con varias candidatas, un campo vale si alguna lo documenta.
    const esquema = encontrada.cuerpos.length
      ? { allOf: encontrada.cuerpos }
      : null;
    if (!esquema) {
      if (formas.some((f) => f.objeto.properties.length > 0 || f.extras.length > 0))
        problemas.push({ donde: llamada.donde, llamada: legible, problema: 'manda body y el contrato no documenta uno' });
      continue;
    }
    const desconocidos = new Set();
    for (const forma of formas) revisarForma(forma, esquema, '', desconocidos);
    for (const campo of desconocidos) {
      problemas.push({
        donde: llamada.donde,
        llamada: legible,
        problema: campo.endsWith(' (solo lectura)')
          ? `manda «${campo.slice(0, -15)}», que es de solo lectura en ${encontrada.ruta}`
          : `manda «${campo}», que el contrato no documenta para ${encontrada.ruta}`,
      });
    }
  }

  // Las excepciones se buscan por llamada y problema, no por línea, para que mover código no las
  // rompa. Una excepción que ya no encuentra nada también es un error: hay que borrarla.
  const usadas = new Set();
  const pendientes = problemas.filter((p) => {
    const i = excepciones.findIndex((e) => e.llamada === p.llamada && p.problema.includes(e.contiene ?? ''));
    if (i === -1) return true;
    usadas.add(i);
    return false;
  });
  const sobrantes = excepciones.filter((_, i) => !usadas.has(i));

  return { total: llamadas.length, revisadas, problemas: pendientes, excepcionesSobrantes: sobrantes, sinLeer };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const resultado = revisar();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(resultado, null, 2));
  } else {
    console.log(
      `${resultado.total} llamadas al backend · ${resultado.revisadas} casan con el contrato · ` +
        `${resultado.problemas.length} con diferencias · ${resultado.sinLeer.length} sin leer`,
    );
    for (const p of resultado.problemas) console.log(`  ✗ ${p.llamada}  ${p.problema}  (${p.donde})`);
    for (const e of resultado.excepcionesSobrantes)
      console.log(`  ✗ excepción que ya no hace falta: ${e.llamada} — bórrala de contrato/excepciones.json`);
  }
  process.exit(resultado.problemas.length || resultado.excepcionesSobrantes.length ? 1 : 0);
}
