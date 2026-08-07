import { ArrowLeft, FileWarning } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/brand-mark';
import { Feedback } from '../components/ui';
import {
  getLegalDocument,
  type LegalDocumentKind,
} from '../content/legal-documents';

export function LegalDocumentPage({ kind }: { kind: LegalDocumentKind }) {
  const { version } = useParams<{ version: string }>();
  const document = getLegalDocument(kind);
  const isCurrentPublishedDocument = document.published && document.version === version;

  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link to="/acceso" aria-label="Vaiinilla, inicio">
          <Logo />
        </Link>
        <Link className="legal-back" to="/invitaciones/aceptar">
          <ArrowLeft aria-hidden="true" /> Volver a la invitación
        </Link>
      </header>

      <article className="legal-document">
        <p className="eyebrow">Documento legal · versión {version}</p>
        <h1>{document.title}</h1>

        {!isCurrentPublishedDocument ? (
          <div className="legal-pending">
            <FileWarning aria-hidden="true" />
            <div>
              <h2>Documento pendiente de publicación</h2>
              <p>
                Esta versión todavía no contiene el texto aprobado. Por seguridad, Vaiinilla
                no permite registrar un consentimiento hasta que el documento esté publicado.
              </p>
            </div>
          </div>
        ) : (
          document.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))
        )}

        {!isCurrentPublishedDocument && (
          <Feedback tone="info">
            El equipo debe proporcionar y aprobar los Términos y el Aviso de privacidad antes
            del lanzamiento.
          </Feedback>
        )}
      </article>
    </main>
  );
}
