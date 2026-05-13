import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface FollowedStatesState {
  followed: string[];        // jurisdiction codes the user has followed (empty = show all)
  isFollowing: (code: string) => boolean;
  toggle: (code: string) => Promise<void>;
  clear: () => Promise<void>;
  // Build a PostgREST `jurisdiction=in.(A,B,C)` clause if there's at least
  // one followed state; returns empty string when followed is empty so the
  // caller falls through to "show all" behavior.
  toPostgrestFilter: () => string;
}

const STORAGE_KEY = 'followed_states_v1';

export const [FollowedStatesProvider, useFollowedStates] = createContextHook<FollowedStatesState>(() => {
  const [followed, setFollowed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) setFollowed(arr.filter(x => typeof x === 'string'));
          } catch {}
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const persist = useCallback(async (next: string[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const isFollowing = useCallback((code: string) => followed.includes(code), [followed]);

  const toggle = useCallback(async (code: string) => {
    setFollowed(prev => {
      const next = prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code];
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(async () => {
    setFollowed([]);
    await persist([]);
  }, [persist]);

  const toPostgrestFilter = useCallback(() => {
    if (!loaded || followed.length === 0) return '';
    return `&jurisdiction=in.(${followed.map(s => encodeURIComponent(s)).join(',')})`;
  }, [loaded, followed]);

  return useMemo(() => ({ followed, isFollowing, toggle, clear, toPostgrestFilter }), [followed, isFollowing, toggle, clear, toPostgrestFilter]);
});

// Common Pick 3 jurisdictions, grouped for the picker UI. Adjust as needed.
export const JURISDICTION_GROUPS: Array<{ label: string; codes: string[] }> = [
  { label: 'Northeast', codes: ['NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'DC'] },
  { label: 'Southeast', codes: ['FL', 'GA', 'NC', 'SC', 'VA', 'TN', 'KY', 'AL', 'LA', 'AR'] },
  { label: 'Midwest',   codes: ['OH', 'IL', 'IN', 'MI', 'MO', 'IA', 'KS', 'NE', 'OK', 'WI', 'MN'] },
  { label: 'West',      codes: ['CA', 'TX', 'AZ', 'CO', 'NM', 'NV', 'OR', 'WA', 'ID'] },
  { label: 'Other',     codes: ['DE', 'WV'] },
  { label: 'Canada',    codes: ['ON', 'QC', 'BC', 'AB'] },
];
