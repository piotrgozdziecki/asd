import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase/config';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account'
});
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');

let cachedAccessToken: string | null = typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
let activeSignInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || (typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null);
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else {
        if (onAuthSuccess) onAuthSuccess(user, '');
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') sessionStorage.removeItem('gdrive_access_token');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (activeSignInPromise) {
    return activeSignInPromise;
  }

  activeSignInPromise = (async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';

      if (accessToken) {
        cachedAccessToken = accessToken;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('gdrive_access_token', cachedAccessToken);
        }
      }
      return { user: result.user, accessToken };
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user' || code === 'auth/user-cancelled') {
        console.info('[Auth] Logowanie anulowane przez użytkownika.');
        return null;
      }
      if (code === 'auth/popup-blocked') {
        console.warn('[Auth] Okno logowania zostało zablokowane przez przeglądarkę.');
        return null;
      }
      console.error('Sign in error:', error);
      return null;
    } finally {
      activeSignInPromise = null;
    }
  })();

  return activeSignInPromise;
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('gdrive_access_token');
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  }
  return null;
};

export const logout = async () => {
  try {
    await auth.signOut();
    cachedAccessToken = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('gdrive_access_token');
    }
  } catch (err) {
    console.warn('[Auth] Logout error:', err);
  }
};
