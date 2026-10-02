import React, { createContext, useContext } from 'react';

interface AuthContextType {
  user: null;
  loading: boolean;
  isLoggingIn: boolean;
  accessToken: string | null;
  hasDriveAccess: boolean;
  login: () => Promise<string | null>;
  logout: () => Promise<void>;
  clearDriveAccess: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  isLoggingIn: false,
  accessToken: null,
  hasDriveAccess: false,
  login: async () => null,
  logout: async () => {},
  clearDriveAccess: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value: AuthContextType = {
    user: null,
    loading: false,
    isLoggingIn: false,
    accessToken: null,
    hasDriveAccess: false,
    login: async () => null,
    logout: async () => {},
    clearDriveAccess: () => {}
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
