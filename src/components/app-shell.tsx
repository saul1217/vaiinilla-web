import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookTabs,
  ShieldCheck,
  Store,
  UserPlus,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useHistory } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { Logo } from './brand-mark';
import { Button } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const adminNavigation: NavItem[] = [
  { to: '/app', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/app/menu', label: 'Menú', icon: NotebookTabs },
  { to: '/app/pedidos', label: 'Pedidos e historial', icon: ClipboardList },
  { to: '/app/invitaciones', label: 'Personal e invitaciones', icon: UserPlus },
  { to: '/app/pos', label: 'Caja / POS', icon: WalletCards },
];

const posNavigation: NavItem[] = [{ to: '/app/pos', label: 'Caja / POS', icon: WalletCards }];

const platformNavigation: NavItem[] = [
  { to: '/plataforma', label: 'Resumen global', icon: ShieldCheck, end: true },
  { to: '/plataforma/establecimientos', label: 'Establecimientos', icon: Building2 },
];

export function TenantShell({ children }: { children: ReactNode }) {
  const { tenant, clearAll } = useSessions();
  const { signOut } = useAuth();
  const history = useHistory();
  const [open, setOpen] = useState(false);

  if (!tenant) return null;
  const items = tenant.context.rol === 'admin' ? adminNavigation : posNavigation;

  async function exit() {
    clearAll();
    await signOut();
    history.replace('/acceso');
  }

  return (
    <Shell
      surface="tenant"
      navigation={items}
      title={tenant.access.establecimiento.nombre}
      subtitle={roleLabel(tenant.context.rol)}
      mobileOpen={open}
      onMobileOpenChange={setOpen}
      onExit={exit}
      children={children}
    />
  );
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const { platform, clearAll } = useSessions();
  const { signOut } = useAuth();
  const history = useHistory();
  const [open, setOpen] = useState(false);

  if (!platform) return null;

  async function exit() {
    clearAll();
    await signOut();
    history.replace('/plataforma/acceso');
  }

  return (
    <Shell
      surface="platform"
      navigation={platformNavigation}
      title="Plataforma Vaiinilla"
      subtitle="Super Admin"
      mobileOpen={open}
      onMobileOpenChange={setOpen}
      onExit={exit}
      children={children}
    />
  );
}

function Shell({
  surface,
  navigation,
  title,
  subtitle,
  mobileOpen,
  onMobileOpenChange,
  onExit,
  children,
}: {
  surface: 'tenant' | 'platform';
  navigation: NavItem[];
  title: string;
  subtitle: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onExit: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className={`app-frame app-frame--${surface}`}>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>

      <header className="mobile-header">
        <Logo />
        <button
          type="button"
          className="icon-button"
          aria-label={mobileOpen ? 'Cerrar navegación' : 'Abrir navegación'}
          aria-expanded={mobileOpen}
          onClick={() => onMobileOpenChange(!mobileOpen)}
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">
          <Logo />
          {surface === 'platform' && <span className="platform-chip">Plataforma</span>}
        </div>

        <div className="sidebar__context">
          <span className="sidebar__context-icon">
            {surface === 'platform' ? <ShieldCheck aria-hidden="true" /> : <Store aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{title}</p>
            <p className="mt-0.5 text-xs font-medium text-muted">{subtitle}</p>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              exact={end}
              onClick={() => onMobileOpenChange(false)}
              className="nav-item"
              activeClassName="nav-item--active"
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <Button variant="ghost" className="w-full justify-start" onClick={() => void onExit()}>
            <LogOut aria-hidden="true" className="size-5" />
            Cerrar sesión
          </Button>
          <p className="mt-3 px-2 text-xs leading-5 text-muted">
            {surface === 'platform'
              ? 'Sesión global separada · 10 minutos'
              : 'Sesión autorizada · 15 minutos'}
          </p>
        </div>
      </aside>

      <main id="contenido" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

function roleLabel(role: string): string {
  return (
    {
      admin: 'Administración',
      cajero: 'Caja',
      cocina: 'Cocina',
      mesero: 'Servicio en mesa',
    }[role] ?? role
  );
}
