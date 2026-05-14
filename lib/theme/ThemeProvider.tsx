/**
 * Theme context + provider + useTheme hook.
 *
 * Three user modes: 'system' (follow device), 'light', 'dark'.
 * Persisted to AsyncStorage under THEME_STORAGE_KEY. Default: 'system'.
 *
 * Consumers call `useTheme()` to get { colors, mode, scheme, setMode }.
 * `colors` is structurally identical to the legacy `constants/theme.ts`
 * colors object, so migrations are mechanical:
 *   import { theme } from '@/constants/theme';
 *   theme.colors.background
 * becomes:
 *   import { useTheme } from '@/lib/theme';
 *   const { colors } = useTheme();
 *   colors.background
 *
 * The non-color theme tokens (spacing/typography/etc.) DON'T vary by mode —
 * keep importing those from `@/constants/theme` as before.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type ColorTokens } from './palettes';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'hm:theme-mode';

interface ThemeContextValue {
  /** What the user picked: 'system' | 'light' | 'dark'. */
  mode: ThemeMode;
  /** Resolved scheme actually in effect: 'light' | 'dark'. */
  scheme: ResolvedScheme;
  /** Active color palette — drop-in replacement for `theme.colors`. */
  colors: ColorTokens;
  /** Persists to AsyncStorage and triggers re-render. */
  setMode: (m: ThemeMode) => void;
}

// Default value: dark scheme + a no-op setter. The Provider replaces this.
// Using dark as the unprovider fallback means anything that ignores the
// Provider keeps current visual behavior.
const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  scheme: 'dark',
  colors: darkColors,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage once on mount. Render dark until hydration
  // completes so first paint matches the legacy singleton's value.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(stored => {
        if (!alive) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => { /* no-op: keep default 'system' */ })
      .finally(() => { if (alive) setHydrated(true); });
    return () => { alive = false; };
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(THEME_STORAGE_KEY, m).catch(err =>
      console.warn('[theme] failed to persist mode:', err)
    );
  };

  const value: ThemeContextValue = useMemo(() => {
    // Until hydrated, force dark to avoid a flash if the user has chosen light.
    // After hydration, resolve normally.
    let scheme: ResolvedScheme = 'dark';
    if (hydrated) {
      if (mode === 'light') scheme = 'light';
      else if (mode === 'dark') scheme = 'dark';
      else scheme = (systemScheme === 'light' ? 'light' : 'dark');
    }
    return {
      mode,
      scheme,
      colors: scheme === 'light' ? lightColors : darkColors,
      setMode,
    };
  }, [hydrated, mode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
