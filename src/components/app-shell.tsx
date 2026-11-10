import {
  ArrowLeftRight,
  BadgePercent,
  Building2,
  ChefHat,
  PackageCheck,
  ClipboardList,
  ConciergeBell,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  NotebookTabs,
  ShieldCheck,
  Store,
  Sun,
  Moon,
  MoonStar,
  Table2,
  Truck,
  Workflow,
  UserPlus,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { NavLink, useHistory, useLocation } from 'react-router-dom';
import { isDarkAdminTheme, useAdminTheme, type AdminTheme } from '../lib/admin-theme';
import { CASHBACK_ENABLED } from '../lib/features';
import { INVENTARIO_ENABLED } from '../lib/inventory-feature';
import { WALLET_CAJA_ENABLED } from '../lib/wallet-caja-feature';
import { REPARTO_ENABLED } from '../lib/reparto-feature';
import { clearAllPendingRecharges } from '../lib/wallet-caja';
import { useAuth } from '../context/auth-context';
import { useSessions } from '../context/session-context';
import { Logo } from './brand-mark';
import { Button } from './ui';
import { AppSheet } from './app-sheet';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const adminNavigation: NavItem[] = [
  { to: '/app', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/app/menu', label: 'Menú', icon: NotebookTabs },
  { to: '/app/pedidos', label: 'Pedidos e historial', icon: ClipboardList },
  ...(CASHBACK_ENABLED
    ? [{ to: '/app/cashback', label: 'Cashback y wallet', icon: BadgePercent } satisfies NavItem]
    : []),
  { to: '/app/flujo', label: 'Flujo de mi tienda', icon: Workflow },
  { to: '/app/espacios', label: 'Mesas y espacios', icon: Table2 },
  { to: '/app/invitaciones', label: 'Personal e invitaciones', icon: UserPlus },
  // Admin solo consulta el saldo; recargar es de Caja (lo resuelve la página).
  ...(WALLET_CAJA_ENABLED ? [{ to: '/app/saldo', label: 'Saldo de clientes', icon: HandCoins } satisfies NavItem] : []),
  ...(REPARTO_ENABLED ? [{ to: '/app/reparto', label: 'Reparto y encargos', icon: Truck } satisfies NavItem] : []),
  { to: '/app/pos', label: 'Pedir', icon: WalletCards },
];

const posNavigation: NavItem[] = [
  { to: '/app/pos', label: 'Caja', icon: WalletCards },
  ...(WALLET_CAJA_ENABLED ? [{ to: '/app/saldo', label: 'Saldo', icon: HandCoins } satisfies NavItem] : []),
  ...(REPARTO_ENABLED ? [{ to: '/app/reparto', label: 'Reparto', icon: Truck } satisfies NavItem] : []),
];
const kitchenNavigation: NavItem[] = [
  { to: '/app/cocina', label: 'Cocina', icon: ChefHat },
  // Cocina ve el inventario; editarlo depende de `cocina_edita_inventario` (lo resuelve la página).
  ...(INVENTARIO_ENABLED ? [{ to: '/app/inventario', label: 'Inventario', icon: PackageCheck } satisfies NavItem] : []),
];
const waiterNavigation: NavItem[] = [{ to: '/app/pos', label: 'Mesas', icon: ConciergeBell }];

const platformNavigation: NavItem[] = [
  { to: '/plataforma', label: 'Resumen global', icon: ShieldCheck, end: true },
  { to: '/plataforma/establecimientos', label: 'Establecimientos', icon: Building2 },
];

export function TenantShell({ children }: { children: ReactNode }) {
  const { tenant, clearAll, clearTenant } = useSessions();
  const { signOut } = useAuth();
  const history = useHistory();
  const [open, setOpen] = useState(false);

  if (!tenant) return null;
  const items = navigationForRole(tenant.context.rol);

  async function switchContext() {
    // Las recargas en efectivo sin confirmar no se quedan en el navegador al cambiar de acceso.
    clearAllPendingRecharges();
    await clearTenant();
    history.replace('/accesos');
  }

  async function exit() {
    clearAllPendingRecharges();
    await clearAll();
    await signOut();
    history.replace('/acceso');
  }

  return (
    <TenantLayout
      navigation={items}
      title={tenant.access.establecimiento.nombre}
      subtitle={roleLabel(tenant.context.rol)}
      accountOpen={open}
      onAccountOpenChange={setOpen}
      onSwitchContext={switchContext}
      onExit={exit}
      children={children}
    />
  );
}

interface TenantLayoutProps {
  navigation: NavItem[];
  title: string;
  subtitle: string;
  accountOpen: boolean;
  onAccountOpenChange: (open: boolean) => void;
  onSwitchContext: () => void;
  onExit: () => Promise<void>;
  children: ReactNode;
}

function TenantLayout({ navigation, title, subtitle, accountOpen, onAccountOpenChange, onSwitchContext, onExit, children }: TenantLayoutProps) {
  const [theme, setTheme] = useAdminTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const accountButton = useRef<HTMLButtonElement>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const moreReturnFocus = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    // Focus main even while a lazy page is loading. Its h1 will be the next reading stop.
    main.current?.focus();
  }, [location.pathname]);
  // Hasta cuatro destinos caben en la barra; con más (admin) van los cuatro de siempre y el resto a «Más».
  const primary = navigation.length > 4
    ? ['/app', '/app/menu', '/app/pos', '/app/pedidos'].map((path) => navigation.find((item) => item.to === path)!)
    : navigation;
  const secondary = navigation.filter((item) => !primary.includes(item));
  const accountActions = <>
    <Button variant="ghost" onClick={onSwitchContext}><ArrowLeftRight aria-hidden="true" />Cambiar acceso</Button>
    <ThemeCycleButton theme={theme} onChange={setTheme} />
    <Button variant="ghost" onClick={() => void onExit()}><LogOut aria-hidden="true" />Cerrar sesión</Button>
  </>;
  return <div className="app-frame app-frame--tenant tenant-app">
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <AppIdentityHeader title={title} subtitle={subtitle} dark={isDarkAdminTheme(theme)} opener={accountButton}
      open={accountOpen} onOpen={() => onAccountOpenChange(true)} />
    <DesktopAppRail navigation={navigation} title={title} subtitle={subtitle} dark={isDarkAdminTheme(theme)}>{accountActions}</DesktopAppRail>
    <main id="contenido" ref={main} className="app-main tenant-app__main" tabIndex={-1}>{children}</main>
    <MobileAppNav navigation={primary} more={secondary.length > 0} moreActive={secondary.some((item) => location.pathname === item.to)}
      moreOpen={moreOpen} opener={moreButton} onMore={() => { moreReturnFocus.current = moreButton.current; setMoreOpen(true); }} />
    <AppSheet open={moreOpen} onOpenChange={setMoreOpen} title="Más" returnFocusRef={moreReturnFocus} fallbackFocusRef={main}>
      <AppSheet.Body><nav className="app-menu-links" aria-label="Más destinos">
        {secondary.map(({ to, label, icon: Icon }) => <NavLink exact key={to} to={to} activeClassName="app-link--active"
          onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { moreReturnFocus.current = main.current; setMoreOpen(false); } }}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </NavLink>)}
      </nav></AppSheet.Body>
    </AppSheet>
    <AccountMenuSheet open={accountOpen} onOpenChange={onAccountOpenChange} title={title} subtitle={subtitle} opener={accountButton}>
      {accountActions}
    </AccountMenuSheet>
  </div>;
}

/** Como `VaiinillaThemeMode.next()` en Android: claro, oscuro, AMOLED y de vuelta a claro. */
const NEXT_THEME: Record<AdminTheme, { next: AdminTheme; label: string; icon: LucideIcon }> = {
  claro: { next: 'oscuro', label: 'Tema oscuro', icon: Moon },
  oscuro: { next: 'amoled', label: 'Tema AMOLED', icon: MoonStar },
  amoled: { next: 'claro', label: 'Tema claro', icon: Sun },
};

function ThemeCycleButton({ theme, onChange }: { theme: AdminTheme; onChange: (next: AdminTheme) => void }) {
  const { next, label, icon: Icon } = NEXT_THEME[theme];
  return <Button variant="ghost" onClick={() => onChange(next)} aria-label={`Cambiar a ${label.toLowerCase().replace('amoled', 'AMOLED')}`}>
    <Icon aria-hidden="true" />{label}
  </Button>;
}

function AppIdentityHeader({ title, subtitle, dark, opener, open, onOpen }: {
  title: string; subtitle: string; dark: boolean; opener: RefObject<HTMLButtonElement | null>; open: boolean; onOpen: () => void;
}) {
  return <header className="app-identity">
    <Logo compact theme={dark ? 'dark' : 'light'} />
    <div className="app-identity__context"><p>{title}</p><span>{subtitle}</span></div>
    <button ref={opener} className="app-account-button" type="button" aria-label="Abrir opciones de cuenta"
      aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>
      <span aria-hidden="true">{subtitle.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span>
    </button>
  </header>;
}

function DesktopAppRail({ navigation, title, subtitle, dark, children }: {
  navigation: NavItem[]; title: string; subtitle: string; dark: boolean; children: ReactNode;
}) {
  return <aside className="app-rail">
    <div className="app-rail__brand"><Logo compact theme={dark ? 'dark' : 'light'} /></div>
    <div className="app-rail__context"><strong>{title}</strong><span>{subtitle}</span></div>
    <nav aria-label="Navegación principal" className="app-rail__nav">
      {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} exact={end} title={label}
        className="app-rail__link" activeClassName="app-link--active"><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}
    </nav>
    <div className="app-rail__footer">{children}</div>
  </aside>;
}

function MobileAppNav({ navigation, more, moreActive, moreOpen, opener, onMore }: {
  navigation: NavItem[]; more: boolean; moreActive: boolean; moreOpen: boolean; opener: RefObject<HTMLButtonElement | null>; onMore: () => void;
}) {
  return <nav className={`app-mobile-nav ${navigation.length === 1 ? 'app-mobile-nav--compact' : ''}`} aria-label="Navegación móvil">
    {navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} exact={end}
      activeClassName="app-link--active"><Icon aria-hidden="true" /><span>{to === '/app/pedidos' ? 'Pedidos' : label}</span></NavLink>)}
    {more && <button ref={opener} type="button" className={moreActive ? 'app-link--active' : undefined}
      aria-label="Más" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}><MoreHorizontal aria-hidden="true" /><span>Más</span></button>}
  </nav>;
}

function AccountMenuSheet({ open, onOpenChange, title, subtitle, opener, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; subtitle: string;
  opener: RefObject<HTMLButtonElement | null>; children: ReactNode;
}) {
  return <AppSheet open={open} onOpenChange={onOpenChange} title="Opciones de cuenta" description={`${subtitle} · ${title}`} returnFocusRef={opener}>
    <AppSheet.Body><div className="app-account-actions">{children}<p>Sesión activa en este navegador</p></div></AppSheet.Body>
  </AppSheet>;
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const { platform, clearAll } = useSessions();
  const { signOut } = useAuth();
  const history = useHistory();
  const [open, setOpen] = useState(false);

  if (!platform) return null;

  async function exit() {
    await clearAll();
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
  onSwitchContext,
  onExit,
  children,
}: {
  surface: 'tenant' | 'platform';
  navigation: NavItem[];
  title: string;
  subtitle: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  onSwitchContext?: () => void;
  onExit: () => Promise<void>;
  children: ReactNode;
}) {
  const [adminTheme, setAdminTheme] = useAdminTheme();
  const dark = surface === 'platform' || adminTheme === 'oscuro';
  return (
    <div className={`app-frame app-frame--${surface}`}>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>

      <header className="mobile-header">
        <Logo compact theme={dark ? 'dark' : 'light'} />
        <div className="mobile-header__context">
          <p className="mobile-header__title">{title}</p>
          <p className="mobile-header__role">{subtitle}</p>
        </div>
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
          <Logo theme={dark ? 'dark' : 'light'} />
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
          {onSwitchContext && (
            <Button variant="ghost" className="w-full justify-start" onClick={onSwitchContext}>
              <ArrowLeftRight aria-hidden="true" className="size-5" />
              Cambiar acceso
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setAdminTheme(adminTheme === 'oscuro' ? 'claro' : 'oscuro')}
            aria-label={adminTheme === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {adminTheme === 'oscuro' ? (
              <Sun aria-hidden="true" className="size-5" />
            ) : (
              <Moon aria-hidden="true" className="size-5" />
            )}
            {adminTheme === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => void onExit()}>
            <LogOut aria-hidden="true" className="size-5" />
            Cerrar sesión
          </Button>
          <p className="mt-3 px-2 text-xs leading-5 text-muted">
            {surface === 'platform'
              ? 'Sesión global separada · 10 minutos'
              : 'Sesión activa en este navegador'}
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

function navigationForRole(role: string): NavItem[] {
  if (role === 'admin') return adminNavigation;
  if (role === 'cocina') return kitchenNavigation;
  if (role === 'mesero') return waiterNavigation;
  return posNavigation;
}
