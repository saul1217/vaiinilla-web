import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLegalDocument, legalDocumentsReady } from './legal-documents';

function flatten(kind: 'terminos' | 'privacidad'): string[] {
  const doc = getLegalDocument(kind);
  const out = [`# ${doc.title}`, `_${doc.validity}_`];
  for (const s of doc.sections) {
    out.push(`## ${s.heading}`);
    for (const b of s.blocks) {
      if (b.type === 'list') out.push(...b.items.map((i) => `- ${i}`));
      else out.push(b.text);
    }
  }
  return out;
}

describe('documentos legales 2026-10', () => {
  it.each(['terminos', 'privacidad'] as const)('%s reproduce el texto aprobado sin cambios', (kind) => {
    const src = readFileSync(`src/content/legal/${kind}-2026-10.md`, 'utf8')
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    expect(flatten(kind)).toEqual(src);
    expect(getLegalDocument(kind).validity).toContain('31 de octubre de 2026');
  });

  it('queda listo para la versión 2026-10', () => {
    expect(legalDocumentsReady('2026-10', '2026-10')).toBe(true);
    expect(legalDocumentsReady('2026-07', '2026-07')).toBe(false);
  });
});
