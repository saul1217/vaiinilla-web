import { FirebaseError } from 'firebase/app';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  getMultiFactorResolver,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  type Auth,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let authInstance: Auth | null = null;
let persistenceReady: Promise<void> | null = null;

function getConfiguredAuth(): Auth {
  if (!firebaseConfigured) {
    throw new Error('Falta configurar Firebase en las variables VITE_FIREBASE_* del proyecto.');
  }

  if (!authInstance) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    persistenceReady = setPersistence(authInstance, browserLocalPersistence);
  }

  return authInstance;
}

export async function readyAuth(): Promise<Auth> {
  const auth = getConfiguredAuth();
  await persistenceReady;
  return auth;
}

export function observeAuth(callback: (user: User | null) => void): () => void {
  if (!firebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  const auth = getConfiguredAuth();
  return onAuthStateChanged(auth, callback);
}

export interface PasswordSignInResult {
  user?: User;
  mfaResolver?: MultiFactorResolver;
}

export async function passwordSignIn(
  email: string,
  password: string,
  requireFreshSession = false,
): Promise<PasswordSignInResult> {
  const auth = await readyAuth();
  if (requireFreshSession && auth.currentUser) await signOut(auth);

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { user: credential.user };
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'auth/multi-factor-auth-required') {
      return { mfaResolver: getMultiFactorResolver(auth, error as MultiFactorError) };
    }
    throw error;
  }
}

export async function completeTotpSignIn(
  resolver: MultiFactorResolver,
  verificationCode: string,
): Promise<User> {
  const totpHint = resolver.hints.find(
    (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
  if (!totpHint) throw new Error('La cuenta no tiene un factor TOTP compatible.');

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    totpHint.uid,
    verificationCode,
  );
  return (await resolver.resolveSignIn(assertion)).user;
}

export async function resetPassword(email: string): Promise<void> {
  const auth = await readyAuth();
  await sendPasswordResetEmail(auth, email);
}

export async function firebaseSignOut(): Promise<void> {
  if (!firebaseConfigured) return;
  const auth = await readyAuth();
  await signOut(auth);
}
