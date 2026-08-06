/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { api } from '../lib/api';
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
  platform: PlatformSession | null;
  openTenantSession: (user: User, access: SessionAccess) => Promise<TenantSession>;
  openPlatformSession: (user: User) => Promise<PlatformSession>;
  clearTenant: () => void;
  clearPlatform: () => void;
  clearAll: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantSession | null>(null);
  const [platform, setPlatform] = useState<PlatformSession | null>(null);
  const previousUid = useRef<string | null>(null);

  const clearTenant = useCallback(() => setTenant(null), []);
  const clearPlatform = useCallback(() => setPlatform(null), []);
  const clearAll = useCallback(() => {
    setTenant(null);
    setPlatform(null);
  }, []);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (previousUid.current !== uid) clearAll();
    previousUid.current = uid;
  }, [clearAll, user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTenant((current) => (current && current.expiresAt <= now ? null : current));
      setPlatform((current) => (current && current.expiresAt <= now ? null : current));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const openTenantSession = useCallback(async (firebaseUser: User, access: SessionAccess) => {
    const firebaseToken = await firebaseUser.getIdToken(true);
    const response = await api.createTenantContext(firebaseToken, access.membresia_id);
    const next: TenantSession = {
      access,
      token: response.access_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      context: response.contexto,
    };
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
    setTenant(null);
    setPlatform(next);
    return next;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      tenant,
      platform,
      openTenantSession,
      openPlatformSession,
      clearTenant,
      clearPlatform,
      clearAll,
    }),
    [
      tenant,
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
