import { FirebaseError } from 'firebase/app';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getMultiFactorResolver,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updateProfile,
  verifyPasswordResetCode,
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

export async function createPasswordAccount(
  email: string,
  password: string,
): Promise<User> {
  const auth = await readyAuth();
  if (auth.currentUser) await signOut(auth);
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function applyEmailVerificationCode(code: string): Promise<void> {
  const auth = await readyAuth();
  await applyActionCode(auth, code);
  if (auth.currentUser) await auth.currentUser.reload();
}

export async function inspectPasswordResetCode(code: string): Promise<string> {
  const auth = await readyAuth();
  return verifyPasswordResetCode(auth, code);
}

export async function applyPasswordReset(code: string, password: string): Promise<void> {
  const auth = await readyAuth();
  await confirmPasswordReset(auth, code, password);
}

export async function updateFirebaseDisplayName(user: User, name: string): Promise<void> {
  await updateProfile(user, { displayName: name.trim() });
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

export async function firebaseSignOut(): Promise<void> {
  if (!firebaseConfigured) return;
  const auth = await readyAuth();
  await signOut(auth);
}
