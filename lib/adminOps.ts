/**
 * adminOps — client for the admin-ops Edge Function (SEC-05, 2026-06-10).
 *
 * Drop-in replacement for `fetchFromSupabase` at operator WRITE call sites:
 *
 *   await fetchFromSupabase({ path, method: 'PATCH', body })   // before
 *   await adminOpsFetch({ path, method: 'PATCH', body })       // after
 *
 * Reads stay on `fetchFromSupabase` (anon remains read-capable). The gateway
 * authenticates via the same ADMIN_OPS_KEY the subscriber-admin flow uses —
 * stored once through AdminKeyGate, attached here as X-Admin-Key. Missing or
 * rejected keys throw the shared AdminKeyMissingError / AdminKeyInvalidError
 * so existing key-prompt UI patterns apply unchanged.
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

export interface AdminOpsParams {
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Forwarded to PostgREST verbatim (e.g. 'resolution=merge-duplicates,return=minimal'). */
  prefer?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

export async function adminOpsFetch<T = unknown>({
  path,
  method,
  body,
  prefer,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AdminOpsParams): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase configuration missing');
  }
  const adminKey = await getStoredAdminKey();
  if (!adminKey) throw new AdminKeyMissingError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/admin-ops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({ path, method, body, prefer }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new AdminKeyInvalidError();

  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { error: text }; }

  if (!res.ok || parsed?.error) {
    throw new Error(parsed?.error || `admin-ops error ${res.status}`);
  }
  return parsed.result as T;
}
