export type LegalDocumentKind = 'terminos' | 'privacidad';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  kind: LegalDocumentKind;
  title: string;
  version: string;
  published: boolean;
  sections: LegalSection[];
}

// Los textos legales deben ser entregados y aprobados por el responsable del
// proyecto. La Web no inventa consentimiento: hasta entonces el alta permanece
// bloqueada y estas rutas explican claramente lo que falta.
const documents: Record<LegalDocumentKind, LegalDocument> = {
  terminos: {
    kind: 'terminos',
    title: 'Términos y condiciones',
    version: '2026-07',
    published: false,
    sections: [],
  },
  privacidad: {
    kind: 'privacidad',
    title: 'Aviso de privacidad',
    version: '2026-07',
    published: false,
    sections: [],
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
