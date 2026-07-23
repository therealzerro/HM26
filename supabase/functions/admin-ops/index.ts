/**
 * admin-ops — Supabase Edge Function (SEC-05, 2026-06-10)
 *
 * Service-role write gateway for ALL operator mutations against engine/data
 * tables. Part of the SEC-05 write-path hardening: the app's anon key is
 * being reduced to read-only (+ narrow push_tokens / saved_slates writes),
 * and every operator write moves here.
 *
 * Auth: X-Admin-Key header must match the ADMIN_OPS_KEY env secret — the
 * same key and storage flow as the subscriber-admin gateway (entered once
 * via AdminKeyGate, held in AsyncStorage, never bundled).
 *
 * POST body: { path: string; method: 'POST'|'PATCH'|'DELETE'; body?: unknown; prefer?: string }
 *   `path` is a PostgREST path exactly as the app already builds it
 *   (e.g. "/rest/v1/daily_intelligence?slate_date=eq.2026-06-10"), so client
 *   call-site diffs are mechanical (fetchFromSupabase → adminOpsFetch).
 *
 * Hard rails (server-side, not bypassable by the client):
 *   - table allowlist (ZK6 operator write targets only; zk30 tables excluded
 *     per the 2026-06-10 ZK6-only mandate)
 *   - PATCH/DELETE must carry at least one filter (no whole-table mutations)
 *   - path must be a clean /rest/v1/<table> reference (no traversal)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_OPS_KEY = Deno.env.get('ADMIN_OPS_KEY') ?? '';
const ADMIN_UNLOCK_PIN = Deno.env.get('ADMIN_UNLOCK_PIN') ?? '';

const ALLOWED_TABLES = new Set([
  'histories',
  'datasets_box',
  'datasets_pair',
  'imports',
  'daily_intelligence',
  'adaptive_tracking',
  'app_config',
  'slate_snapshots',
  'audit_logs',
  'horizon_blends',
  'percentile_maps',
  'engine_runs',
]);

const ALLOWED_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Extract the table name from a /rest/v1/<table>?query path, or null if malformed. */
function parseTable(path: string): string | null {
  if (!path.startsWith('/rest/v1/') || path.includes('..')) return null;
  const rest = path.slice('/rest/v1/'.length);
  const table = rest.split('?')[0];
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) return null;
  if (rest.includes('/')) return null; // no rpc/, no nested resources
  return table;
}

/** PATCH/DELETE must target filtered rows, never the whole table. */
function hasRowFilter(path: string): boolean {
  const q = path.split('?')[1] ?? '';
  return q.split('&').some((p) => /^[a-z_][a-z0-9_.]*=(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd)\./.test(p));
}

/**
 * 4-digit quick-unlock (SEC-05 UX): exchanges ADMIN_UNLOCK_PIN for the ops key
 * so the operator never types the long secret on a new device. The key still
 * NEVER ships in the app bundle — it only leaves the server on a correct PIN.
 * Brute-force rail: 5 failed attempts in any 15-minute window locks the
 * endpoint (ledger in admin_unlock_attempts, service-role only).
 */
async function handleUnlock(pin: unknown): Promise<Response> {
  if (!ADMIN_UNLOCK_PIN || !ADMIN_OPS_KEY) return json(503, { error: 'quick unlock not configured' });
  const svcHeaders = {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const failsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_unlock_attempts?attempted_at=gte.${encodeURIComponent(since)}&success=eq.false&select=id&limit=6`,
    { headers: svcHeaders },
  );
  const fails = failsRes.ok ? await failsRes.json() : null;
  if (!Array.isArray(fails)) return json(503, { error: 'unlock ledger unavailable' });
  if (fails.length >= 5) return json(429, { error: 'too many attempts — quick unlock locked for 15 minutes' });

  const ok = typeof pin === 'string' && pin.trim().length >= 4 && pin.trim() === ADMIN_UNLOCK_PIN;
  await fetch(`${SUPABASE_URL}/rest/v1/admin_unlock_attempts`, {
    method: 'POST',
    headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ success: ok }),
  });
  if (!ok) return json(401, { error: 'wrong code' });
  return json(200, { adminKey: ADMIN_OPS_KEY });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let payload: { action?: string; pin?: unknown; path?: string; method?: string; body?: unknown; prefer?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  // PIN exchange is the ONLY action allowed without the ops key header.
  if (payload.action === 'unlock') return handleUnlock(payload.pin);

  const adminKey = req.headers.get('x-admin-key') ?? '';
  if (!ADMIN_OPS_KEY || adminKey !== ADMIN_OPS_KEY) {
    return json(401, { error: 'unauthorized' });
  }

  const { path, method, body, prefer } = payload;
  if (typeof path !== 'string' || typeof method !== 'string') {
    return json(400, { error: 'path and method are required' });
  }
  if (!ALLOWED_METHODS.has(method)) {
    return json(400, { error: `method ${method} not allowed` });
  }
  const table = parseTable(path);
  if (!table) return json(400, { error: 'malformed path' });
  if (!ALLOWED_TABLES.has(table)) {
    return json(403, { error: `table ${table} not in allowlist` });
  }
  if ((method === 'PATCH' || method === 'DELETE') && !hasRowFilter(path)) {
    return json(400, { error: `${method} requires a row filter` });
  }

  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const upstream = await fetch(SUPABASE_URL + path, {
    method,
    headers,
    body: method === 'DELETE' ? undefined : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    return json(upstream.status, { error: `upstream ${upstream.status}: ${text.slice(0, 500)}` });
  }
  // Mirror fetchFromSupabase semantics: empty body (return=minimal) → null result.
  let result: unknown = null;
  if (text) {
    try { result = JSON.parse(text); } catch { result = text; }
  }
  return json(200, { result });
});
