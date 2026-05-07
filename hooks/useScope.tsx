import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scope } from '@/types/core';

interface ScopeState {
  scope: Scope;
  setScope: (scope: Scope) => Promise<void>;
}

export const [ScopeProvider, useScope] = createContextHook<ScopeState>(() => {
  const [scope, setScopeState] = useState<Scope>('allday');

  useEffect(() => {
    loadScope();
  }, []);

  const loadScope = async () => {
    try {
      const stored = await AsyncStorage.getItem('selectedScope');
      if (stored && ['allday', 'midday', 'evening'].includes(stored)) {
        setScopeState(stored as Scope);
      }
    } catch (error) {
      console.error('Failed to load scope:', error);
    }
  };

  const setScope = useCallback(async (newScope: Scope) => {
    setScopeState(newScope);
    AsyncStorage.setItem('selectedScope', newScope).catch(console.error);
  }, []);

  return useMemo(() => ({ scope, setScope }), [scope, setScope]);
});