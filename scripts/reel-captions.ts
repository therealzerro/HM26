/**
 * reel-captions — MKT-05: data-driven daily captions for the reel pipeline.
 *
 * Called by scripts/publish-reels.ts before the marketing_reels upsert so the
 * caption drafts in Admin → Reels are pre-customized and rotate creatively
 * day to day.
 *
 * NUMBERS POLICY (operator ruling 2026-07-27, gambling-adjacent safety):
 * real verification numbers (verified counts, state attributions, STRAIGHT
 * MATCH callouts) appear ONLY in the PRO group caption. Free-group and
 * verify captions are qualitative — the video carries the receipts; the
 * caption text stays clean for the classifier. The product noun is always
 * "signals" (§4a content vocab).
 *
 * Data (pro caption only): the same faithful slate∩histories join the in-app
 * report card uses (lib/social/reportCard.ts) — NEVER stored hit flags
 * (BUG-162). Receipts date for the All-Day reels is the day before the reel
 * (today's board isn't resolved when the reel ships).
 *
 * Creativity contract: template pick is (dayOfYear + kind offset) % N —
 * a different caption family every day, deterministic on re-runs (same reel
 * date → same caption, matching the pipeline's re-render semantics).
 *
 * Voice: viewer-friendly tier-2/4 group captions. Only the UNIVERSAL brand
 * rules bind these surfaces (no guarantees, no urgency hype, no "hit(s)"/
 * "partial match", emoji cap) — every template is written clean against
 * them, and the in-app Reels view still runs the full brandLint engine
 * before anything leaves the app. Free All-Day = pure value, no Pro pitch
 * (SOCIAL-13); Pro = first-access framing, never pricing.
 */

export interface ReceiptsData {
  date: string;            // the receipts date (ET ISO)
  totalSignals: number;    // signals across all scopes that day
  verifiedCount: number;   // signals with ≥1 observed match
  straightJx: string[];    // jurisdictions with an exact-order match
  boxJx: string[];         // jurisdictions with set-order matches only
  verified30d: number;     // rolling 30-day verified total (window ends at date)
}

type SbGet = <T = any>(path: string) => Promise<T>;

interface SlateRow { scope: string; slate_date: string; top_k_straights_json: any }
interface HistRow { date_et: string; session: string; jurisdiction: string; comboset_sorted: string; result_digits: string }

function parsePicks(json: any): { comboSet: string; bestOrder: string }[] {
  const arr = typeof json === 'string' ? (() => { try { return JSON.parse(json); } catch { return []; } })() : json;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p: any) => ({ comboSet: String(p?.comboSet ?? p?.combo_set ?? ''), bestOrder: String(p?.bestOrder ?? p?.best_order ?? '') }))
    .filter(p => p.comboSet);
}

/** allday = ANY draw counts; midday/evening are strict two-bucket sessions. */
function sessionMatches(scope: string, session: string): boolean {
  return scope === 'allday' || session === scope;
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchReceiptsData(date: string, sbGet: SbGet): Promise<ReceiptsData> {
  const from30 = shiftDate(date, -29);
  const slates = await sbGet<SlateRow[]>(
    `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json&slate_date=gte.${from30}&slate_date=lte.${date}` +
    `&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=slate_date.asc,id.asc&limit=400`,
  );
  // Paginated with a unique ,id tiebreaker — PostgREST caps GETs at 1000 rows
  // and unordered pagination silently skips/dupes (BUG-163 lesson).
  const hist: HistRow[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await sbGet<HistRow[]>(
      `/rest/v1/histories?select=date_et,session,jurisdiction,comboset_sorted,result_digits&date_et=gte.${from30}&date_et=lte.${date}` +
      `&order=date_et.asc,id.asc&limit=1000&offset=${offset}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    hist.push(...page);
    if (page.length < 1000) break;
  }

  const histByDate = new Map<string, HistRow[]>();
  for (const h of hist) {
    const arr = histByDate.get(h.date_et) ?? [];
    arr.push(h);
    histByDate.set(h.date_et, arr);
  }

  let totalSignals = 0;
  let verifiedCount = 0;
  let verified30d = 0;
  const jxBest = new Map<string, boolean>(); // jurisdiction → sawExact (receipts date only)

  for (const s of slates) {
    const draws = histByDate.get(s.slate_date) ?? [];
    for (const p of parsePicks(s.top_k_straights_json)) {
      const matched = draws.filter(h => h.comboset_sorted === p.comboSet && sessionMatches(s.scope, h.session));
      if (matched.length > 0) verified30d++;
      if (s.slate_date !== date) continue;
      totalSignals++;
      if (matched.length > 0) {
        verifiedCount++;
        for (const m of matched) {
          const exact = m.result_digits === p.bestOrder;
          jxBest.set(m.jurisdiction, (jxBest.get(m.jurisdiction) ?? false) || exact);
        }
      }
    }
  }

  const straightJx: string[] = [];
  const boxJx: string[] = [];
  for (const [jx, exact] of [...jxBest.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    (exact ? straightJx : boxJx).push(jx);
  }
  return { date, totalSignals, verifiedCount, straightJx, boxJx, verified30d };
}

// ── formatting helpers ────────────────────────────────────────────────────────

function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function fmtJx(jx: string): string {
  return jx === 'ME,NH,VT' ? 'Tri-State' : jx;
}

/** "GA", "GA and TX", "GA, TX and DE", "GA, TX, DE and 4 more" */
function listJx(arr: string[], max = 3): string {
  const names = arr.map(fmtJx);
  const head = names.slice(0, max);
  const extra = names.length - head.length;
  const joined = head.length <= 1 ? (head[0] ?? '') : `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`;
  return extra > 0 ? `${joined} and ${extra} more` : joined;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function dayOfYear(iso: string): number {
  const d = new Date(iso + 'T12:00:00Z');
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - jan1) / 86_400_000);
}

// ── template registry ─────────────────────────────────────────────────────────
// THE standing caption engine for ALL pipeline content (operator directive
// 2026-07-27: every current and future content type requiring captions uses
// this system — never one-off caption strings in a pipeline script).
//
// HOW TO ADD A NEW CONTENT KIND:
//   1. Add one entry to CAPTION_REGISTRY below:
//      - templates: 8+ viewer-friendly variants, clean against the universal
//        tier-2/4 rules (no guarantees/urgency/"hit(s)"; ≤2 emoji)
//      - offset: unique, so kinds never pair the same style on the same day
//      - realNumbers: true ONLY for pro-audience surfaces (operator ruling:
//        real verification numbers are pro-only; everything else stays
//        qualitative — c.pro is null unless realNumbers is set, so a
//        qualitative template CANNOT leak numbers by construction)
//      - fallback: required when realNumbers (used if the receipts fetch fails)
//   2. Nothing else — buildReelCaption() and the publish flow pick it up.

interface ProCtx {
  reelMd: string;
  rcptMd: string;
  t: number;
  v: number;
  jxAll: string[];
  jxCount: number;
  straightJx: string[];
  v30: number;
}

interface TemplateCtx {
  reelMd: string;        // the content date label, e.g. "7/27"
  pro: ProCtx | null;    // real-numbers context — ONLY for realNumbers kinds
  seed: number;
}

interface KindSpec {
  offset: number;
  realNumbers: boolean;
  templates: ((c: TemplateCtx) => string)[];
  fallback?: (reelMd: string) => string;
}

/** "— including a STRAIGHT MATCH in GA" / "…MATCHES in GA and TX" / "" */
function straightLine(c: ProCtx): string {
  if (c.straightJx.length === 0) return '';
  return c.straightJx.length === 1
    ? ` — including a STRAIGHT MATCH in ${fmtJx(c.straightJx[0])}`
    : ` — including STRAIGHT MATCHES in ${listJx(c.straightJx, 2)}`;
}

/** Yesterday-credibility line, real numbers (pro only). Handles 0-match days. */
function credLine(c: ProCtx, seed: number): string {
  if (c.v > 0) {
    const opts = [
      `Yesterday's receipts: ${c.v} of ${c.t} signals verified across ${c.jxCount} ${plural(c.jxCount, 'state', 'states')}${straightLine(c)}.`,
      `Yesterday the board verified ${c.v} ${plural(c.v, 'signal', 'signals')} in ${listJx(c.jxAll)}${straightLine(c)}.`,
      `${c.rcptMd} closed with ${c.v} verified ${plural(c.v, 'match', 'matches')}${straightLine(c)}.`,
    ];
    return opts[seed % opts.length];
  }
  if (c.v30 > 0) return `The last 30 days: ${c.v30} verified signals, all on the record.`;
  return `Every signal gets graded against observed outcomes — the record is public.`;
}

const CAPTION_REGISTRY = {
  // Qualitative by ruling: dates only, no verification numbers, no states.
  verify: {
    offset: 0,
    realNumbers: false,
    templates: [
      c => `Receipts are in 🧾 ${c.reelMd}'s signals, graded against the real results. Watch the tape, then check it against your own state.`,
      c => `No talk, just the tape: ${c.reelMd}'s board, verified in the open. The reel is the receipt. 📊`,
      c => `Posted first, graded after — that's the whole routine. ${c.reelMd}'s verification breakdown is in the reel.`,
      c => `${c.reelMd}'s board, graded 🧾 We publish before the results and grade in the open. See how the day closed.`,
      c => `If a signal doesn't verify, you see that too. ${c.reelMd}'s tape is up — every outcome on the record.`,
      c => `Scoreboard check 📊 ${c.reelMd}'s signals are graded and on the record. Tomorrow's board drops in the morning.`,
      c => `The data speaks for itself — ${c.reelMd}'s verification tape is up. Watch it, then pull your own state's results and compare.`,
      c => `Another day on the record 🧾 Every signal from ${c.reelMd}, checked in the open. Watch, verify, repeat.`,
    ],
  },
  // Qualitative by ruling; pure value, no Pro pitch (SOCIAL-13).
  allday_free: {
    offset: 3,
    realNumbers: false,
    templates: [
      c => `Today's All-Day board is live 🔆 Six signals, every session, coast to coast. Run your state against the reel.`,
      c => `Fresh six for ${c.reelMd} — one board covering day and night sessions. Full breakdown above ⬆️`,
      c => `The engine doesn't sleep 📊 ${c.reelMd}'s six All-Day signals are posted. Grade us yourself tomorrow — every outcome goes on the record.`,
      c => `New day, new board: six pattern signals for ${c.reelMd}, live now. Yesterday's tape is already graded in the open.`,
      c => `All-Day intelligence for ${c.reelMd} just dropped — six signals built from national pattern data, verified in the open every morning after.`,
      c => `Six signals. 40+ states & provinces. One reel 🎬 ${c.reelMd}'s All-Day board is up — watch the signal-by-signal breakdown.`,
      c => `${c.reelMd}'s All-Day drop is in. Watch all six signals, find your state, and check the receipts tomorrow.`,
      c => `Board's set for ${c.reelMd} ☀️🌙 Six All-Day signals covering both sessions — the breakdown's in the reel.`,
    ],
  },
  // The ONLY realNumbers kind: first-access framing, never pricing.
  allday_pro: {
    offset: 5,
    realNumbers: true,
    fallback: m => `First access: the ${m} All-Day board. Six signals straight from the engine, in full detail. 📊`,
    templates: [
      c => `Pro first look 💎 ${c.reelMd}'s All-Day six are on your board before anywhere else. ${credLine(c.pro!, c.seed)}`,
      c => `You see it first: the ${c.reelMd} All-Day board, all six signals in full detail. ${credLine(c.pro!, c.seed)}`,
      c => `Early access delivered — six All-Day signals for ${c.reelMd}, straight from the engine. ${credLine(c.pro!, c.seed)}`,
      c => `The ${c.reelMd} board is yours before the crowd 💎 Six signals, both sessions covered. ${credLine(c.pro!, c.seed)}`,
      c => `First in, as always: ${c.reelMd}'s All-Day intelligence, all six signals in full. ${credLine(c.pro!, c.seed)}`,
      c => `Pro drop for ${c.reelMd} is live — six signals, complete detail, zero waiting. ${credLine(c.pro!, c.seed)}`,
      c => `Your head start for ${c.reelMd} 💎 The full All-Day six, posted here first. ${credLine(c.pro!, c.seed)}`,
      c => `Before the rest of the room sees the board: ${c.reelMd}'s six All-Day signals, full breakdown inside. ${credLine(c.pro!, c.seed)}`,
    ],
  },
} satisfies Record<string, KindSpec>;

export type ReelCaptionKind = keyof typeof CAPTION_REGISTRY;

export function buildReelCaption(kind: ReelCaptionKind, reelDate: string, receipts: ReceiptsData | null): string {
  const spec: KindSpec = CAPTION_REGISTRY[kind];
  const seed = dayOfYear(reelDate) + spec.offset;
  const reelMd = md(reelDate);
  if (spec.realNumbers && !receipts) return (spec.fallback ?? (m => m))(reelMd);
  const pro: ProCtx | null = spec.realNumbers && receipts
    ? {
        reelMd,
        rcptMd: md(receipts.date),
        t: receipts.totalSignals,
        v: receipts.verifiedCount,
        jxAll: [...receipts.straightJx, ...receipts.boxJx],
        jxCount: receipts.straightJx.length + receipts.boxJx.length,
        straightJx: receipts.straightJx,
        v30: receipts.verified30d,
      }
    : null;
  return spec.templates[seed % spec.templates.length]({ reelMd, pro, seed });
}
