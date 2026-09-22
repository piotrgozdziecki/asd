import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  accessToken: string | null;
  hasDriveAccess: boolean;
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  accessToken: null,
  hasDriveAccess: false,
  login: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? sessionStorage.getItem('gdrive_access_token') : null;
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('gdrive_access_token');
        }
      }
    });
    return unsubscribe;
  }, []);

  const login = async (): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      // Add Google Drive scopes for reading, picking, and saving files
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken || null;

      if (token) {
        setAccessToken(token);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('gdrive_access_token', token);
        }
      }
      return token;
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setAccessToken(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('gdrive_access_token');
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      accessToken, 
      hasDriveAccess: !!accessToken,
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

