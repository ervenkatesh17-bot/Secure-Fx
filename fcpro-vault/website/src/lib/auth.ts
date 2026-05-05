'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authApi, setAuthToken, type AuthUser } from './api';

interface UseAuthOptions {
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

interface UseAuthResult {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signOut: () => void;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthResult {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const storedToken = window.localStorage.getItem('fcpro_token');

    async function verify(): Promise<void> {
      if (storedToken === null) {
        setAuthToken(null);

        if (options.requireAuth) {
          router.replace('/login');
        }

        if (mounted) {
          setLoading(false);
        }

        return;
      }

      setAuthToken(storedToken);

      try {
        const currentUser = await authApi.me();

        if (!mounted) {
          return;
        }

        setUser(currentUser);
        setToken(storedToken);

        if (options.requireAdmin && currentUser.role !== 'admin') {
          router.replace('/dashboard');
        }
      } catch {
        window.localStorage.removeItem('fcpro_token');
        setAuthToken(null);

        if (options.requireAuth) {
          router.replace('/login');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void verify();

    return () => {
      mounted = false;
    };
  }, [options.requireAdmin, options.requireAuth, router]);

  function signOut(): void {
    window.localStorage.removeItem('fcpro_token');
    setAuthToken(null);
    setUser(null);
    setToken(null);
    router.replace('/login');
  }

  return { user, token, loading, signOut };
}
