import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

// The user's highest access level (admin > volunteer > client/"caller" >
// family), decided once by the server — screens read this instead of
// re-deriving it from `roles`. `roles` still lists everything held, including
// donor/premium, which aren't access levels.
export type PrimaryRole = 'admin' | 'volunteer' | 'client' | 'family';

interface AuthUser {
  email: string;
  full_name: string;
  roles: string[];
  primary_role: PrimaryRole | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const json = await res.json();
      setUser(res.ok && json.success ? (json.user as AuthUser) : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
