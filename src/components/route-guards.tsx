import type { ReactNode } from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import type { OperationalRole } from '../types/api';
import { Spinner } from './brand-mark';

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-cream text-ink" role="status">
      <span className="inline-flex items-center gap-3 font-semibold">
        <Spinner /> Validando sesión…
      </span>
    </div>
  );
}

export function TenantGuard({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const { tenant, tenantReady } = useSessions();
  const location = useLocation();

  if (!ready || !tenantReady) return <LoadingScreen />;
  if (!user) return <Redirect to={{ pathname: '/acceso', state: { from: location.pathname } }} />;
  if (!tenant) return <Redirect to="/accesos" />;
  return children;
}

export function RoleGuard({
  allowed,
  children,
}: {
  allowed: OperationalRole[];
  children: ReactNode;
}) {
  const { tenant } = useSessions();
  if (!tenant || !allowed.includes(tenant.context.rol)) {
    return <Redirect to="/app/pos" />;
  }
  return children;
}

export function PlatformGuard({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth();
  const { platform } = useSessions();
  const location = useLocation();

  if (!ready) return <LoadingScreen />;
  if (!user) {
    return <Redirect to={{ pathname: '/plataforma/acceso', state: { from: location.pathname } }} />;
  }
  if (!platform) return <Redirect to="/plataforma/acceso" />;
  return children;
}
