/**
 * Harness shim for lib/adminOps (the SEC-05 write gateway). In production the
 * engine's persistence goes through the admin-ops edge fn, authenticated by an
 * X-Admin-Key held in AsyncStorage — neither exists in the Node harness. The
 * parity harness compares engine OUTPUTS, not gateway behavior, and invoke.ts
 * already swaps the service-role key into EXPO_PUBLIC_SUPABASE_ANON_KEY, so a
 * direct PostgREST write carries privileges equivalent to the gateway. Route
 * adminOpsFetch straight to fetchFromSupabase, mapping `prefer` onto the
 * Prefer header. (Predecessor: the async-storage empty shim alone, which broke
 * with "getItem is not a function" once parity re-ran after SEC-05 — the write
 * path DOES execute during parity; its rows are what capture.ts diffs.)
 */
import { fetchFromSupabase } from '../../lib/supabase';

export async function adminOpsFetch({ path, method, body, prefer, timeoutMs }) {
  return fetchFromSupabase({
    path,
    method,
    body,
    timeoutMs,
    ...(prefer ? { headers: { Prefer: prefer } } : {}),
  });
}

export class AdminKeyMissingError extends Error {}
export class AdminKeyInvalidError extends Error {}
