import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface Revision {
  revisadas: number;
  problemas: unknown[];
  excepcionesSobrantes: unknown[];
}

// Cada llamada de la app al backend tiene que existir en el contrato (contrato/openapi.json, que
// exporta vaiinilla_back) y mandar solo campos documentados. El detalle sale con
// `npm run contrato:revisar`; las diferencias conocidas viven en contrato/excepciones.json.
describe('contrato con el backend', () => {
  it('las llamadas de la app casan con contrato/openapi.json', () => {
    const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const salida = execFileSync('node', [join(raiz, 'contrato', 'revisar.mjs'), '--json'], {
      cwd: raiz,
      encoding: 'utf8',
    });
    const resultado = JSON.parse(salida.slice(salida.indexOf('{'))) as Revision;
    expect(resultado.problemas).toEqual([]);
    expect(resultado.excepcionesSobrantes).toEqual([]);
    expect(resultado.revisadas).toBeGreaterThan(50);
  }, 60_000);
});
