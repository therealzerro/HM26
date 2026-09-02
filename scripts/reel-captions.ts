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

/**
 * MKT-62 — same-day provenance context for verify_midday, the kind whose
 * caption headline IS the gap. Fed by publish-reels from the SAME join the
 * renderer burns into the summary band (scripts/reel-sameday.ts), so the
 * caption's elapsed figure and the pixels' cannot disagree. `straights` gates
 * the STRAIGHT MATCH clause STRUCTURALLY (the verify-free #12 precedent:
 * a false straight claim cannot render regardless of which day the rotation
 * draws that template). Distinct from ReceiptsData on purpose —
 * fetchReceiptsData is all-day-scoped and would describe the wrong board.
 */
export interface SamedayCtx {
  elapsed: string;    // "8h 13m" — fmtGap(gradedAt − publishedAt)
  straights: number;  // deduped midday-session matched rows with hit_straight, BOTH boards (MKT-69)
  straightBoard: 'midday' | 'allday' | 'both' | null; // where the straight(s) sit — the lead line's board word
}

interface TemplateCtx {
  reelMd: string;        // the content date label, e.g. "7/27"
  pro: ProCtx | null;    // real-numbers context — ONLY for realNumbers kinds
  q: QualCtx | null;     // qualitative context — ONLY for qualitativeReceipts kinds
  sd: SamedayCtx | null; // same-day gap context — ONLY for samedayProvenance kinds
  seed: number;
}

/**
 * MKT-66b (2026-09-02, operator) — the MKT-37 topic tags on the PUBLIC-KIND
 * captions. MKT-37 registered #Shorts #DataAnalysis #PatternAnalysis on the
 * YouTube entry only, and Facebook page handoffs take the stored caption
 * verbatim — so the page never carried a tag while Meta's coaching was asking
 * for "data or technology" tags. #Shorts stays YouTube-only (format tag).
 * Ruling unchanged: no lottery / numbers / draw / winning / luck tags, ever.
 * Appended as a trailing line so platformCaption's tag dedupe still sees them.
 */
export const PUBLIC_TAGS = '#DataAnalysis #PatternAnalysis';
const tagged = <T,>(fns: ((c: T) => string)[]): ((c: T) => string)[] =>
  fns.map(f => (c: T) => `${f(c)}\n\n${PUBLIC_TAGS}`);

/**
 * MKT-68 (2026-09-02, operator) — the Pro CTA on the same-day midday verify.
 * All eight verify_midday captions describe the cover coming off and none of
 * them said where the UNCOVERED board lives. Free group = tier 2, where the
 * price line is sanctioned (MKT-26). The truthful conversion line: the
 * difference between free and Pro is WHEN you see the board, never a
 * different board — never write "Pro signals vs free signals".
 */
// MKT-69: "this board" → "the session boards" — the caption now describes two
// boards (Midday covered, All-Day in full), and the Pro difference is still
// WHEN, never WHAT.
export const MIDDAY_VERIFY_CTA = 'Pro reads the session boards uncovered at 8:30 AM, every day, before the draw. $2.49/mo — HitMaster ZK Pro.';
const withProCta = <T,>(fns: ((c: T) => string)[]): ((c: T) => string)[] =>
  fns.map(f => (c: T) => `${f(c)}\n\n${MIDDAY_VERIFY_CTA}`);

/**
 * MKT-69 (2026-09-02, operator: "the straight hit is always what's
 * important") — THE STRAIGHT LEAD on the same-day family. When either morning
 * board holds a STRAIGHT MATCH, every verify_midday caption OPENS on it,
 * naming the board it landed on; with none, nothing is prepended. Structural
 * gate on `c.sd.straights` (the verify-free #12 precedent) — a false straight
 * claim cannot render whichever template the rotation draws. Tier-2 vocab:
 * STRAIGHT MATCH / exact order; board names are group-legal.
 */
export function samedayStraightLead(sd: SamedayCtx | null): string {
  if (!sd || !sd.straights) return '';
  const where = sd.straightBoard === 'both' ? "both of this morning's boards"
    : sd.straightBoard === 'allday' ? "this morning's All-Day board"
    : "this morning's Midday board";
  return `STRAIGHT MATCH ⚡ Exact order, on ${where} — graded the same afternoon.\n`;
}
const straightLed = (fns: ((c: TemplateCtx) => string)[]): ((c: TemplateCtx) => string)[] =>
  fns.map(f => (c: TemplateCtx) => `${samedayStraightLead(c.sd)}${f(c)}`);

interface KindSpec {
  offset: number;
  realNumbers: boolean;            // templates see counts/states (PRO surfaces only)
  qualitativeReceipts?: boolean;   // templates see descriptor words, never numbers
  samedayProvenance?: boolean;     // templates see the same-day gap (verify_midday only)
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
      // MKT-37 — templates 9-12, delivered 2026-07-31 ({scope} → label).
      () => `${label} board is set. Six signals ranked and stamped ahead of the draw.`,
      () => `${label}: six signals, four measures behind each. First look, same as always.`,
      () => `Published before the ${label} draw, graded at sunup. That order is the whole method. ⚡`,
      () => `${label} board's live — ranked, explained, on the record.`,
    ],
  };
}

/**
 * MKT-26 — free-group session (Midday / Evening) captions.
 *
 * THE INVERSE CASE TO `allday_free`, and they must not inherit from it.
 * `allday_free` is bound by SOCIAL-13's no-Pro-pitch rule because it IS the
 * value gift — the free group gets that board in full. These two are the
 * opposite: the free group gets the session boards REDACTED, so these captions
 * exist to name the withholding and sell the gap. A redacted reel whose caption
 * does not say why it is redacted reads as broken, not as a teaser.
 *
 * PRICING IS SANCTIONED HERE, and this is the only caption kind where that is
 * true. brandLint §6 bars pricing on tier 1/3 (public/cross-post) and on tier 4
 * (Pro — they already bought); the free group is tier 2, "the only surface where
 * pricing is allowed". Carried in half the set rather than all eight so the room
 * is not read the same price eight days running.
 *
 * QUALITATIVE, with no receipts dependency — matching `allday_free` rather than
 * `verify`. These are slate reels that ship in the morning against an ungraded
 * board, and the numbers-are-pro-only ruling (2026-07-27) rules out the real
 * counts regardless. No receipts read means no fallback path to get wrong.
 *
 * "DIGITS", never "numbers": §5 bars *numbers* as a product noun — the product
 * noun is signals, always — so the withheld values are digits, which is the
 * system's own term for them. Same correction the Phase 1 endcard copy carries.
 */
function sessionFreeKind(label: string, when: string, offset: number): KindSpec {
  return {
    offset,
    realNumbers: false,
    templates: [
      c => `The ${label} board for ${c.reelMd} is up 🔆 You get the whole breakdown — signal strength, confidence, the reasoning behind each one. The digits stay covered here.`,
      c => `Six ${label} signals for ${c.reelMd}, methodology wide open and digits covered. Pro reads the same board in full at $2.49/mo.`,
      c => `Here's how the ${label} board reads for ${c.reelMd}: every signal's pattern breakdown, in the open. The digits themselves are the Pro side of the line 💎`,
      c => `${c.reelMd} ${label}: the reasoning is yours, the digits are covered. Pro sees all six in full detail — $2.49/mo, same board, nothing masked.`,
      c => `The ${label} board lands before ${when} 📊 This room sees the structure — signal strength, confidence, state coverage. Pro sees the digits.`,
      c => `Watch the ${label} six get built for ${c.reelMd} — pair analysis, co-occurrence, draw-gap consistency, all of it. Digits covered; Pro reads them straight through at $2.49/mo.`,
      c => `Every ${label} signal for ${c.reelMd} shows its work. What's covered is the digits — that's the line between this room and Pro 💎 $2.49/mo.`,
      c => `${label} intelligence for ${c.reelMd}, posted before ${when}. Full methodology in the open, digits covered. The complete six live in Pro.`,
      // MKT-37 — templates 9-12, delivered 2026-07-31 ({scope} → label; pricing
      // sanctioned at tier 2, carried in 9 and 12 per the delivered set).
      () => `${label} board is up — ranked, explained, digits covered. Pro reads them before the draw. $2.49/mo.`,
      () => `You're seeing the whole method here: six signals, four measures each. The digits stay covered on this one — Pro has them now.`,
      () => `Everything but the digits. Cover comes off in the morning for everyone; Pro isn't waiting.`,
      () => `${label} signals ranked and explained. The values are the gap — that's what Pro closes. $2.49/mo.`,
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
      // MKT-37 — delivered 2026-07-31. The originally-delivered #9 ("Grade
      // day: {date} closed with…") duplicated shipped template 5 verbatim
      // once its scale words went through makeQualCtx and was NOT
      // registered; the REPLACEMENT below arrived same day and completes
      // the set at 12. Scale words wired to QualCtx so no line can
      // overclaim on a 1-match day.
      c => {
        const m = c.q!.matchPhrase;
        return `Every signal on yesterday's board went up before the draw and got checked after. ${m.charAt(0).toUpperCase()}${m.slice(1)}${c.q!.spreadPhrase}. That's the whole method, in public.`;
      },
      c => `Yesterday's board, checked in the open — ${c.q!.matchPhrase}${c.q!.spreadPhrase}. The record's public for a reason. 🧾`,
      () => `We published these before the draw. Here's how they graded, every row.`,
      // Delivered #12 is CONDITIONAL on a straight by order — gated
      // STRUCTURALLY: straightPhrase is non-empty ONLY when the verified
      // record contains one (makeQualCtx), so a false straight claim cannot
      // render regardless of which day the rotation draws this.
      c => `Receipts for ${c.reelMd}: ${c.q!.matchPhrase}${c.q!.spreadPhrase}${c.q!.straightPhrase}. Check it yourself.`,
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
      // MKT-37 — templates 9-12, delivered 2026-07-31. {n_straight} clauses
      // render ONLY when a straight exists — "including 0 STRAIGHT" is a
      // sentence no receipts caption should ever say.
      c => `Graded in full: ${c.pro!.v} ${plural(c.pro!.v, 'MATCH', 'MATCHES')} across ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')} on ${c.pro!.rcptMd}${c.pro!.straightJx.length ? `, including ${c.pro!.straightJx.length} STRAIGHT` : ''}. Draw by draw below. 🧾`,
      c => `${c.pro!.rcptMd} receipts: ${c.pro!.v} ${plural(c.pro!.v, 'MATCH', 'MATCHES')} on the board we published the morning before. Every row checked against official results.`,
      c => `Yesterday's record — ${c.pro!.v} ${plural(c.pro!.v, 'MATCH', 'MATCHES')} across ${c.pro!.jxCount} ${plural(c.pro!.jxCount, 'state', 'states')}${c.pro!.straightJx.length ? `, ${c.pro!.straightJx.length} of them dead-on` : ''}. 30-day total now ${c.pro!.v30}.`,
      c => `Published first, graded after. ${c.pro!.rcptMd}: ${c.pro!.v} ${plural(c.pro!.v, 'MATCH', 'MATCHES')}${c.pro!.straightJx.length ? `, ${c.pro!.straightJx.length} STRAIGHT` : ''}, all attributed. ⚡`,
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
      // MKT-37 — templates 9-12, delivered 2026-07-31 (pure value, SOCIAL-13).
      () => `Full board, free: six signals ranked, with the reasoning behind every one. Grade it against tomorrow's receipts.`,
      () => `Six signals, four measures each, nothing held back. This is the whole method.`,
      () => `Today's board is yours — ranked, explained, published before the draw. Come back in the morning and check the work.`,
      () => `Every signal shows why it ranked where it did. That's the part most methods never show. ⚡`,
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
      // MKT-37 — templates 9-12, delivered 2026-07-31.
      () => `Board's up. Six signals ranked, every one time-stamped before the first draw. Reasoning included, as always. ⚡`,
      () => `Today's six are live — energy, momentum, pattern and consistency scored across 40+ states & provinces. You see them first.`,
      () => `Ranked, explained, locked. Nothing changes after the stamp — that's the whole point of publishing early.`,
      () => `The engine ran overnight. Six signals out, first look yours. 🤠`,
    ],
  },
  // MKT-13 session wave — offsets 7 and 11 keep all three pro kinds (5/7/11) on
  // different templates the same day.
  midday_pro: sessionProKind('Midday', 'the daytime boards run', 7),
  evening_pro: sessionProKind('Evening', 'tonight’s boards run', 11),
  // MKT-26 free-group session wave.
  //
  // ⚠ WHAT ACTUALLY HAS TO BE DISTINCT IS `offset % templates.length`, not the
  // offset — the index is `(dayOfYear + offset) % N`.
  //
  // ⚠ RE-VERIFIED AT 12 (MKT-37 grew the sets 8 → 12; verify-free reached 12
  // on 2026-07-31 when the #9 replacement arrived — its first delivery
  // duplicated a shipped line; allday_public stays 8). The sets that share a
  // FAMILY, mod their length 12:
  //   pro trio     — allday_pro 5, midday_pro 7, evening_pro 11: pairwise
  //                  distinct, so the three pro posts never read as the same
  //                  message on one day. HOLDS with no re-spacing.
  //   free sessions — midday_free 17→5, evening_free 22→10: distinct. HOLDS.
  // New harmless cross-FAMILY coincidence at 12: midday_free (5) lands beside
  // allday_pro (5) — different template arrays, same class as the documented
  // evening_pro/allday_free collision at 8 below.
  //
  // (Historical, at 8: evening_pro's 11 landed on 3 alongside allday_free —
  // harmless, different arrays — which is why the rule is stated properly here
  // rather than left as "offsets are unique".)
  midday_free: sessionFreeKind('Midday', 'the daytime boards run', 17),
  evening_free: sessionFreeKind('Evening', 'tonight’s boards run', 22),
  /**
   * MKT-16 / MKT-24 Phase 2 — the PUBLIC kind. The eight templates are the
   * DELIVERED set (content agent, MKT-24 work order 2026-07-29), registered
   * verbatim now that the kind exists — writing them was safe then, registering
   * them waited for this change.
   *
   * ⚠ TIER 1 DISCIPLINE, not the group rules every other kind is written to:
   * these go to public platforms, so the full strict lint applies — no digits,
   * no state names, no match counts, no session words, no pricing, no Pro CTA.
   * Funnel-to-Free only; methodology-forward because TikTok and YouTube both
   * penalise prediction framing and education framing is the reach strategy.
   * All eight verified through the real lintCaption(…, 1) — MKT-24 recorded it,
   * re-run at registration.
   *
   * MKT-67 (2026-09-02): content agent's REPLACEMENT family ("the concrete
   * number goes in the first eight words") — supersedes MKT-16's set and the
   * MKT-66 rewrite wholesale; {free_group_url} substituted at publish like
   * verify_public. PUBLIC_TAGS still appended via tagged().
   * MKT-66 (2026-09-02): every template now LEADS with the scale line — Meta's
   * page analytics measured "40+ states" holding attention 3s longer than the
   * "Analysis published before" opener, which was retired. Still eight, still
   * static, still tier-1 (re-linted at registration).
   *
   * STATIC BY DESIGN: no template renders the date or any receipt datum, so
   * there is no receipts dependency and no fallback path to get wrong. Rotation
   * still applies (dayOfYear + offset).
   *
   * Offset 4 — the ONE free residue mod 8: verify 0, verify_pro 2,
   * allday_free 3, allday_pro 5, midday_pro 7, evening_pro 11→3,
   * midday_free 17→1, evening_free 22→6. What must be distinct is
   * `offset % templates.length` (see the MKT-26 note above).
   */
  allday_public: {
    offset: 4,
    realNumbers: false,
    templates: tagged([
      () => `Six signals. 40+ states and provinces. Scored overnight, published before the first draw. Every one shows its reasoning — energy, momentum, pattern, consistency. The full board is free: {free_group_url}`,
      () => `40+ states and provinces, scored every night. Six signals come out ranked, stamped before the draw. Nothing gets edited after. That's the whole discipline. Free to read: {free_group_url}`,
      () => `Four measures. Six signals. Published before the draw, every single morning. Energy, momentum, pattern and consistency — scored across 40+ states and provinces. The full board is free: {free_group_url}`,
      () => `Six ranked signals, out before the first draw of the day. Scored across 40+ states and provinces overnight, with the reasoning shown on every one. Free in our community: {free_group_url}`,
      () => `Scored across 40+ states and provinces. Six signals, ranked, before anyone draws anything. Then graded against the official results the next morning, in public. Read it free: {free_group_url}`,
      () => `Six signals a day. Four measures behind each one. 40+ states and provinces. Published before the draw and checked after it — that order is the method. Free: {free_group_url}`,
      () => `This is what pattern analysis looks like at scale: 40+ states and provinces, scored nightly, six signals published before the draw. The full board is free: {free_group_url}`,
      () => `Every night the engine reads 40+ states and provinces. Every morning six signals go up, ranked and stamped. The reasoning is shown on all six. Nothing is edited after. Free to check: {free_group_url}`,
    ]),
  },
  /**
   * MKT-40 — verify_public: the grading half of the public pair. The eight
   * DELIVERED templates (content agent 2026-07-31,
   * docs/verify_public_copy_delivery_2026-07-31.md), registered verbatim.
   * Tier-1 discipline, stricter than the free verify draft: NO match counts,
   * NO state names, NO digits, NO match-type vocabulary — these describe the
   * RITUAL and invite the audit. #5 is the ONE that names the masking (the
   * deliberate 1-in-8 dose — more and the cut reads as withholding).
   *
   * `{free_group_url}` is substituted at PUBLISH time from
   * app_config.social_free_group_url (publish-reels), so the stored drafts
   * are final text everywhere they surface. STATIC otherwise: no receipts
   * dependency, no fallback path to get wrong.
   *
   * Offset 6 — free residue mod 8 among the 8-length sets (allday_public
   * holds 4); distinct from verify (0) and verify_pro (2) mod 12 is not the
   * binding rule (different families), but 6 avoids those too.
   */
  /**
   * MKT-62 — verify_midday: the SAME-DAY MIDDAY VERIFY (free group only by
   * ruling; manual trigger; rare). The EIGHT DELIVERED templates (2026-08-19,
   * written against the built 8/19 reel per work order item 11), registered
   * verbatim — they REPLACE the three provisional operator lines. The
   * headline datum is the ELAPSED GAP (`c.sd.elapsed`, "8h 13m"), fed by
   * publish-reels from the renderer's own provenance join (reel-sameday.ts).
   *
   * FACTUAL GATES: #3's "dead-on STRAIGHT MATCH" clause renders ONLY when the
   * graded board holds one (c.sd.straights — the structural-gate precedent
   * from verify-free #12); every other match line is qualitative. The kind
   * itself guarantees ≥1 match (renderer precondition 6), so "Verified MATCH"
   * can stand unconditionally. No counts, no states: numbers stay pro-only
   * and this kind has no pro caption.
   *
   * PRICING IS SANCTIONED (free group = tier 2, the one surface where it is)
   * and carried in five of eight, matching the endcard's $2.49 line. Session
   * word "Midday" is group-legal (strict tiers only bar it). Receipts are NOT
   * consumed — fetchReceiptsData is all-day-scoped and would describe the
   * wrong board; sd is this kind's whole data need.
   *
   * FALLBACK (sd unavailable — e.g. --captions-only after the window moved):
   * the gap-less line below; never a literal "{elapsed}".
   *
   * Offset 9 → residue 1 mod 8: distinct within the 8-length family
   * (allday_public 4, verify_public 6) — the rule is offset % templates.length
   * (MKT-26 note above).
   */
  verify_midday: {
    offset: 9,
    realNumbers: false,
    samedayProvenance: true,
    // MKT-69 (2026-09-02, operator): the family REWRITTEN for TWO boards —
    // the Midday board (went up COVERED) and the All-Day board (went up IN
    // FULL), both graded against the midday draws the same afternoon — and
    // every template OPENS on the STRAIGHT MATCH when one exists
    // (`straightLed`, structurally gated). Same eight slots, same offset,
    // same voice as the delivered 8/19 set; copy PROVISIONAL pending the
    // content agent's pass (handoff v5.6 §G.10(c)). "Pro vs free signals"
    // stays FALSE and unwritten: the difference is WHEN, never WHAT.
    fallback: () => `Same-day receipts 🧾 This morning's boards — Midday covered, All-Day in full — graded against today's midday results before the evening session. The reel is the receipt.` + `\n\n${MIDDAY_VERIFY_CTA}`,
    templates: withProCta(straightLed([
      c => `Posted this morning. Graded this afternoon. 🧾⚡\n${c.sd!.elapsed} between the boards going up and the midday results coming in — and we checked them in the open, same day.\nThe Midday board goes up covered in here; the All-Day board goes up in full. Those covered digits come off the next morning for everybody. ZK Pro reads them before the draw, all three sessions. $2.49/mo.`,
      c => `Same-day receipts 🧾\nYou saw this morning's boards go up — All-Day in full, Midday covered. Here they are, graded against the midday draws ${c.sd!.elapsed} later — before the evening draw, not tomorrow.\nThat gap is the whole thing. ZK Pro closes it on every session. $2.49/mo.`,
      c => `We didn't wait until tomorrow ⚡\nThis morning's boards, checked against the official midday results and posted back to you the same day. ${c.sd!.elapsed}, start to finish.\nVerified MATCH on the boards${c.sd!.straights ? ' — with a dead-on STRAIGHT MATCH in there' : ''}. Check the timestamps yourself.`,
      c => `The cover comes off early today 🧾⚡\nMidday board published covered this morning, All-Day board in full — both graded this afternoon, ${c.sd!.elapsed} apart. Same six signals per board, same stamp, nothing edited in between.\nFree sees the Midday digits now because it already drew. Pro saw them before it did. $2.49/mo.`,
      c => `This is a rare one 🤠\nMost days you get yesterday's receipts. Today you get this morning's — both boards graded ${c.sd!.elapsed} after they published, in the open, same as always.\nAnalysis first. Receipts after. Just faster.`,
      c => `Timestamps don't lie 🧾\nPUBLISHED this morning · GRADED this afternoon · ${c.sd!.elapsed} between them. Every signal on both boards went up before the draw and got checked after it.\nThe full method's free in here. The timing is what Pro buys. $2.49/mo.`,
      c => `Extended receipts — midday draws, same day ⚡\nBoth boards went up this morning. The midday draws happened. Here's the grading, ${c.sd!.elapsed} later, before the evening boards even land.\nVerified MATCH, checked against the official results.`,
      // #8 keeps the 8/20 content-agent headline (echoes the sameday
      // carrier's closing VO line; the repetition is design).
      c => `Same day. Not tomorrow. 🧾⚡\nThis morning's boards, graded and posted back ${c.sd!.elapsed} later. You watched the Midday board go up covered — now you can see how both landed.\nZK Pro doesn't wait for the cover to come off. $2.49/mo.`,
    ])),
  },
  verify_public: {
    offset: 6,
    realNumbers: false,
    templates: tagged([
      () => `40+ states and provinces, checked draw by draw. Yesterday's six signals, graded against the official results. Published before. Verified after. The full record is free: {free_group_url}`,
      () => `Six signals published yesterday. Every one checked this morning against the official results, in public. Across 40+ states and provinces. Read the record free: {free_group_url}`,
      () => `Scored across 40+ states and provinces. Published before the draw, graded the next morning where anyone can see it. That order is the only thing that makes a record worth reading: {free_group_url}`,
      () => `Yesterday's board, checked draw by draw across 40+ states and provinces. Every signal we published, graded against what actually drew — including the ones that missed. Free to read: {free_group_url}`,
      () => `Four measures, six signals, 40+ states and provinces — and a record checked every single morning. The values are covered here. They're open in the community: {free_group_url}`,
      () => `We grade our own analysis in public, across 40+ states and provinces, every morning. No edits, no retroactive claims, misses included. See the full record free: {free_group_url}`,
      () => `40+ states and provinces. Six signals a day. Every one checked the next morning against the official results. Most methods never show what happened next. Ours does: {free_group_url}`,
      () => `Yesterday's six, graded. Scored across 40+ states and provinces, published before the draw, checked after it. The whole record is free: {free_group_url}`,
    ]),
  },
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

export function buildReelCaption(kind: ReelCaptionKind, reelDate: string, receipts: ReceiptsData | null, sameday: SamedayCtx | null = null): string {
  const spec: KindSpec = CAPTION_REGISTRY[kind];
  const seed = dayOfYear(reelDate) + spec.offset;
  const reelMd = md(reelDate);
  const needsReceipts = spec.realNumbers || spec.qualitativeReceipts;
  // No data, or a zero-match day (the verify assembler aborts on those, but a
  // stray --captions-only run must not fabricate match language) → fallback.
  if (needsReceipts && (!receipts || receipts.verifiedCount === 0)) {
    return (spec.fallback ?? (m => m))(reelMd);
  }
  // MKT-62: the same-day family headlines the elapsed gap — no gap, no
  // template; degrade to the gap-less fallback, never a literal "{elapsed}".
  if (spec.samedayProvenance && !sameday) {
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
  const sd: SamedayCtx | null = spec.samedayProvenance ? sameday : null;
  return spec.templates[seed % spec.templates.length]({ reelMd, pro, q, sd, seed });
}
