/**
 * reel-run — Supabase Edge Function (OPS-09, 2026-11-25)
 *
 * The operator's "Start reel run" button in Admin → Reels lands here. It
 * dispatches the `reel-daily` GitHub Actions workflow (the same chain as
 * `npm run reel:daily`, on a GitHub runner instead of the codespace) and
 * reports the newest run's state back to the screen.
 *
 * OPERATOR-TRIGGERED ONLY (OPS-01): this function is called by a button press
 * and by nothing else. Do not point a cron, webhook or scheduler at it.
 *
 * Why an edge function: the GitHub token must never ship in the app bundle.
 * It lives in function secrets; calls are gated by the same X-Admin-Key
 * shared secret as admin-ops / fb-publish.
 *
 * Secrets: ADMIN_OPS_KEY, REEL_GH_TOKEN (fine-grained PAT, Actions: read+write
 *          on the repo), optional REEL_GH_REPO / REEL_GH_WORKFLOW / REEL_GH_REF.
 *
 * POST body: { action: 'status' | 'start'; from?: Kind }
 *   status → { configured, run: Run | null }
 *   start  → 409 if a run is queued or in progress, else dispatches and
 *            returns { started: true, from }
 */

const ADMIN_OPS_KEY = Deno.env.get('ADMIN_OPS_KEY') ?? '';
const GH_TOKEN = Deno.env.get('REEL_GH_TOKEN') ?? '';
const GH_REPO = Deno.env.get('REEL_GH_REPO') ?? 'therealzerro/HM26';
const GH_WORKFLOW = Deno.env.get('REEL_GH_WORKFLOW') ?? 'reel-daily.yml';
const GH_REF = Deno.env.get('REEL_GH_REF') ?? 'main';

const KINDS = ['verify', 'allday', 'midday', 'evening', 'record'] as const;
type Kind = typeof KINDS[number];

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

function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + GH_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'reel-run-edge',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

interface Run {
  id: number;
  run_number: number;
  status: string;            // queued | in_progress | completed | …
  conclusion: string | null; // success | failure | cancelled | … (null until completed)
  created_at: string;
  updated_at: string;
  html_url: string;
}

/** Newest run of the workflow, or null if it has never run. Throws on a GitHub error. */
async function latestRun(): Promise<Run | null> {
  const res = await gh(`/actions/workflows/${GH_WORKFLOW}/runs?per_page=1&event=workflow_dispatch`);
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const r = body?.workflow_runs?.[0];
  if (!r) return null;
  return {
    id: r.id,
    run_number: r.run_number,
    status: r.status,
    conclusion: r.conclusion ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    html_url: r.html_url,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const adminKey = req.headers.get('x-admin-key') ?? '';
  if (!ADMIN_OPS_KEY || adminKey !== ADMIN_OPS_KEY) return json(401, { error: 'unauthorized' });

  let payload: { action?: string; from?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  if (!GH_TOKEN) {
    // Not an error for `status`: the screen shows "not set up" instead of a red line.
    if (payload.action === 'status') return json(200, { configured: false, run: null });
    return json(503, { error: 'reel-run is not set up: REEL_GH_TOKEN secret missing (run scripts/setup-reel-button.sh)' });
  }

  try {
    if (payload.action === 'status') {
      return json(200, { configured: true, run: await latestRun() });
    }

    if (payload.action === 'start') {
      const from = (payload.from ?? 'verify') as Kind;
      if (!KINDS.includes(from)) return json(400, { error: `from must be one of ${KINDS.join(', ')}` });

      const current = await latestRun();
      if (current && current.status !== 'completed') {
        return json(409, { error: `run #${current.run_number} is already ${current.status.replace('_', ' ')}`, run: current });
      }

      const res = await gh(`/actions/workflows/${GH_WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: GH_REF, inputs: { from } }),
      });
      if (res.status !== 204) {
        return json(502, { error: `GitHub dispatch ${res.status}: ${(await res.text()).slice(0, 300)}` });
      }
      return json(200, { started: true, from });
    }

    return json(400, { error: 'action must be status or start' });
  } catch (e) {
    return json(502, { error: String((e as Error)?.message ?? e) });
  }
});
