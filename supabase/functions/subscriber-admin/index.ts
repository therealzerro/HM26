/**
 * subscriber-admin — Supabase Edge Function
 *
 * Service-role gateway for all reads/writes against the subscriber tracking
 * tables (pro_subscribers, fb_group_contributors, fb_engagement_snapshots,
 * funnel_daily_snapshots, subscriber_import_history).
 *
 * Why this exists: the app uses anon-key direct REST with no Supabase Auth.
 * The tables hold email PII, so anon must be denied. This function bypasses
 * RLS via the service-role key, gated by a shared secret in the X-Admin-Key
 * header. The operator enters the secret once into the admin UI; it is
 * stored in AsyncStorage and never bundled into the JS.
 *
 * POST body: { action: string; payload?: Record<string, unknown> }
 * Header:    X-Admin-Key: <must match ADMIN_OPS_KEY env>
 *
 * Actions:
 *   list_subscribers         → SELECT pro_subscribers with optional filters
 *   upsert_subscribers       → bulk UPSERT (email key) from parsed import
 *   update_subscriber        → PATCH one row by id
 *   list_imports             → SELECT subscriber_import_history
 *   record_import            → INSERT one row into subscriber_import_history
 *   list_snapshots           → SELECT funnel_daily_snapshots
 *   upsert_snapshot          → UPSERT (snapshot_date key) into funnel_daily_snapshots
 *   list_contributors        → SELECT fb_group_contributors
 *   upsert_contributors      → bulk UPSERT contributors + INSERT engagement snapshots
 *   link_contributor         → set pro_subscriber_id + facebook_name
 *   ping                     → health probe
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_OPS_KEY = Deno.env.get('ADMIN_OPS_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function svcHeaders(prefer?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function sbPost(path: string, body: unknown, prefer = 'return=representation'): Promise<unknown> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'POST',
    headers: svcHeaders(prefer),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
  if (r.status === 204) return undefined;
  // return=minimal yields 201 with an empty body; r.json() would throw on that.
  const text = await r.text();
  return text ? JSON.parse(text) : undefined;
}

async function sbPatch(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'PATCH',
    headers: svcHeaders('return=representation'),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
  if (r.status === 204) return undefined;
  const text = await r.text();
  return text ? JSON.parse(text) : undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Action handlers ─────────────────────────────────────────────────────────

interface ListFilters {
  status?: string;
  acquisition_source?: string;
  facebook_name_null?: boolean;
  date_subscribed_gte?: string;
  date_subscribed_lte?: string;
}

async function listSubscribers(filters: ListFilters = {}) {
  const q: string[] = ['select=*'];
  if (filters.status) q.push(`status=eq.${encodeURIComponent(filters.status)}`);
  if (filters.acquisition_source) q.push(`acquisition_source=eq.${encodeURIComponent(filters.acquisition_source)}`);
  if (filters.facebook_name_null === true) q.push('facebook_name=is.null');
  if (filters.facebook_name_null === false) q.push('facebook_name=not.is.null');
  if (filters.date_subscribed_gte) q.push(`date_subscribed=gte.${filters.date_subscribed_gte}`);
  if (filters.date_subscribed_lte) q.push(`date_subscribed=lte.${filters.date_subscribed_lte}`);
  q.push('order=date_subscribed.desc');
  return sbGet(`/rest/v1/pro_subscribers?${q.join('&')}`);
}

interface UpsertSubRow {
  email: string;
  date_subscribed: string;
  status?: string;
  facebook_name?: string | null;
  acquisition_source?: string | null;
}

async function upsertSubscribers(rows: UpsertSubRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { created: 0, updated: 0, skipped: 0 };
  }
  // Normalize: lowercase email, default status='active' when missing.
  const clean = rows.map(r => ({
    email: r.email.toLowerCase().trim(),
    date_subscribed: r.date_subscribed,
    status: r.status ?? 'active',
    ...(r.facebook_name !== undefined ? { facebook_name: r.facebook_name } : {}),
    ...(r.acquisition_source !== undefined ? { acquisition_source: r.acquisition_source } : {}),
  }));

  // Capture pre-upsert state to compute created vs updated.
  const emails = clean.map(r => r.email);
  const inFilter = encodeURIComponent(`(${emails.map(e => `"${e}"`).join(',')})`);
  const existing = await sbGet<Array<{ email: string }>>(
    `/rest/v1/pro_subscribers?select=email&email=in.${inFilter}`
  );
  const existingEmails = new Set(existing.map(e => e.email));

  await sbPost(
    '/rest/v1/pro_subscribers?on_conflict=email',
    clean,
    'resolution=merge-duplicates,return=minimal'
  );

  const created = clean.filter(r => !existingEmails.has(r.email)).length;
  const updated = clean.length - created;
  return { created, updated, skipped: 0 };
}

async function findPotentialChurns(currentEmails: string[]) {
  // Active subscribers whose email is NOT in the current import.
  const active = await sbGet<Array<{ id: string; email: string; date_subscribed: string }>>(
    '/rest/v1/pro_subscribers?select=id,email,date_subscribed&status=eq.active'
  );
  const incoming = new Set(currentEmails.map(e => e.toLowerCase().trim()));
  return active.filter(a => !incoming.has(a.email));
}

interface UpdateSubPatch {
  id: string;
  facebook_name?: string | null;
  status?: string;
  date_churned?: string | null;
  acquisition_source?: string | null;
  acquisition_notes?: string | null;
  notes?: string | null;
}

async function updateSubscriber(patch: UpdateSubPatch) {
  const { id, ...rest } = patch;
  if (!id) throw new Error('id is required');
  const body: Record<string, unknown> = { ...rest };
  if (rest.status && rest.status !== 'churned') {
    body.date_churned = null;
  }
  if (rest.status) {
    body.status_changed_at = new Date().toISOString();
  }
  return sbPatch(`/rest/v1/pro_subscribers?id=eq.${id}`, body);
}

async function listImports() {
  return sbGet(
    '/rest/v1/subscriber_import_history?select=*&order=imported_at.desc&limit=50'
  );
}

interface RecordImportPayload {
  import_type: string;
  source_filename?: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  warnings?: unknown;
  errors?: unknown;
}

async function recordImport(p: RecordImportPayload) {
  return sbPost('/rest/v1/subscriber_import_history', [{
    import_type: p.import_type,
    source_filename: p.source_filename ?? null,
    import_date: new Date().toISOString().slice(0, 10),
    records_processed: p.records_processed,
    records_created: p.records_created,
    records_updated: p.records_updated,
    records_skipped: p.records_skipped,
    warnings: p.warnings ?? null,
    errors: p.errors ?? null,
  }]);
}

async function listSnapshots(limit = 60) {
  return sbGet(
    `/rest/v1/funnel_daily_snapshots?select=*&order=snapshot_date.desc&limit=${limit}`
  );
}

interface UpsertSnapshotPayload {
  snapshot_date: string;
  page_followers: number;
  free_group_members: number;
  reel_views_today?: number | null;
  content_interactions_today?: number | null;
  notes?: string | null;
}

async function upsertSnapshot(p: UpsertSnapshotPayload) {
  // Auto-compute active_pro_subscribers from source-of-truth table.
  const activeRows = await sbGet<Array<{ count: number }>>(
    '/rest/v1/pro_subscribers?select=count&status=eq.active'
  );
  // PostgREST returns count via the count=exact prefer header; without it
  // we fall back to a fetch-and-length. Use a head request for accuracy.
  const headRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_subscribers?select=id&status=eq.active`,
    { headers: { ...svcHeaders(), Prefer: 'count=exact', Range: '0-0' } }
  );
  const range = headRes.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  const active = (total && total !== '*') ? parseInt(total, 10) : activeRows.length;

  return sbPost(
    '/rest/v1/funnel_daily_snapshots?on_conflict=snapshot_date',
    [{
      snapshot_date: p.snapshot_date,
      page_followers: p.page_followers,
      free_group_members: p.free_group_members,
      active_pro_subscribers: active,
      reel_views_today: p.reel_views_today ?? null,
      content_interactions_today: p.content_interactions_today ?? null,
      notes: p.notes ?? null,
    }],
    'resolution=merge-duplicates,return=representation'
  );
}

async function listContributors(group_type?: 'free' | 'pro') {
  const q = ['select=*,fb_engagement_snapshots(snapshot_date,posts,comments,likes,engagement_score)'];
  if (group_type) q.push(`group_type=eq.${group_type}`);
  q.push('order=last_seen_at.desc');
  return sbGet(`/rest/v1/fb_group_contributors?${q.join('&')}`);
}

interface ContributorRow {
  facebook_name: string;
  group_type: 'free' | 'pro';
  posts: number;
  comments: number;
  likes: number;
}

interface UpsertContributorsPayload {
  rows: ContributorRow[];
  snapshot_date: string;
  source_filename?: string;
}

async function upsertContributors(p: UpsertContributorsPayload) {
  if (!Array.isArray(p.rows) || p.rows.length === 0) {
    return { created: 0, updated: 0, snapshots_added: 0 };
  }

  // Pre-fetch existing contributors to compute created-vs-updated.
  const groups = Array.from(new Set(p.rows.map(r => r.group_type)));
  const existingByKey = new Map<string, string>(); // "name|type" → id
  for (const g of groups) {
    const names = p.rows.filter(r => r.group_type === g).map(r => r.facebook_name);
    if (names.length === 0) continue;
    const inFilter = encodeURIComponent(`(${names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',')})`);
    const existing = await sbGet<Array<{ id: string; facebook_name: string; group_type: string }>>(
      `/rest/v1/fb_group_contributors?select=id,facebook_name,group_type&group_type=eq.${g}&facebook_name=in.${inFilter}`
    );
    for (const e of existing) existingByKey.set(`${e.facebook_name}|${e.group_type}`, e.id);
  }

  const contributorRows = p.rows.map(r => ({
    facebook_name: r.facebook_name,
    group_type: r.group_type,
    latest_posts_28d: r.posts,
    latest_comments_28d: r.comments,
    latest_likes_28d: r.likes,
    latest_window_end: p.snapshot_date,
    last_seen_at: p.snapshot_date,
  }));

  const upserted = await sbPost(
    '/rest/v1/fb_group_contributors?on_conflict=facebook_name,group_type',
    contributorRows,
    'resolution=merge-duplicates,return=representation'
  ) as Array<{ id: string; facebook_name: string; group_type: string }>;

  // Build snapshot rows keyed off the upserted ids.
  const idByKey = new Map(upserted.map(u => [`${u.facebook_name}|${u.group_type}`, u.id]));
  const snapshotRows = p.rows
    .map(r => {
      const id = idByKey.get(`${r.facebook_name}|${r.group_type}`);
      if (!id) return null;
      return {
        contributor_id: id,
        snapshot_date: p.snapshot_date,
        group_type: r.group_type,
        posts: r.posts,
        comments: r.comments,
        likes: r.likes,
        imported_from_filename: p.source_filename ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (snapshotRows.length > 0) {
    await sbPost(
      '/rest/v1/fb_engagement_snapshots?on_conflict=contributor_id,snapshot_date',
      snapshotRows,
      'resolution=merge-duplicates,return=minimal'
    );
  }

  const created = p.rows.filter(r => !existingByKey.has(`${r.facebook_name}|${r.group_type}`)).length;
  const updated = p.rows.length - created;
  return { created, updated, snapshots_added: snapshotRows.length };
}

async function linkContributor(payload: { contributor_id: string; pro_subscriber_id: string; facebook_name: string }) {
  if (!payload.contributor_id || !payload.pro_subscriber_id) {
    throw new Error('contributor_id and pro_subscriber_id are required');
  }
  await sbPatch(`/rest/v1/fb_group_contributors?id=eq.${payload.contributor_id}`,
    { pro_subscriber_id: payload.pro_subscriber_id }
  );
  await sbPatch(`/rest/v1/pro_subscribers?id=eq.${payload.pro_subscriber_id}`,
    { facebook_name: payload.facebook_name }
  );
  return { linked: true };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

// ─── fb_earnings_daily (Meta "Approximate earnings" export; 2026-09-02) ───────
interface EarningsRowIn {
  earn_date: string;
  total_usd: number;
  content_monetization_usd: number;
  stars_usd: number;
  subscriptions_usd: number;
}

async function listEarnings(days = 120) {
  return sbGet(`/rest/v1/fb_earnings_daily?select=*&order=earn_date.desc&limit=${days}`);
}

async function upsertEarnings(rows: EarningsRowIn[]) {
  if (!Array.isArray(rows) || rows.length === 0) return { created: 0, updated: 0 };
  const dates = rows.map(r => r.earn_date);
  const existing = await sbGet<Array<{ earn_date: string }>>(
    `/rest/v1/fb_earnings_daily?select=earn_date&earn_date=in.(${dates.join(',')})`
  );
  const have = new Set(existing.map(e => e.earn_date));
  await sbPost(
    '/rest/v1/fb_earnings_daily?on_conflict=earn_date',
    rows.map(r => ({ ...r, imported_at: new Date().toISOString() })),
    'resolution=merge-duplicates,return=minimal'
  );
  const created = rows.filter(r => !have.has(r.earn_date)).length;
  return { created, updated: rows.length - created };
}

interface ActionRequest {
  action: string;
  payload?: Record<string, unknown>;
}

async function handle(req: ActionRequest): Promise<unknown> {
  const { action, payload = {} } = req;
  switch (action) {
    case 'ping':
      return { ok: true, ts: new Date().toISOString() };
    case 'list_subscribers':
      return listSubscribers(payload as ListFilters);
    case 'upsert_subscribers':
      return upsertSubscribers(payload.rows as UpsertSubRow[]);
    case 'find_potential_churns':
      return findPotentialChurns(payload.emails as string[]);
    case 'update_subscriber':
      return updateSubscriber(payload as unknown as UpdateSubPatch);
    case 'list_imports':
      return listImports();
    case 'record_import':
      return recordImport(payload as unknown as RecordImportPayload);
    case 'list_snapshots':
      return listSnapshots(typeof payload.limit === 'number' ? payload.limit : 60);
    case 'upsert_snapshot':
      return upsertSnapshot(payload as unknown as UpsertSnapshotPayload);
    case 'list_contributors':
      return listContributors(payload.group_type as 'free' | 'pro' | undefined);
    case 'upsert_contributors':
      return upsertContributors(payload as unknown as UpsertContributorsPayload);
    case 'link_contributor':
      return linkContributor(payload as { contributor_id: string; pro_subscriber_id: string; facebook_name: string });
    case 'list_earnings':
      return listEarnings(typeof payload.days === 'number' ? payload.days : 120);
    case 'upsert_earnings':
      return upsertEarnings(payload.rows as EarningsRowIn[]);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  const providedKey = req.headers.get('x-admin-key') ?? '';
  if (!ADMIN_OPS_KEY || providedKey !== ADMIN_OPS_KEY) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: ActionRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400);
  }

  if (!body.action) {
    return jsonResponse({ error: 'action is required' }, 400);
  }

  try {
    const result = await handle(body);
    return jsonResponse({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[subscriber-admin]', body.action, msg);
    return jsonResponse({ error: msg }, 500);
  }
});
