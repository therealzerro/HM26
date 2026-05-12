/**
 * data.ts — Node-native Supabase REST client for the backtest harness.
 *
 * READ-ONLY: only GET requests are implemented. No POST/PATCH/DELETE.
 * Loads credentials from .env.backtest (service role key — never from .env).
 * Service role key is never logged or printed.
 */

import { config as loadEnv } from 'dotenv';

// Load .env.backtest specifically — not the app's .env (which lacks svc key).
loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SVC_KEY) {
  console.error(
    '\n[backtest] Missing credentials.\n' +
    'Copy .env.backtest.example → .env.backtest and fill in:\n' +
    '  SUPABASE_URL=https://<project-ref>.supabase.co\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=<from Supabase Dashboard → Project Settings → API>\n' +
    '\nThe service role key MUST NOT go in .env — that file is bundled into the published app.\n',
  );
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  'apikey': SVC_KEY,
  'Authorization': `Bearer ${SVC_KEY}`,
  'Content-Type': 'application/json',
};

async function fetchOnce(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { method: 'GET', headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    // Redact key from any error output
    throw new Error(`[backtest] HTTP ${res.status} on GET ${path.split('?')[0]}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function dbGet<T = unknown>(path: string): Promise<T> {
  // Two attempts: retry once on transient network errors (not on 4xx/5xx).
  try {
    return await fetchOnce(path) as T;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('HTTP 4') || msg.includes('HTTP 5')) throw err;
    // Retry once on network-level errors
    return await fetchOnce(path) as T;
  }
}
