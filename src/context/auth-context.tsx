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
    return observeAuth((nextUser) => {
      setUser(nextUser);
      setReady(true);
    });
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
