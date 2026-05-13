import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scope } from '@/types/core';
import { getTodayET } from '@/lib/dateUtils';

interface ScopeState {
  scope: Scope;
  setScope: (scope: Scope) => Promise<void>;
}

// §3.6 — time-of-day default scope. Returns the scope most likely to be
// useful at the current ET hour. Only applied when the user hasn't picked
// a scope today; an explicit user choice always wins for the rest of the day.
//
//   < 1 PM ET  → midday  (planning today's midday draw)
//   < 8 PM ET  → evening (after midday draw, before evening draw)
//   ≥ 8 PM ET  → allday  (tomorrow's planning context)
function defaultScopeForTime(): Scope {
  try {
    const etHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).replace(/[^0-9]/g, ''),
      10,
    );
    if (!Number.isFinite(etHour)) return 'allday';
    if (etHour < 13) return 'midday';
    if (etHour < 20) return 'evening';
    return 'allday';
  } catch {
    return 'allday';
  }
}

export const [ScopeProvider, useScope] = createContextHook<ScopeState>(() => {
  const [scope, setScopeState] = useState<Scope>(() => defaultScopeForTime());

  useEffect(() => {
    loadScope();
  }, []);

  const loadScope = async () => {
    try {
      const today = getTodayET();
      const storedScope = await AsyncStorage.getItem('selectedScope');
      const storedDate = await AsyncStorage.getItem('selectedScopeDate');
      // Respect today's explicit user choice; otherwise compute from time of day.
      if (storedScope && storedDate === today && ['allday', 'midday', 'evening'].includes(storedScope)) {
        setScopeState(storedScope as Scope);
      } else {
        setScopeState(defaultScopeForTime());
      }
    } catch (error) {
      console.error('Failed to load scope:', error);
    }
  };

  const setScope = useCallback(async (newScope: Scope) => {
    setScopeState(newScope);
    const today = getTodayET();
    AsyncStorage.setItem('selectedScope', newScope).catch(console.error);
    AsyncStorage.setItem('selectedScopeDate', today).catch(console.error);
  }, []);

  return useMemo(() => ({ scope, setScope }), [scope, setScope]);
});