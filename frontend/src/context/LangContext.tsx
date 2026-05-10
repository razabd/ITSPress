'use client';

import { createContext, useContext, ReactNode } from 'react';
import { t as translate } from '@/lib/i18n';

interface LangContextType {
  t: (key: string) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  return (
    <LangContext.Provider value={{ t: translate }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
