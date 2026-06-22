/**
 * write.ts — write-capable Supabase REST client for the backfill writer ONLY.
 *
 * Deliberately separate from scripts/backtest/data.ts (which is READ-ONLY by
 * contract). Uses the service-role key from .env.backtest — never logged. Every
 * mutation here is gated behind backfill-slate.ts's --apply flag and parity gate;
 * nothing in this module decides to write on its own.
 */

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SVC_KEY) {
  console.error('[backfill] Missing .env.backtest credentials (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const FUNCTIONS = `${SUPABASE_URL}/functions/v1`;

function headers(prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: SVC_KEY!,
    Authorization: `Bearer ${SVC_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function sbPost(path: string, body: unknown, prefer = 'return=minimal'): Promise<unknown> {
  const res = await fetch(`${REST}${path}`, { method: 'POST', headers: headers(prefer), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '(unreadable)');
    throw new Error(`POST ${path.split('?')[0]} → HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

export async function sbPatch(path: string, body: unknown, prefer = 'return=minimal'): Promise<void> {
  const res = await fetch(`${REST}${path}`, { method: 'PATCH', headers: headers(prefer), body: JSON.stringify(body) });
  if (!res.ok) {
    const txt = await res.text().catch(() => '(unreadable)');
    throw new Error(`PATCH ${path.split('?')[0]} → HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
}

export async function sbDelete(path: string): Promise<void> {
  const res = await fetch(`${REST}${path}`, { method: 'DELETE', headers: headers('return=minimal') });
  if (!res.ok) {
    const txt = await res.text().catch(() => '(unreadable)');
    throw new Error(`DELETE ${path.split('?')[0]} → HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
}

/** Invoke an edge function (e.g. run-hit-detection) with the service-role key. */
export async function invokeFunction(name: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const txt = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`invoke ${name} → HTTP ${res.status}: ${txt.slice(0, 300)}`);
  try { return JSON.parse(txt); } catch { return txt; }
}
