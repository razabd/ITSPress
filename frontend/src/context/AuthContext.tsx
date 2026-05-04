'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { apiClient } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ approval_status?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  needsPassphrase: boolean;
  passphraseSetupDone: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]                   = useState<User | null>(null);
  const [token, setToken]                 = useState<string | null>(null);
  const [isLoading, setIsLoading]         = useState(true);
  const [needsPassphrase, setNeedsPassphrase] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
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
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string): Promise<{ approval_status?: string }> => {
    const data = await apiClient.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser({
      id: data.user_id,
      name: data.name,
      email,
      role: data.role,
      approval_status: data.approval_status,
      approval_note: data.approval_note,
    });
    setNeedsPassphrase(!!data.needs_passphrase);
    return { approval_status: data.approval_status };
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
    setToken(null);
    setUser(null);
    setNeedsPassphrase(false);
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading, needsPassphrase, passphraseSetupDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
