'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { apiClient } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  needsPassphrase: boolean;
  passphraseSetupDone: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null);
  const [isLoading, setIsLoading]         = useState(true);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      apiClient.get('/profile')
        .then((data) => {
          setUser(data);
          // Deteksi kebutuhan setup passphrase bahkan setelah page refresh
          if (data.role === 'pelanggan' && !data.has_passphrase) {
            setNeedsPassphrase(true);
          }
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const data = await apiClient.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser({
      id: data.user_id,
      name: data.name,
      email,
      role: data.role,
    });
    setNeedsPassphrase(!!data.needs_passphrase);
  };

  const refreshUser = async () => {
    const data = await apiClient.get('/profile');
    setUser(data);
    if (data.role === 'pelanggan' && !data.has_passphrase) {
      setNeedsPassphrase(true);
    }
  };

  const passphraseSetupDone = () => {
    setNeedsPassphrase(false);
    router.replace('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setNeedsPassphrase(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isLoading, needsPassphrase, passphraseSetupDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
