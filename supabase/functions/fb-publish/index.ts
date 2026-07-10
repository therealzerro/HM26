/**
 * fb-publish — Supabase Edge Function (SOCIAL-01)
 *
 * Service gateway between the operator app and the Meta Graph API for the
 * HitMaster Facebook PAGE, plus the publish log (social_posts) for both API
 * posts and assisted group handoffs.
 *
 * Why an edge function: the Page access token must never ship in the app
 * bundle or transit the anon-key REST surface (SEC-05). Token lives in
 * function secrets; calls are gated by the same X-Admin-Key shared secret
 * as subscriber-admin (operator enters it once, stored in AsyncStorage).
 *
 * Meta facts this is built on (verified 2026-07-09, Graph API v25.0):
 *  - POST /{page-id}/feed   {message, published?, scheduled_publish_time?}
 *  - POST /{page-id}/photos multipart {source|url, caption, published?, scheduled_publish_time?}
 *  - Single-operator app posting to its own page: Standard Access, Live
 *    mode, NO App Review / Business Verification needed.
 *  - Long-lived Page tokens do not expire (invalidated only by password
 *    change / deauth / role loss) — `status` action verifies liveness.
 *  - Scheduled publish window: 10 minutes .. 30 days from request.
 *  - Groups API removed 2024-04-22: there is NO group publish action here
 *    by design; group posts are human-assisted (log_assist records them).
 *
 * Brand-safety (Brand Rehab Skill Brief v2, 2026-05-18):
 *  - The page is Tier 1 ONLY. Server-side Tier-1 vocabulary lint runs on
 *    every page caption as defense-in-depth (client has the full engine).
 *    Violations are refused unless override:true (logged, per the brief's
 *    escalation protocol — operator owns the strategic decision).
 *  - Photo posts to the page require twoQAck {q1:false,q2:false} — the
 *    operator's explicit Two-Question filter answers.
 *
 * Secrets: ADMIN_OPS_KEY (shared with subscriber-admin), FB_PAGE_ID,
 *          FB_PAGE_TOKEN, optional FB_GRAPH_VERSION (default v25.0).
 *
 * POST body: { action: string; payload?: Record<string, unknown> }
 * Actions: ping | status | publish_page_text | publish_page_photo |
 *          log_assist | list_posts | cancel_scheduled
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_OPS_KEY = Deno.env.get('ADMIN_OPS_KEY') ?? '';
const FB_PAGE_ID = Deno.env.get('FB_PAGE_ID') ?? '';
const FB_PAGE_TOKEN = Deno.env.get('FB_PAGE_TOKEN') ?? '';
const GRAPH_VERSION = Deno.env.get('FB_GRAPH_VERSION') ?? 'v25.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Tier-1 / PUBLIC surface lint (server-side defense-in-depth) ──────────────
// The page is the API-published surface, so this guard is the last line before
// Meta's classifier. Encodes the brief §5 forbidden list + the 2026-06-29
// surface-discipline update §6 (PUBLIC: no digits, no draw results, no
// slate→draw attribution, no state codes, no pricing, no Pro/upgrade language)
// + the locked vocab law §4a (no HIT/HITS/PARTIAL MATCH). The client runs the
// full engine with suggestions; this ensures a bug or bypassed client can
// never put non-compliant content on the page silently.
const TIER1_FORBIDDEN: RegExp[] = [
  /\blottery\b/i, /\blotto\b/i, /\bpick ?3\b/i,
  /\bwinning\b/i, /\bwinners?\b/i, /\bwon\b/i, /\bwin\b/i,
  /\bpicks?\b/i, /\bhits?\b/i, /\bpartial match\b/i, /\bstraight\b/i, /\bbox\b/i,
  /\bplay(s|ed|ing)?\b/i, /\bgambl(e|ing)\b/i, /\bbet(s|ting)?\b/i,
  /\bluck(y)?\b/i, /\bjackpot\b/i, /\bpayout\b/i, /\bfortune\b/i,
  /\bget rich\b/i, /\beasy money\b/i, /\bguaranteed\b/i,
  // §6 PUBLIC: no pricing, no Pro/upgrade language
  /\$\s?\d/, /\/mo\b/i, /\b(pro tier|pro members?|inner[- ]circle|upgrade)\b/i,
  // §6 PUBLIC: no pick-formatted digits / draw results
  /\d\s*[-·.]\s*\d\s*[-·.]\s*\d/, /\{\s*\d\s*,\s*\d\s*,\s*\d\s*\}/,
];

const STATE_CODES = new Set([
  'AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IA','KS','KY','LA','MD','MI',
  'MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','SC','SD','TN','TX','VA','VT',
  'WA','WV','WI','DC',
]);

function tier1Violations(caption: string): string[] {
  const v: string[] = [];
  for (const re of TIER1_FORBIDDEN) {
    const m = caption.match(re);
    if (m) v.push(m[0]);
  }
  // §6 PUBLIC: no state-code attribution
  for (const tok of caption.match(/\b[A-Z]{2}\b/g) ?? []) {
    if (STATE_CODES.has(tok)) { v.push(tok); break; }
  }
  return v;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── social_posts writes (service role) ───────────────────────────────────────
async function logPost(row: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/social_posts`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) console.error('[fb-publish] social_posts insert failed:', r.status, await r.text());
}

// ── Graph API helpers ────────────────────────────────────────────────────────
interface GraphResult { ok: boolean; status: number; body: Record<string, unknown> }

async function graphPost(path: string, form: FormData): Promise<GraphResult> {
  const r = await fetch(`${GRAPH}/${path}`, { method: 'POST', body: form });
  let body: Record<string, unknown> = {};
  try { body = await r.json(); } catch { /* non-JSON error body */ }
  return { ok: r.ok, status: r.status, body };
}

function scheduleFields(form: FormData, scheduledFor?: string): string | null {
  if (!scheduledFor) return null;
  const ts = Math.floor(new Date(scheduledFor).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts)) return 'scheduledFor is not a valid timestamp';
  if (ts < now + 600 || ts > now + 30 * 86400) {
    return 'Meta requires scheduled_publish_time between 10 minutes and 30 days from now';
  }
  form.set('published', 'false');
  form.set('scheduled_publish_time', String(ts));
  return null;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) throw new Error('imageDataUrl must be a base64 data URL');
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

// ── main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  if (!ADMIN_OPS_KEY || req.headers.get('x-admin-key') !== ADMIN_OPS_KEY) {
    return json(401, { error: 'unauthorized' });
  }

  let action = '';
  let payload: Record<string, unknown> = {};
  try {
    const body = await req.json();
    action = String(body?.action ?? '');
    payload = (body?.payload ?? {}) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  try {
    switch (action) {
      case 'ping':
        return json(200, { ok: true, configured: Boolean(FB_PAGE_ID && FB_PAGE_TOKEN) });

      case 'status': {
        if (!FB_PAGE_ID || !FB_PAGE_TOKEN) {
          return json(200, { configured: false, hint: 'Set FB_PAGE_ID and FB_PAGE_TOKEN secrets — see docs/facebook_publishing_setup.md' });
        }
        const r = await fetch(`${GRAPH}/${FB_PAGE_ID}?fields=id,name,followers_count&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`);
        const body = await r.json();
        if (!r.ok) return json(200, { configured: true, tokenValid: false, error: body?.error?.message ?? 'token check failed' });
        return json(200, { configured: true, tokenValid: true, page: body });
      }

      case 'publish_page_text': {
        if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return json(400, { error: 'FB secrets not configured' });
        const message = String(payload.message ?? '').trim();
        const scheduledFor = payload.scheduledFor ? String(payload.scheduledFor) : undefined;
        const override = payload.override === true;
        const kind = String(payload.kind ?? 'custom');
        if (!message) return json(400, { error: 'message required' });

        const violations = tier1Violations(message);
        if (violations.length > 0 && !override) {
          return json(422, { error: 'tier1_lint_failed', violations });
        }

        const form = new FormData();
        form.set('message', message);
        form.set('access_token', FB_PAGE_TOKEN);
        const schedErr = scheduleFields(form, scheduledFor);
        if (schedErr) return json(400, { error: schedErr });

        const res = await graphPost(`${FB_PAGE_ID}/feed`, form);
        const capHash = await sha256Hex(message);
        await logPost({
          tier: 1, destination: 'page', target_name: 'public page', kind,
          caption: message, caption_hash: capHash, has_image: false,
          override_used: override,
          status: res.ok ? (scheduledFor ? 'scheduled' : 'published') : 'failed',
          fb_post_id: res.ok ? String(res.body.id ?? '') : null,
          scheduled_for: scheduledFor ?? null,
          error_text: res.ok ? null : JSON.stringify(res.body?.error ?? res.body).slice(0, 500),
        });
        if (!res.ok) return json(502, { error: 'graph_api_error', detail: res.body?.error ?? res.body });
        return json(200, { ok: true, postId: res.body.id, scheduled: Boolean(scheduledFor), lintOverridden: violations.length > 0 });
      }

      case 'publish_page_photo': {
        if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return json(400, { error: 'FB secrets not configured' });
        const caption = String(payload.caption ?? '').trim();
        const imageDataUrl = String(payload.imageDataUrl ?? '');
        const scheduledFor = payload.scheduledFor ? String(payload.scheduledFor) : undefined;
        const override = payload.override === true;
        const kind = String(payload.kind ?? 'custom');
        const twoQ = payload.twoQAck as { q1?: boolean; q2?: boolean } | undefined;
        const imageMeta = (payload.imageMeta ?? {}) as Record<string, unknown>;

        if (!imageDataUrl) return json(400, { error: 'imageDataUrl required' });
        // Two-Question filter is MANDATORY for page images (brief §3). Both
        // answers must be an explicit NO (false). No default, no absence.
        if (!twoQ || twoQ.q1 !== false || twoQ.q2 !== false) {
          return json(422, { error: 'two_question_filter_required', hint: 'Page images require twoQAck: {q1:false, q2:false} — both answered NO by the operator' });
        }
        const violations = tier1Violations(caption);
        if (violations.length > 0 && !override) {
          return json(422, { error: 'tier1_lint_failed', violations });
        }

        const { blob } = dataUrlToBlob(imageDataUrl);
        if (blob.size > 9.5 * 1024 * 1024) return json(400, { error: 'image exceeds Meta 10MB limit' });

        const form = new FormData();
        form.set('source', blob, String(imageMeta.filename ?? 'hitmaster.png'));
        if (caption) form.set('caption', caption);
        form.set('access_token', FB_PAGE_TOKEN);
        const schedErr = scheduleFields(form, scheduledFor);
        if (schedErr) return json(400, { error: schedErr });

        const res = await graphPost(`${FB_PAGE_ID}/photos`, form);
        const capHash = await sha256Hex(caption || '(no caption)');
        await logPost({
          tier: 1, destination: 'page', target_name: 'public page', kind,
          caption, caption_hash: capHash, has_image: true,
          image_meta: imageMeta, two_q_ack: twoQ, override_used: override,
          status: res.ok ? (scheduledFor ? 'scheduled' : 'published') : 'failed',
          fb_post_id: res.ok ? String(res.body.post_id ?? res.body.id ?? '') : null,
          scheduled_for: scheduledFor ?? null,
          error_text: res.ok ? null : JSON.stringify(res.body?.error ?? res.body).slice(0, 500),
        });
        if (!res.ok) return json(502, { error: 'graph_api_error', detail: res.body?.error ?? res.body });
        return json(200, { ok: true, postId: res.body.post_id ?? res.body.id, scheduled: Boolean(scheduledFor) });
      }

      case 'log_assist': {
        // Records a human-assisted group post handoff (caption copied + image
        // shared). Groups have NO publish API since 2024-04-22 — this is the
        // history/dedupe trail for the assisted flow.
        const caption = String(payload.caption ?? '');
        const tier = Number(payload.tier ?? 2);
        const kind = String(payload.kind ?? 'group_drop');
        const targetName = String(payload.targetName ?? 'free group');
        const imageMeta = (payload.imageMeta ?? null) as Record<string, unknown> | null;
        if (!caption) return json(400, { error: 'caption required' });
        const capHash = await sha256Hex(caption);

        // Same-day duplicate-caption check (brief Tier-3 rule: no identical
        // captions across groups the same day — spam classifier risk).
        const since = new Date(); since.setUTCHours(0, 0, 0, 0);
        const dupR = await fetch(
          `${SUPABASE_URL}/rest/v1/social_posts?caption_hash=eq.${capHash}&created_at=gte.${since.toISOString()}&select=id,target_name&limit=5`,
          { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } },
        );
        const dups = dupR.ok ? await dupR.json() : [];

        await logPost({
          tier, destination: 'group', target_name: targetName, kind,
          caption, caption_hash: capHash, has_image: Boolean(imageMeta),
          image_meta: imageMeta, status: 'assist_handoff',
        });
        return json(200, { ok: true, duplicateToday: Array.isArray(dups) && dups.length > 0, duplicates: dups });
      }

      case 'cancel_scheduled': {
        // Pull back a scheduled page post before it publishes. Graph DELETE on
        // the (unpublished) post id removes it; we then mark the log row
        // 'cancelled'. rowId lets us reconcile the log even if the FB delete
        // fails so the operator sees the true state.
        if (!FB_PAGE_TOKEN) return json(400, { error: 'FB secrets not configured' });
        const fbPostId = String(payload.fbPostId ?? '').trim();
        const rowId = payload.rowId != null ? String(payload.rowId) : '';
        if (!fbPostId) return json(400, { error: 'fbPostId required' });

        const patchRow = async (fields: Record<string, unknown>) => {
          if (!rowId) return;
          const pr = await fetch(`${SUPABASE_URL}/rest/v1/social_posts?id=eq.${rowId}`, {
            method: 'PATCH',
            headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(fields),
          });
          if (!pr.ok) console.error('[fb-publish] cancel_scheduled log patch failed:', pr.status, await pr.text());
        };

        // GUARD: nothing advances the log row when Meta auto-publishes at the
        // scheduled time, so 'scheduled' rows can be stale. Graph DELETE works
        // on LIVE posts too — verify the post is still unpublished first, or a
        // cancel click after publish time would silently remove a live page post.
        const chk = await fetch(`${GRAPH}/${fbPostId}?fields=is_published&access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`);
        let chkBody: Record<string, unknown> = {};
        try { chkBody = await chk.json(); } catch { /* non-JSON */ }
        if (!chk.ok) {
          return json(502, { error: 'graph_check_failed', detail: chkBody?.error ?? chkBody });
        }
        if (chkBody?.is_published === true) {
          await patchRow({ status: 'published', error_text: null });
          return json(409, { error: 'already_published' });
        }

        const r = await fetch(`${GRAPH}/${fbPostId}?access_token=${encodeURIComponent(FB_PAGE_TOKEN)}`, { method: 'DELETE' });
        let body: Record<string, unknown> = {};
        try { body = await r.json(); } catch { /* non-JSON */ }
        const deleted = r.ok && body?.success !== false;

        if (!deleted) return json(502, { error: 'graph_delete_failed', detail: body?.error ?? body });
        await patchRow({ status: 'cancelled', error_text: 'cancelled by operator' });
        return json(200, { ok: true, cancelled: true });
      }

      case 'list_posts': {
        const limit = Math.min(Number(payload.limit ?? 20), 100);
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/social_posts?select=*&order=created_at.desc&limit=${limit}`,
          { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } },
        );
        if (!r.ok) return json(502, { error: 'social_posts read failed' });
        return json(200, { posts: await r.json() });
      }

      default:
        return json(400, { error: `unknown action: ${action}` });
    }
  } catch (e) {
    console.error('[fb-publish] error:', e);
    return json(500, { error: String(e instanceof Error ? e.message : e).slice(0, 300) });
  }
});
