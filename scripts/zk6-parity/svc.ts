/**
 * svc.ts — service-role REST client for parity harness.
 *
 * Used for: pre-start sanity checks, between-run cleanup, post-run captures.
 * Never passed to the engines themselves — engines/zk6.ts uses anon key (via
 * the expo-constants shim) and the edge fn uses its own service-role key.
 */

import { config as loadEnv } from 'dotenv';
// Order matters: load `.env` first (EXPO_PUBLIC_* anon-key vars used by the
// local-engine shim), then `.env.backtest` (SUPABASE_URL + service-role key
// used by the harness itself). The second load only fills in missing vars,
// so .env's values stay intact unless .env.backtest sets the same key.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SVC_KEY) {
  throw new Error(
    '[zk6-parity] Missing service-role credentials. Populate .env.backtest with ' +
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const HEADERS = {
  apikey: SVC_KEY,
  Authorization: `Bearer ${SVC_KEY}`,
  'Content-Type': 'application/json',
};

export async function svcGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: 'GET', headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[svc GET] ${res.status} ${path.split('?')[0]}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function svcDelete(path: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: 'DELETE', headers: HEADERS });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`[svc DELETE] ${res.status} ${path.split('?')[0]}: ${body.slice(0, 200)}`);
  }
}

export function getEdgeFunctionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

export function getServiceRoleAuthHeader(): Record<string, string> {
  return { apikey: SVC_KEY!, Authorization: `Bearer ${SVC_KEY}` };
}

export function getProjectUrl(): string {
  return SUPABASE_URL!;
}
