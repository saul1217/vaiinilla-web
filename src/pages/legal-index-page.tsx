import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/brand-mark';
import { getLegalDocument, type LegalDocumentKind } from '../content/legal-documents';

const kinds: LegalDocumentKind[] = ['terminos', 'privacidad'];

export function LegalIndexPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Link to="/acceso" aria-label="Vaiinilla, inicio">
          <Logo />
        </Link>
      </header>
      <article className="legal-document">
        <p className="eyebrow">Vaiinilla</p>
        <h1>Documentos legales</h1>
        {kinds.map((kind) => {
          const document = getLegalDocument(kind);
          return (
            <section key={kind}>
              <h2>
                <FileText aria-hidden="true" />{' '}
                <Link to={`/legal/${kind}/${document.version}`}>{document.title}</Link>
              </h2>
              {document.validity && <p>{document.validity}</p>}
            </section>
          );
        })}
      </article>
    </main>
  );
}
