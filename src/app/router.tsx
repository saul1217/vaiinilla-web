import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Redirect, Route, Switch } from 'react-router-dom';
import { PlatformShell, TenantShell } from '../components/app-shell';
import { PlatformGuard, RoleGuard, TenantGuard } from '../components/route-guards';
import { Spinner } from '../components/brand-mark';

const AuthPage = lazy(() => import('../pages/auth-page').then((module) => ({ default: module.AuthPage })));
const AccessSelectionPage = lazy(() => import('../pages/access-selection-page').then((module) => ({ default: module.AccessSelectionPage })));
const TenantDashboardPage = lazy(() => import('../pages/tenant-dashboard-page').then((module) => ({ default: module.TenantDashboardPage })));
const InvitationsPage = lazy(() => import('../pages/invitations-page').then((module) => ({ default: module.InvitationsPage })));
const PosPage = lazy(() => import('../pages/pos-page').then((module) => ({ default: module.PosPage })));
const PlatformDashboardPage = lazy(() => import('../pages/platform-dashboard-page').then((module) => ({ default: module.PlatformDashboardPage })));
const EstablishmentsPage = lazy(() => import('../pages/establishments-page').then((module) => ({ default: module.EstablishmentsPage })));
const NotFoundPage = lazy(() => import('../pages/not-found-page').then((module) => ({ default: module.NotFoundPage })));

function LoadingRoute() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status">
      <span className="inline-flex items-center gap-3 font-semibold text-ink"><Spinner /> Cargando…</span>
    </div>
  );
}

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingRoute />}>{children}</Suspense>;
}

function TenantArea() {
  return (
    <TenantGuard>
      <TenantShell>
        <Switch>
          <Route exact path="/app">
            <RoleGuard allowed={['admin']}>
              <TenantDashboardPage />
            </RoleGuard>
          </Route>
          <Route path="/app/invitaciones">
            <RoleGuard allowed={['admin']}>
              <InvitationsPage />
            </RoleGuard>
          </Route>
          <Route path="/app/pos"><PosPage /></Route>
          <Redirect to="/app" />
        </Switch>
      </TenantShell>
    </TenantGuard>
  );
}

function PlatformArea() {
  return (
    <PlatformGuard>
      <PlatformShell>
        <Switch>
          <Route exact path="/plataforma"><PlatformDashboardPage /></Route>
          <Route path="/plataforma/establecimientos"><EstablishmentsPage /></Route>
          <Redirect to="/plataforma" />
        </Switch>
      </PlatformShell>
    </PlatformGuard>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Deferred>
        <Switch>
          <Route exact path="/"><Redirect to="/acceso" /></Route>
          <Route exact path="/acceso"><AuthPage surface="tenant" /></Route>
          <Route exact path="/accesos"><AccessSelectionPage /></Route>
          <Route path="/app"><TenantArea /></Route>
          <Route exact path="/plataforma/acceso"><AuthPage surface="platform" /></Route>
          <Route path="/plataforma"><PlatformArea /></Route>
          <Route><NotFoundPage /></Route>
        </Switch>
      </Deferred>
    </BrowserRouter>
  );
}
