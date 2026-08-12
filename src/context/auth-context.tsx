/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import { firebaseConfigured, firebaseSignOut, observeAuth } from '../lib/firebase';
import { hasBrowserSession } from '../lib/browser-session';

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!firebaseConfigured);

  useEffect(() => {
    let active = true;
    const unsubscribe = observeAuth((nextUser) => {
      if (nextUser && !hasBrowserSession()) {
        setUser(null);
        void firebaseSignOut().finally(() => {
          if (active) setReady(true);
        });
        return;
      }
      setUser(nextUser);
      setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      configured: firebaseConfigured,
      signOut: firebaseSignOut,
    }),
    [ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
