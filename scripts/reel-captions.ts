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
  if (extra > 0) return `${head.join(', ')} and ${extra} more`;
  return head.length <= 1 ? (head[0] ?? '') : `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`;
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

/**
 * Qualitative match description — the free-surface way to "describe
 * yesterday's matches" (operator 2026-07-27) WITHOUT real numbers or state
 * attributions: scale words, spread words, and STRAIGHT MATCH presence only.
 */
interface QualCtx {
  matchPhrase: string;     // "a verified MATCH" / "multiple verified MATCHES" / "a stack of verified MATCHES"
  spreadPhrase: string;    // "" / " across several state boards" / " from coast to coast"
  straightPhrase: string;  // "" / " — one of them a dead-on STRAIGHT MATCH" / " — including dead-on STRAIGHT MATCHES"
}

function makeQualCtx(r: ReceiptsData): QualCtx {
  const jxCount = r.straightJx.length + r.boxJx.length;
  return {
    matchPhrase: r.verifiedCount === 1 ? 'a verified MATCH'
      : r.verifiedCount <= 3 ? 'multiple verified MATCHES'
      : 'a stack of verified MATCHES',
    spreadPhrase: jxCount <= 1 ? '' : jxCount <= 3 ? ' across several state boards' : ' from coast to coast',
    straightPhrase: r.straightJx.length === 0 ? ''
      : r.straightJx.length === 1 ? ' — one of them a dead-on STRAIGHT MATCH'
      : ' — including dead-on STRAIGHT MATCHES',
  };
}

interface TemplateCtx {
  reelMd: string;        // the content date label, e.g. "7/27"
  pro: ProCtx | null;    // real-numbers context — ONLY for realNumbers kinds
  q: QualCtx | null;     // qualitative context — ONLY for qualitativeReceipts kinds
  seed: number;
}

interface KindSpec {
  offset: number;
  realNumbers: boolean;            // templates see counts/states (PRO surfaces only)
  qualitativeReceipts?: boolean;   // templates see descriptor words, never numbers
  templates: ((c: TemplateCtx) => string)[];
  fallback?: (reelMd: string) => string;   // used when receipts are needed but unavailable
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

/**
 * MKT-13 — session-wave (Midday / Evening) PRO captions.
 *
 * Built from one factory rather than two hand-written blocks: the two sessions
 * differ only in the board's name and when it lands, and 16 near-identical
 * templates would drift apart on the first edit. Offsets stay UNIQUE per kind,
 * so the same day never draws the same template family for midday, evening and
 * all-day — the three pro posts read as three different messages.
 *
 * Pro-only by content strategy (see scripts/reel-scopes.ts): the free group gets
 * session drops REDACTED, so there is no free session caption kind to write.
 *
 * Session words ("Midday"/"Evening") are safe here — brandLint treats session
 * labels as strict-tier only (public page / cross-posts), and these are group
 * captions. Real numbers are allowed because this is a pro surface.
 */
function sessionProKind(label: string, when: string, offset: number): KindSpec {
  return {
    offset,
    realNumbers: true,
    fallback: m => `First access: the ${m} ${label} board. Six signals straight from the engine, in full detail. 📊`,
    templates: [
      c => `Pro first look 💎 The ${label} board for ${c.reelMd} is on your screen before ${when}. ${credLine(c.pro!, c.seed)}`,
      c => `${c.reelMd} ${label}: six signals, full detail, posted early as always. ${credLine(c.pro!, c.seed)}`,
      c => `Your ${label} board is live — all six signals for ${c.reelMd}, nothing held back. ${credLine(c.pro!, c.seed)}`,
      c => `Ahead of ${when}: the complete ${label} six for ${c.reelMd} 💎 ${credLine(c.pro!, c.seed)}`,
      c => `${label} intelligence for ${c.reelMd} just landed — six signals built from national pattern data. ${credLine(c.pro!, c.seed)}`,
      c => `First in, as always: ${c.reelMd}'s ${label} board, all six signals in full. ${credLine(c.pro!, c.seed)}`,
      c => `The ${label} session board for ${c.reelMd} is yours now, in complete detail 💎 ${credLine(c.pro!, c.seed)}`,
      c => `Six ${label} signals for ${c.reelMd}, straight from the engine and graded in the open tomorrow. ${credLine(c.pro!, c.seed)}`,
    ],
  };
}

const CAPTION_REGISTRY = {
  // FREE verify draft — describes yesterday's matches CREATIVELY but
  // qualitatively (scale/spread/straight-presence words, never counts or
  // states — the numbers-pro-only ruling holds).
  verify: {
    offset: 0,
    realNumbers: false,
    qualitativeReceipts: true,
    fallback: m => `Receipts are in 🧾 ${m}'s signals, graded against the real results in the open. Watch the tape, then check your own state.`,
    templates: [
      c => `Receipts are in 🧾 ${c.reelMd} put ${c.q!.matchPhrase} on the record${c.q!.spreadPhrase}${c.q!.straightPhrase}. Watch the tape, then check your state.`,
      c => `The tape doesn't lie: ${c.q!.matchPhrase} verified${c.q!.spreadPhrase} on ${c.reelMd}${c.q!.straightPhrase}. The reel is the receipt. 📊`,
      c => `${c.reelMd}, graded: ${c.q!.matchPhrase}${c.q!.spreadPhrase}${c.q!.straightPhrase}. Posted before the results, checked after — always in the open.`,
      c => `Last night's board came back with ${c.q!.matchPhrase}${c.q!.spreadPhrase}${c.q!.straightPhrase} 🧾 Breakdown's in the reel.`,
      c => `Grade day: ${c.reelMd} closed with ${c.q!.matchPhrase}${c.q!.spreadPhrase}${c.q!.straightPhrase}. Pull your state's results and compare.`,
      c => `Scoreboard check 📊 ${c.q!.matchPhrase} on ${c.reelMd}'s board${c.q!.spreadPhrase}${c.q!.straightPhrase}. Tomorrow's signals drop in the morning.`,
      c => `The record grew again: ${c.q!.matchPhrase} from ${c.reelMd}${c.q!.spreadPhrase}${c.q!.straightPhrase}. Watch it verified, board by board. 🧾`,
      c => `Signals in, results in, ${c.q!.matchPhrase} out${c.q!.spreadPhrase}${c.q!.straightPhrase} — that's ${c.reelMd} on the record. 📊`,
    ],
  },
  // PRO verify draft — the same reel, full precision: counts, states,
  // STRAIGHT MATCH attributions, 30-day totals.
  verify_pro: {
    offset: 2,
    realNumbers: true,
    fallback: m => `Pro receipts for ${m}: every signal graded against observed outcomes, board by board, in the reel. 🧾`,
    templates: [
      c => `Pro receipts, full detail: ${c.pro!.v} of ${c.pro!.t} signals verified on ${c.pro!.rcptMd} across ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')}${straightLine(c.pro!)}. 🧾`,
      c => `${c.pro!.rcptMd}, graded: ${c.pro!.v} verified ${plural(c.pro!.v, 'MATCH', 'MATCHES')} — ${listJx(c.pro!.jxAll)}${straightLine(c.pro!)}. The tape's in the reel.`,
      c => `Numbers on the table: ${c.pro!.v}/${c.pro!.t} verified in ${listJx(c.pro!.jxAll)}${straightLine(c.pro!)}. That's ${c.pro!.v30} over the last 30 days. 💎`,
      c => `${c.pro!.rcptMd} closed at ${c.pro!.v} verified across ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')}${straightLine(c.pro!)}. Full breakdown, board by board.`,
      c => `Your receipts: ${c.pro!.v} of ${c.pro!.t} signals matched on ${c.pro!.rcptMd}${straightLine(c.pro!)}. 30-day record: ${c.pro!.v30} verified. 💎`,
      c => `On the record for ${c.pro!.rcptMd}: ${c.pro!.v} verified in ${listJx(c.pro!.jxAll)}${straightLine(c.pro!)}. Watch it graded in the open.`,
      c => `Graded in full: ${c.pro!.v} ${plural(c.pro!.v, 'MATCH', 'MATCHES')} across ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')} on ${c.pro!.rcptMd}${straightLine(c.pro!)}. 🧾`,
      c => `${c.pro!.v} verified, ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')}, zero spin${straightLine(c.pro!)} — ${c.pro!.rcptMd}'s tape inside.`,
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
  // MKT-13 session wave — offsets 7 and 11 keep all three pro kinds (5/7/11) on
  // different templates the same day.
  midday_pro: sessionProKind('Midday', 'the daytime boards run', 7),
  evening_pro: sessionProKind('Evening', 'tonight’s boards run', 11),
} satisfies Record<string, KindSpec>;

export type ReelCaptionKind = keyof typeof CAPTION_REGISTRY;

/**
 * Does this kind's caption need the receipts join? Asked by publish-reels so it
 * fetches once per run and only when something will actually read it. Derived
 * from the registry rather than an enumerated list — a new kind added above is
 * picked up here automatically instead of silently losing its numbers.
 */
export function kindNeedsReceipts(kind: ReelCaptionKind): boolean {
  const spec: KindSpec = CAPTION_REGISTRY[kind];
  return Boolean(spec.realNumbers || spec.qualitativeReceipts);
}

export function buildReelCaption(kind: ReelCaptionKind, reelDate: string, receipts: ReceiptsData | null): string {
  const spec: KindSpec = CAPTION_REGISTRY[kind];
  const seed = dayOfYear(reelDate) + spec.offset;
  const reelMd = md(reelDate);
  const needsReceipts = spec.realNumbers || spec.qualitativeReceipts;
  // No data, or a zero-match day (the verify assembler aborts on those, but a
  // stray --captions-only run must not fabricate match language) → fallback.
  if (needsReceipts && (!receipts || receipts.verifiedCount === 0)) {
    return (spec.fallback ?? (m => m))(reelMd);
  }
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
  const q: QualCtx | null = spec.qualitativeReceipts && receipts ? makeQualCtx(receipts) : null;
  return spec.templates[seed % spec.templates.length]({ reelMd, pro, q, seed });
}
