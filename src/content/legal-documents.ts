import privacidad202610 from './legal/privacidad-2026-10.md?raw';
import terminos202610 from './legal/terminos-2026-10.md?raw';

export type LegalDocumentKind = 'terminos' | 'privacidad';

export type LegalBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  title: string;
  version: string;
  /** Línea de versión y fecha de vigencia, tal como viene en el texto aprobado. */
  validity: string;
  published: boolean;
  sections: LegalSection[];
}

/**
 * Convierte el Markdown aprobado (solo usa `#`, `##`, listas con `-`, una línea
 * en cursiva y párrafos) en secciones, sin alterar el texto.
 */
export function parseLegalMarkdown(source: string): Pick<LegalDocument, 'title' | 'validity' | 'sections'> {
  let title = '';
  let validity = '';
  const sections: LegalSection[] = [];
  let current: LegalSection | null = null;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) {
      current = { heading: line.slice(3).trim(), blocks: [] };
      sections.push(current);
    } else if (line.startsWith('# ')) {
      title = line.slice(2).trim();
    } else if (!current && /^_.*_$/.test(line)) {
      validity = line.slice(1, -1).trim();
    } else if (current && line.startsWith('- ')) {
      const last = current.blocks[current.blocks.length - 1];
      const item = line.slice(2).trim();
      if (last && last.type === 'list') last.items.push(item);
      else current.blocks.push({ type: 'list', items: [item] });
    } else if (current) {
      current.blocks.push({ type: 'paragraph', text: line });
    }
  }
  return { title, validity, sections };
}

const documents: Record<LegalDocumentKind, LegalDocument> = {
  terminos: {
    kind: 'terminos',
    version: '2026-10',
    published: true,
    ...parseLegalMarkdown(terminos202610),
  },
  privacidad: {
    kind: 'privacidad',
    version: '2026-10',
    published: true,
    ...parseLegalMarkdown(privacidad202610),
  },
};

export function getLegalDocument(kind: LegalDocumentKind): LegalDocument {
  return documents[kind];
}

export function legalDocumentsReady(termsVersion: string, privacyVersion: string): boolean {
  const terms = documents.terminos;
  const privacy = documents.privacidad;
  return (
    terms.published &&
    privacy.published &&
    terms.version === termsVersion &&
    privacy.version === privacyVersion &&
    terms.sections.length > 0 &&
    privacy.sections.length > 0
  );
}
