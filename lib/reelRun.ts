/**
 * reelRun — client for the reel-run Edge Function (OPS-09, 2026-11-25).
 *
 * Starts the daily reel run on a GitHub runner and reads the newest run's
 * state. Operator-triggered only: these are called from the Admin → Reels
 * button and its status poll, never from a timer that starts work.
 *
 * Auth mirrors adminOps: the stored ADMIN_OPS_KEY goes out as X-Admin-Key.
 */

import Constants from 'expo-constants';
import {
  getStoredAdminKey,
  AdminKeyMissingError,
  AdminKeyInvalidError,
} from './subscriberAdminClient';

const extra = Constants.expoConfig?.extra || {};
const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Order the run walks; `verify` = the full run. Mirrors scripts/run-daily-reels.sh ORDER. */
export const REEL_RUN_KINDS = ['verify', 'allday', 'midday', 'evening', 'record'] as const;
export type ReelRunKind = typeof REEL_RUN_KINDS[number];

export interface ReelRun {
  id: number;
  run_number: number;
  /** queued | in_progress | completed (GitHub also uses waiting / requested / pending before a runner picks it up) */
  status: string;
  /** success | failure | cancelled | timed_out … — null until completed */
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface ReelRunStatus {
  /** false = the GitHub token secret is not set on the edge function yet */
  configured: boolean;
  run: ReelRun | null;
}

export const isReelRunActive = (run: ReelRun | null | undefined): boolean =>
  !!run && run.status !== 'completed';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase configuration missing');
  const adminKey = await getStoredAdminKey();
  if (!adminKey) throw new AdminKeyMissingError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/reel-run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new AdminKeyInvalidError();

  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }
  if (!res.ok || parsed?.error) throw new Error(parsed?.error || `reel-run error ${res.status}`);
  return parsed as T;
}

export const fetchReelRunStatus = (): Promise<ReelRunStatus> => call<ReelRunStatus>({ action: 'status' });

export const startReelRun = (from: ReelRunKind = 'verify'): Promise<{ started: true; from: ReelRunKind }> =>
  call({ action: 'start', from });
