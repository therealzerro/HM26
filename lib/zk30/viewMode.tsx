// lib/zk30/viewMode.tsx
//
// View-mode context for ZK30 surfaces. Default is "subscriber" for
// non-admin users (the bulk of the audience); admins default to "operator"
// (engine-internal vocab so debugging stays fast). User preference
// persists across app restarts via AsyncStorage.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { storage } from '@/lib/storage';
import { useAuth } from '@/hooks/useAuth';
import type { ViewMode } from './labelMaps';

const STORAGE_KEY = 'zk30_view_mode';

interface Ctx {
  mode: ViewMode;
  setMode: (m: ViewMode) => Promise<void>;
  /** True when the active user can switch into operator mode (admin only).
   *  Drives whether the Profile toggle renders the Operator option. */
  canToggleOperator: boolean;
}

const ViewModeContext = createContext<Ctx | null>(null);

export function ZK30ViewModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Default mode resolves from role on first mount; persisted override
  // takes precedence once loaded.
  const [mode, setModeState] = useState<ViewMode>(isAdmin ? 'operator' : 'subscriber');

  useEffect(() => {
    let cancelled = false;
    storage.getItem(STORAGE_KEY).then(v => {
      if (cancelled) return;
      if (v === 'operator' || v === 'subscriber') {
        // Non-admin user shouldn't be able to read a stale 'operator'
        // preference (e.g. if they were admin previously). Force back
        // to subscriber if role check fails.
        if (v === 'operator' && !isAdmin) setModeState('subscriber');
        else setModeState(v);
      } else {
        setModeState(isAdmin ? 'operator' : 'subscriber');
      }
    });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const setMode = useCallback(async (m: ViewMode) => {
    if (m === 'operator' && !isAdmin) return; // guard against external misuse
    setModeState(m);
    await storage.setItem(STORAGE_KEY, m).catch(() => {});
  }, [isAdmin]);

  return (
    <ViewModeContext.Provider value={{ mode, setMode, canToggleOperator: isAdmin }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useZK30ViewMode(): Ctx {
  const ctx = useContext(ViewModeContext);
  // Fall back to subscriber-mode no-op so consumers don't crash if rendered
  // outside the provider — useful for tests, Storybook, and static screens.
  if (!ctx) {
    return {
      mode: 'subscriber',
      setMode: async () => {},
      canToggleOperator: false,
    };
  }
  return ctx;
}
