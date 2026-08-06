import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/brand-mark';

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <Logo />
      <p className="eyebrow mt-12">Error 404</p>
      <h1>Esta ruta no existe.</h1>
      <p>Regresa al acceso seguro para continuar con una sesión autorizada.</p>
      <Link to="/acceso" className="button button--primary mt-7">
        <ArrowLeft aria-hidden="true" className="size-5" /> Volver al acceso
      </Link>
    </main>
  );
}
