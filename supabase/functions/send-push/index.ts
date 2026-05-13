/**
 * send-push — Supabase Edge Function
 *
 * Dispatches push notifications to registered devices via the Expo Push API.
 * Used by §1.4 phase 2 (notification preferences → actual delivery) and the
 * downstream features that depend on push: §5.2 saved-pick alerts, §6.2
 * trial-offer-on-hit, §3.4 per-jurisdiction alerts.
 *
 * POST body:
 *   {
 *     "channel": "nextDraw" | "slateReady" | "hits" | "promo",
 *     "title": "Slate ready",
 *     "body": "Today's K6 is live — open to see your picks.",
 *     "data"?: { ... },             // arbitrary deep-link payload
 *     "tokens"?: ["ExponentPushToken[...]", ...],  // optional override
 *     "dryRun"?: boolean
 *   }
 *
 * Selection: if `tokens` is omitted, fetches every active push_tokens row
 * where prefs->{channel} = true. Sends in batches of 100 (Expo limit).
 *
 * Returns:
 *   { success, channel, attempted, sent, errors, dryRun, durationMs,
 *     tokenSample, ticketSample }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type Channel = 'nextDraw' | 'slateReady' | 'hits' | 'promo';

interface ReqBody {
  channel: Channel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  tokens?: string[];
  dryRun?: boolean;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default';
  priority?: 'high' | 'normal';
  data?: Record<string, unknown>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

async function fetchTokensForChannel(channel: Channel): Promise<string[]> {
  // Filter active rows opted into the requested channel. PostgREST's `cs`
  // operator can't probe a single boolean inside jsonb cleanly, so we use
  // the `->` operator via `eq.true` on the rendered text — works for json
  // booleans which serialize as `true` / `false` literals.
  const path =
    `/rest/v1/push_tokens?select=expo_push_token&active=eq.true&prefs->>${channel}=eq.true&limit=10000`;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`token query failed ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ expo_push_token: string }>;
  return rows.map(r => r.expo_push_token).filter(Boolean);
}

async function sendBatch(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push API ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: ExpoTicket[] };
  return Array.isArray(json.data) ? json.data : [];
}

async function markInactive(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const inClause = tokens.map(t => `"${t.replace(/"/g, '\\"')}"`).join(',');
  await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?expo_push_token=in.(${encodeURIComponent(inClause)})`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ active: false }),
    },
  );
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }
  const { channel, title, body: msgBody, data, tokens: tokenOverride, dryRun } = body;
  if (!channel || !title || !msgBody) {
    return new Response(
      JSON.stringify({ error: 'channel, title, body are required' }),
      { status: 400 },
    );
  }

  let recipients: string[];
  try {
    recipients = tokenOverride && tokenOverride.length > 0
      ? tokenOverride
      : await fetchTokensForChannel(channel);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e) }),
      { status: 500 },
    );
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        channel,
        attempted: recipients.length,
        durationMs: Date.now() - started,
        tokenSample: recipients.slice(0, 3),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  const errors: Array<{ token: string; error: string }> = [];
  const ticketSample: ExpoTicket[] = [];
  const deadTokens: string[] = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const messages: ExpoMessage[] = batch.map(to => ({
      to,
      title,
      body: msgBody,
      sound: 'default',
      priority: channel === 'hits' || channel === 'nextDraw' ? 'high' : 'normal',
      data,
    }));
    try {
      const tickets = await sendBatch(messages);
      tickets.forEach((t, idx) => {
        if (t.status === 'ok') {
          sent += 1;
        } else {
          const tok = batch[idx];
          errors.push({ token: tok, error: t.message ?? t.details?.error ?? 'unknown' });
          // Expo says DeviceNotRegistered → token is permanently dead.
          if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(tok);
        }
        if (ticketSample.length < 3) ticketSample.push(t);
      });
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      batch.forEach(t => errors.push({ token: t, error: msg }));
    }
  }

  // Mark permanently-dead tokens inactive so future runs skip them.
  if (deadTokens.length > 0) {
    try { await markInactive(deadTokens); } catch { /* non-fatal */ }
  }

  return new Response(
    JSON.stringify({
      success: true,
      dryRun: false,
      channel,
      attempted: recipients.length,
      sent,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
      deactivated: deadTokens.length,
      durationMs: Date.now() - started,
      tokenSample: recipients.slice(0, 3),
      ticketSample,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
