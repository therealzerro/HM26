import React, { createContext, useContext, useState } from 'react';

export type AppMode = 'zk6' | 'zk30';

export interface AppModeContextValue {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  activeJurisdiction: string;
  setActiveJurisdiction: (j: string) => void;
}

export const AppModeContext = createContext<AppModeContextValue | null>(null);

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error('useAppMode must be used inside AppModeProvider');
  return ctx;
}

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>('zk6');
  const [activeJurisdiction, setActiveJurisdiction] = useState<string>('TX');

  return (
    <AppModeContext.Provider value={{ mode, setMode, activeJurisdiction, setActiveJurisdiction }}>
      {children}
    </AppModeContext.Provider>
  );
}
