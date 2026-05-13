import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface CoffeeModeState {
  enabled: boolean;
  toggle: () => Promise<void>;
  set: (v: boolean) => Promise<void>;
}

const STORAGE_KEY = 'coffee_mode_enabled_v1';

/**
 * Morning coffee mode (enhancements §3.5) — when on, Home strips all
 * chrome (gradient header, status strip, hero band, banners, sparkline,
 * trending, loss card, confidence pill, pro gate, budget planner) and
 * shows only the scope switcher + 6 K6 picks + countdown.
 *
 * Power users who already know the engine just want their numbers fast.
 */
export const [CoffeeModeProvider, useCoffeeMode] = createContextHook<CoffeeModeState>(() => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => setEnabled(v === '1')).catch(() => {});
  }, []);

  const set = useCallback(async (v: boolean) => {
    setEnabled(v);
    try { await AsyncStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {}
  }, []);

  const toggle = useCallback(async () => {
    setEnabled(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0').catch(() => {});
      return next;
    });
  }, []);

  return useMemo(() => ({ enabled, toggle, set }), [enabled, toggle, set]);
});
