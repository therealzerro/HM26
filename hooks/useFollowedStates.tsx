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
    // Expand individual ME / NH / VT follows to also include the composite
    // `ME,NH,VT` jurisdiction code — the Tri-State Pick 3 drawing IS shared
    // between those three states, so following any of them should surface
    // the Tri-State hits. Same idea for BC/AB → W.Canada when applicable.
    const expanded = new Set(followed);
    if (followed.some(s => s === 'ME' || s === 'NH' || s === 'VT')) {
      expanded.add('ME,NH,VT');
    }
    if (followed.some(s => s === 'BC' || s === 'AB')) {
      expanded.add('W.Canada');
    }
    // Values containing commas (e.g. `ME,NH,VT`) must be wrapped in double
    // quotes per PostgREST `in.(...)` syntax — otherwise PostgREST splits
    // the composite on the embedded comma and reads it as three separate
    // values (ME, NH, VT), missing the actual `ME,NH,VT` row.
    const formatted = [...expanded].map(s =>
      s.includes(',') ? `"${encodeURIComponent(s)}"` : encodeURIComponent(s),
    );
    return `&jurisdiction=in.(${formatted.join(',')})`;
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
