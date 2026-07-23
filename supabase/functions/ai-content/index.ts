/**
 * ai-content — Supabase Edge Function (SOCIAL-04)
 *
 * AI generation gateway for the Publish console:
 *  - generate_caption      → Claude (claude-opus-4-8, structured outputs):
 *    surface-aware caption obeying the 2026-06-29 §6 surface discipline +
 *    §4a vocab law. The CLIENT re-lints every caption before use — this
 *    function's brand rules are the first gate, not the only one.
 *  - generate_brand_image  → Claude composes a Brand Rehab brief §8-compliant
 *    Gemini prompt (natural-language scene paragraphs, exact text strings in
 *    quotes, mandatory prohibition clause appended mechanically), then
 *    Gemini 3 Pro Image ("Nano Banana Pro", GA — $0.134/image) renders it.
 *    Returns a base64 data URL. Public-page images remain subject to the
 *    Two-Question ack at publish time — generation ≠ clearance.
 *  - ping                  → health + config presence.
 *
 * Facts (researched 2026-07-09): Gemini image gen is paid-tier only; output is
 * base64 inline; aspect ratios 9:16 / 1:1 / 4:5 native; size classes use
 * uppercase K ("1K"/"2K"/"4K"); SynthID watermark is mandatory and invisible
 * (platforms may auto-label AI content — acceptable, it is not a policy strike).
 * Video (Veo 3.1 / Gemini Omni Flash) is a documented fast-follow — async
 * polling doesn't fit a single edge invocation; see docs/ai_content_and_platforms.md.
 *
 * Secrets: ADMIN_OPS_KEY (shared gate), ANTHROPIC_API_KEY, GEMINI_API_KEY.
 * Every generation is logged to ai_generations (service role) for the brief's
 * incident-forensics protocol.
 */

import Anthropic from 'npm:@anthropic-ai/sdk';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ADMIN_OPS_KEY = Deno.env.get('ADMIN_OPS_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_IMAGE_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3-pro-image';

const CLAUDE_MODEL = 'claude-opus-4-8';

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

// ── Brand rulebook injected into every Claude call ───────────────────────────
// Condensed from Brand Rehab Skill Brief v2 (2026-05-18) + the 2026-06-29
// surface-discipline update. Claude writes; the client's brandLint re-checks.
const BRAND_RULES = `
You produce public-facing content for HitMaster ZK6, a data intelligence and
analytics platform (comparable to ESPN Stats / FiveThirtyEight). The Facebook
page was twice de-recommended by Meta's gambling classifier and has been
rehabilitated — every output must protect that status.

VOCAB LAW (locked, all surfaces): match outcomes are called exactly
"MATCH" or "BOX MATCH" (right digits, wrong order) and "STRAIGHT MATCH"
(exact). NEVER "hit", "hits", or "partial match".

SURFACE RULES:
- PUBLIC (page) & CROSS-POST: forbidden words — lottery, lotto, Pick 3,
  winning, winners, won, win, picks, hits, straight, box, play, gamble, bet,
  lucky, luck, fortune, jackpot, payout, get rich, easy money, guaranteed.
  No pick digits, no draw results, no slate→draw attribution, no US state
  codes, no pricing, no Pro/upgrade language. Aggregate statistics only.
- FREE group: full digits + attribution OK; pricing + Pro CTA OK — EXCEPT the
  All-Day post which is pure value (no Pro pitch).
- PRO group: full detail, first-access framing, NO commercial/pricing language.

TONE (all surfaces): calm, measured, confident. No urgency-hype ("don't miss
out", "act now", "last chance"), never "guaranteed", max 3 emoji, no caps-lock
dominance. Approved phrases: "daily signals", "intelligence reports",
"data drops", "pattern matches", "signals matched", "verified matches",
"observed outcomes", "cross-jurisdictional analysis", "numerical pattern
analysis".`;

const GEMINI_PROHIBITION_CLAUSE = `

Strict exclusions — absolutely NO citation tags, reference tags, bracketed
text, image_NN.png file references, <IMAGE> tags, or any metadata-style
annotations. The image must contain ONLY the text specified above and nothing
else. CRITICAL: render NO digits or numerals ANYWHERE in the image — not as
headline text, not on dashboard panels, and NOT as decorative texture. Data
streams, "matrix rain," particle trails, and holographic panels must use
abstract glyphs, dots, waveforms, and light — never legible digits (0-9). No
"hits," "straight," "box," "picks," "lottery," "winning," or "lucky"
vocabulary. No cash, dice, cards, slot machines, or gambling imagery.`;

// ── ai_generations log (service role) ────────────────────────────────────────
async function logGeneration(row: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_generations`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) console.error('[ai-content] ai_generations insert failed:', r.status, await r.text());
}

// ── Server-side caption lint (SOCIAL-10 residual, 2026-07-23) ────────────────
// Compact tier-aware port of the client brandLint BLOCKING rules — the client
// re-lints with the full engine + suggestions, but generation must never hand
// back a caption that only client-side code stands between and Facebook.
// Tier semantics (brief §4): public=1 & cross=3 STRICT; free=2 opted-in;
// pro=4 opted-in but NO pricing/commercial framing.
const LINT_TIER: Record<string, number> = { public: 1, free: 2, cross: 3, pro: 4 };

const LINT_STRICT: RegExp[] = [
  /\blottery\b/i, /\blotto\b/i, /\bpick ?3\b/i, /\bwinning numbers\b/i,
  /\bwinners?\b/i, /\bwinning\b/i, /\bwon\b/i, /\bwin\b/i,
  /\bdaily picks\b/i, /\bhot picks\b/i, /\btoday'?s picks\b/i, /\bpicks?\b/i,
  /\bdaily heat\b/i, /\bstraight\b/i, /\bbox\b/i, /\bplay(s|ed|ing)?\b/i,
  /\bgambl(e|ing|er)\b/i, /\bbet(s|ting)?\b/i, /\bluck(y)?\b/i, /\bfortune\b/i,
  /\bjackpot\b/i, /\bpayout\b/i, /\bget rich\b/i, /\beasy money\b/i,
  // §6 public/cross: no pricing, no Pro/upgrade language, no pick-format digits
  /\$\s?\d/, /\/mo\b/i, /\b(pro tier|pro members?|inner[- ]circle|upgrade)\b/i,
  /\d\s*[-·.]\s*\d\s*[-·.]\s*\d/, /\{\s*\d\s*,\s*\d\s*,\s*\d\s*\}/,
];
const LINT_UNIVERSAL: RegExp[] = [
  /\bguaranteed( wins?| results?)?\b/i, /\bdon'?t miss out\b/i, /\blast chance\b/i,
  /\bact now\b/i, /\bpartial match\b/i, /\bhits?\b/i,
];
const LINT_PRO: RegExp[] = [/\$\s?\d/, /\/mo\b/i, /\bupgrade\b/i, /\bsubscribe now\b/i];
const LINT_STATE_CODES = new Set([
  'AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IA','KS','KY','LA','MD','MI',
  'MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','SC','SD','TN','TX','VA','VT',
  'WA','WV','WI','DC',
]);

function captionViolations(caption: string, surface: string): string[] {
  const tier = LINT_TIER[surface] ?? 1;
  const strict = tier === 1 || tier === 3;
  const v: string[] = [];
  const rules = [
    ...LINT_UNIVERSAL,
    ...(strict ? LINT_STRICT : []),
    ...(tier === 4 ? LINT_PRO : []),
  ];
  for (const re of rules) {
    const m = caption.match(re);
    if (m) v.push(m[0]);
  }
  if (strict) {
    for (const tok of caption.match(/\b[A-Z]{2}\b/g) ?? []) {
      if (LINT_STATE_CODES.has(tok)) { v.push(tok); break; }
    }
    // Standalone 3-digit number not followed by a word (statistical counts
    // like "131 verified matches" read as counts and pass).
    const standalone = /(?<!\d)\d{3}(?!\d)(?!\s+[A-Za-z])/.exec(caption);
    if (standalone) v.push(standalone[0]);
  }
  const emoji = (caption.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji > 3) v.push(`${emoji} emoji (max 3)`);
  return [...new Set(v)];
}

// ── Claude helpers ───────────────────────────────────────────────────────────
function anthropic(): Anthropic {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY secret not set');
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

async function claudeJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<{ out: T; usage: { input: number; output: number } }> {
  const client = anthropic();
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  });
  if (resp.stop_reason === 'refusal') throw new Error('Claude declined the request');
  const text = resp.content.find((b: any) => b.type === 'text')?.text ?? '';
  return {
    out: JSON.parse(text) as T,
    usage: { input: resp.usage.input_tokens, output: resp.usage.output_tokens },
  };
}

// ── Gemini image generation ──────────────────────────────────────────────────
async function geminiImage(prompt: string, aspectRatio: string, size: string): Promise<{ dataUrl: string; mime: string }> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY secret not set');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio, imageSize: size },
        },
      }),
    },
  );
  const body = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p: any) => p.inlineData?.data);
  if (!img) {
    const blocked = body?.candidates?.[0]?.finishReason ?? body?.promptFeedback?.blockReason;
    throw new Error(`Gemini returned no image${blocked ? ` (${blocked})` : ''}`);
  }
  const mime = img.inlineData.mimeType ?? 'image/png';
  return { dataUrl: `data:${mime};base64,${img.inlineData.data}`, mime };
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
        return json(200, {
          ok: true,
          claude: Boolean(ANTHROPIC_API_KEY),
          gemini: Boolean(GEMINI_API_KEY),
          imageModel: GEMINI_IMAGE_MODEL,
        });

      case 'generate_caption': {
        const surface = String(payload.surface ?? 'public');   // public | free | pro | cross
        const content = String(payload.content ?? 'custom');
        const context = String(payload.context ?? '');          // live data summary from the client
        const priorCaptions = Array.isArray(payload.priorCaptions) ? (payload.priorCaptions as string[]).slice(0, 5) : [];

        const captionSchema = {
          type: 'object',
          properties: {
            caption: { type: 'string', description: 'the caption text, ready to post' },
            rationale: { type: 'string', description: 'one sentence: how it satisfies the surface rules' },
          },
          required: ['caption', 'rationale'],
          additionalProperties: false,
        };
        const basePrompt = `Write ONE Facebook caption.
Surface: ${surface.toUpperCase()}
Content type: ${content}
Live data (use faithfully, never invent numbers): ${context || '(none provided)'}
${priorCaptions.length ? `Do NOT resemble these recent captions (same-day variation rule):\n${priorCaptions.map(c => `- ${c.slice(0, 120)}`).join('\n')}` : ''}
Length: 150-300 characters preferred. 1-3 emoji max.`;

        // Generate → server lint → one corrective retry → hard fail. The lint
        // runs for EVERY surface (groups included), not just the page.
        let { out, usage } = await claudeJson<{ caption: string; rationale: string }>(BRAND_RULES, basePrompt, captionSchema);
        let violations = captionViolations(out.caption, surface);
        let retried = false;
        if (violations.length > 0) {
          retried = true;
          const retry = await claudeJson<{ caption: string; rationale: string }>(
            BRAND_RULES,
            `${basePrompt}

Your previous attempt was REJECTED by the mechanical brand lint for these terms: ${violations.join(', ')}.
Rewrite the caption without any of them (or their variants).`,
            captionSchema,
          );
          out = retry.out;
          usage = { input: usage.input + retry.usage.input, output: usage.output + retry.usage.output };
          violations = captionViolations(out.caption, surface);
        }

        await logGeneration({
          kind: 'caption', surface, model: CLAUDE_MODEL,
          prompt_summary: `${content} caption, ctx ${context.slice(0, 120)}${retried ? ' [lint retry]' : ''}`,
          output_summary: violations.length > 0 ? `LINT REJECTED: ${violations.join(', ')} | ${out.caption.slice(0, 240)}` : out.caption.slice(0, 300),
          tokens_in: usage.input, tokens_out: usage.output,
        });
        if (violations.length > 0) {
          return json(422, { error: 'caption_lint_failed', violations, message: `Server lint rejected the caption (after retry): ${violations.join(', ')}` });
        }
        return json(200, { ok: true, caption: out.caption, rationale: out.rationale });
      }

      case 'generate_brand_image': {
        // Two-stage: Claude composes the §8-compliant Gemini prompt, Gemini renders.
        const theme = String(payload.theme ?? 'brand');         // operator's one-line direction
        const surface = String(payload.surface ?? 'public');
        const headline = String(payload.headline ?? '');        // exact text to render, if any
        const aspectRatio = String(payload.aspectRatio ?? '9:16');
        const size = String(payload.size ?? '1K');              // 1K keeps PNG near Meta's preferred <1MB

        const { out: composed, usage } = await claudeJson<{ prompt: string; textStrings: string[] }>(
          BRAND_RULES + `

You are composing an image-generation prompt for Gemini Nano Banana Pro,
following the Brand Rehab brief §8 conventions:
1. Opening sentence: subject and purpose.
2. Subject description paragraph in natural prose (no tag soups).
3. Composition walkthrough (top to bottom).
4. Style/atmosphere paragraph. Brand palette: electric purple #A855F7-#C084FC,
   metallic gold #FBBF24-#F59E0B, deep black #0A0A0F to deep navy #1E1B4B,
   electric cyan #06B6D4 accents. Lightning-bolt motif 2-3 places. Bold
   geometric sans headlines, monospace data displays.
5. "Specific text to render" section: EVERY text string in double quotes,
   stated "must be spelled exactly as written". Include the HITMASTER ZK6
   wordmark. NO 3-digit numbers, no forbidden vocabulary in rendered text.
6. Color palette section with hex codes.
Approved imagery: analytics dashboards without real numbers, abstract data
streams, holographic displays, cosmic/portal, vault/lock for exclusivity,
construction/build aesthetic. Forbidden: cash, dice, cards, slot machines,
lottery tickets, WINNER graphics, dollar signs, pick cards.`,
          `Compose the Gemini prompt now.
Theme/direction from the operator: ${theme}
Destination surface: ${surface.toUpperCase()} (apply its rules to any rendered text)
${headline ? `Required headline text to render: "${headline}"` : 'No specific headline — choose brand-appropriate short text.'}
Aspect ratio: ${aspectRatio}. Do NOT include the strict-exclusions clause — it is appended mechanically.`,
          {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'the full Gemini image prompt, WITHOUT the exclusions clause' },
              textStrings: { type: 'array', items: { type: 'string' }, description: 'every text string the image will render' },
            },
            required: ['prompt', 'textStrings'],
            additionalProperties: false,
          },
        );

        // Mechanical guards the brief demands (never trust composition alone):
        const fullPrompt = composed.prompt + GEMINI_PROHIBITION_CLAUSE + `\nAspect ratio: ${aspectRatio}.`;
        const renderedText = composed.textStrings.join(' ');
        if (/(?<!\d)\d{3}(?!\d)/.test(renderedText)) {
          return json(422, { error: 'composed_prompt_unsafe', detail: 'a 3-digit number reached the rendered-text list', textStrings: composed.textStrings });
        }
        if (/\b(hits?|straight|box|picks?|lottery|lotto|winning|winners?|lucky|jackpot)\b/i.test(renderedText)) {
          return json(422, { error: 'composed_prompt_unsafe', detail: 'forbidden vocabulary reached the rendered-text list', textStrings: composed.textStrings });
        }

        const img = await geminiImage(fullPrompt, aspectRatio, size);

        await logGeneration({
          kind: 'image', surface, model: `${CLAUDE_MODEL}+${GEMINI_IMAGE_MODEL}`,
          prompt_summary: `${theme} | ${headline}`.slice(0, 300),
          output_summary: `image ${aspectRatio} ${size}, text: ${composed.textStrings.join(' | ').slice(0, 200)}`,
          tokens_in: usage.input, tokens_out: usage.output,
          est_cost_usd: 0.134,
        });
        return json(200, {
          ok: true,
          imageDataUrl: img.dataUrl,
          mime: img.mime,
          geminiPrompt: fullPrompt,
          textStrings: composed.textStrings,
          note: 'SynthID watermark embedded (mandatory, invisible). Page publishing still requires the Two-Question ack.',
        });
      }

      default:
        return json(400, { error: `unknown action: ${action}` });
    }
  } catch (e) {
    console.error('[ai-content] error:', e);
    return json(500, { error: String(e instanceof Error ? e.message : e).slice(0, 400) });
  }
});
