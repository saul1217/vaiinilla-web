/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { api } from '../lib/api';
import {
  endBrowserSession,
  forgetTenantMembership,
  getRememberedTenantMembership,
  rememberTenantMembership,
} from '../lib/browser-session';
import type {
  PlatformContextResponse,
  SessionAccess,
  TenantContextResponse,
} from '../types/api';
import { useAuth } from './auth-context';

export interface TenantSession {
  access: SessionAccess;
  token: string;
  expiresAt: number;
  context: TenantContextResponse['contexto'];
}

export interface PlatformSession {
  token: string;
  expiresAt: number;
  authority: PlatformContextResponse['autoridad'];
}

interface SessionContextValue {
  tenant: TenantSession | null;
  tenantReady: boolean;
  platform: PlatformSession | null;
  openTenantSession: (user: User, access: SessionAccess) => Promise<TenantSession>;
  openPlatformSession: (user: User) => Promise<PlatformSession>;
  clearTenant: () => void;
  clearPlatform: () => void;
  clearAll: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);
const TENANT_RENEWAL_ADVANCE_MS = 60_000;
const TENANT_RENEWAL_RETRY_MS = 15_000;
const webRoles = new Set(['admin', 'cajero', 'cocina', 'mesero']);

function createTenantSession(
  access: SessionAccess,
  response: TenantContextResponse,
): TenantSession {
  return {
    access,
    token: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    context: response.contexto,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [tenant, setTenant] = useState<TenantSession | null>(null);
  const [platform, setPlatform] = useState<PlatformSession | null>(null);
  const [tenantRestoration, setTenantRestoration] = useState({
    uid: null as string | null,
    ready: false,
  });

  const tenantReady = authReady && (
    !user || (tenantRestoration.uid === user.uid && tenantRestoration.ready)
  );

  const clearTenant = useCallback(() => {
    forgetTenantMembership();
    setTenant(null);
  }, []);
  const clearPlatform = useCallback(() => setPlatform(null), []);
  const clearAll = useCallback(() => {
    endBrowserSession();
    setTenant(null);
    setPlatform(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      setTenant(null);
      setPlatform(null);

      if (!authReady) {
        setTenantRestoration({ uid: null, ready: false });
        return;
      }

      if (!user) {
        setTenantRestoration({ uid: null, ready: true });
        return;
      }

      const uid = user.uid;
      const membershipId = getRememberedTenantMembership();
      setTenantRestoration({ uid, ready: false });

      if (!membershipId) {
        setTenantRestoration({ uid, ready: true });
        return;
      }

      try {
        const firebaseToken = await user.getIdToken();
        const accesses = await api.listAccesses(firebaseToken);
        const access = accesses.find(
          (candidate) => candidate.membresia_id === membershipId && webRoles.has(candidate.rol),
        );

        if (!access) {
          forgetTenantMembership();
          return;
        }

        const response = await api.createTenantContext(firebaseToken, membershipId);
        if (!cancelled) setTenant(createTenantSession(access, response));
      } catch {
        // If the network or membership changed, the access selector remains
        // available as the recovery path instead of trapping the user.
      } finally {
        if (!cancelled) setTenantRestoration({ uid, ready: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!platform) return;
    const remaining = Math.max(0, platform.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setPlatform((current) => (
        current && current.expiresAt <= Date.now() ? null : current
      ));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [platform]);

  useEffect(() => {
    if (!tenant || !user) return;

    let cancelled = false;
    let timer: number | undefined;
    const membershipId = tenant.access.membresia_id;

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => void renew(), Math.max(1_000, delay));
    };

    const renew = async () => {
      try {
        const firebaseToken = await user.getIdToken();
        const response = await api.createTenantContext(firebaseToken, membershipId);
        if (cancelled) return;
        setTenant((current) => (
          current?.access.membresia_id === membershipId
            ? createTenantSession(current.access, response)
            : current
        ));
      } catch {
        if (cancelled) return;
        const remaining = tenant.expiresAt - Date.now();
        if (remaining > 0) {
          schedule(Math.min(TENANT_RENEWAL_RETRY_MS, remaining));
        } else {
          setTenant((current) => (
            current?.access.membresia_id === membershipId ? null : current
          ));
        }
      }
    };

    const renewWhenVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        tenant.expiresAt - Date.now() <= TENANT_RENEWAL_ADVANCE_MS
      ) {
        if (timer !== undefined) window.clearTimeout(timer);
        void renew();
      }
    };

    schedule(tenant.expiresAt - Date.now() - TENANT_RENEWAL_ADVANCE_MS);
    document.addEventListener('visibilitychange', renewWhenVisible);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', renewWhenVisible);
    };
  }, [tenant, user]);

  const openTenantSession = useCallback(async (firebaseUser: User, access: SessionAccess) => {
    const firebaseToken = await firebaseUser.getIdToken(true);
    const response = await api.createTenantContext(firebaseToken, access.membresia_id);
    const next = createTenantSession(access, response);
    rememberTenantMembership(access.membresia_id);
    setPlatform(null);
    setTenant(next);
    return next;
  }, []);

  const openPlatformSession = useCallback(async (firebaseUser: User) => {
    const firebaseToken = await firebaseUser.getIdToken(true);
    const response = await api.createPlatformContext(firebaseToken);
    const next: PlatformSession = {
      token: response.access_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      authority: response.autoridad,
    };
    forgetTenantMembership();
    setTenant(null);
    setPlatform(next);
    return next;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      tenant,
      tenantReady,
      platform,
      openTenantSession,
      openPlatformSession,
      clearTenant,
      clearPlatform,
      clearAll,
    }),
    [
      tenant,
      tenantReady,
      platform,
      openTenantSession,
      openPlatformSession,
      clearTenant,
      clearPlatform,
      clearAll,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSessions debe usarse dentro de SessionProvider.');
  return context;
}
