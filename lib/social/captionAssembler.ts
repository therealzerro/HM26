/**
 * captionAssembler — CAPTION SYSTEM v2 (MKT-85, 2026-10-11): builds a caption
 * from four independently rotating parts and records which parts it used.
 *
 *   tiers 2 / 4:  L1 HOOK · L2 FACT (optional) · L3 CTA (2: Pro line · 4:
 *                 community line or none) · L4 QUESTION
 *   tier 1:       L0 "Free group → {link_free}" · L1 HOOK · L2 FACT (public
 *                 form) · L4 QUESTION   (no CTA — the link IS line one)
 *
 * Rotation (banks.rules): hooks walk a per-kind shuffled cycle keyed on the
 * date, never the same hook two days running; questions never repeat on two
 * posts the same day nor within 7 days on the same kind; a tier-2 CTA never
 * repeats two days running. Memory = the published rows' `caption_meta`
 * (publish-reels reads the last 8 days back); nothing else is stored.
 *
 * Facts follow the MKT-84 rule — DISTINCT DRAW EVENTS (one draw = one match,
 * never board rows) — and are OMITTED whenever the data is incomplete
 * (`facts === null`): silence is always safe. Never a total across days.
 *
 * Every slot is linted at its tier before the caption exists (lintSlot; the
 * FACT slot carries the operator's state-name ruling) — a block throws and
 * the caller falls back to the old family. Pure: no I/O, no Date.now().
 */
import type { SocialTier } from './brandLint';
import { CAPTION_BANKS, hookBankFor, lintSlot, type CaptionBanks, type BankLine } from './captionBanks';

export interface StraightEvent { session: string; jurisdiction: string }
export interface CaptionFacts {
  /** exact-order matches as distinct (session, jurisdiction) draw events — yesterday, or today-midday for verify_midday */
  straightEvents: StraightEvent[];
  /** jurisdictions with ANY match (box or straight), distinct */
  matchJurisdictions: string[];
  /** 'yesterday' (default) or 'sameday' (verify_midday) */
  frame?: 'yesterday' | 'sameday';
}
export interface CaptionMemory {
  /** this kind's recent captions, newest first: { date: 'YYYY-MM-DD', hook, cta, q } */
  recent: { date: string; hook?: string | null; cta?: string | null; q?: string | null }[];
  /** question ids already used TODAY on any other kind */
  todayQuestions: string[];
}
export interface CaptionLinks { free?: string; pro?: string }
export interface CaptionMeta {
  v: string; hook: string; cta: string | null; q: string; fact: { on: boolean; type: string | null };
}
export interface AssembledCaption { text: string; meta: CaptionMeta }

/** One-line readout of a draft's provenance — Admin row, captions sheet, --preview: `v2.0.0 · hook V3 · cta C2 · q Q7 · fact straight`. */
export function formatCaptionMeta(m: CaptionMeta | null | undefined): string {
  if (!m) return '';
  return `v${m.v} · hook ${m.hook} · cta ${m.cta ?? '—'} · q ${m.q} · fact ${m.fact?.on ? m.fact.type ?? 'on' : 'off'}`;
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const N_WORD = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function dayIndex(iso: string): number { return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000); }
function shiftISO(iso: string, days: number): string { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function weekdayOf(iso: string): string { return DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]; }
function mdOf(iso: string): string { return `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`; }
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
/** Deterministic Fisher–Yates keyed on a string — the per-kind shuffled cycle. */
function shuffled<T>(items: T[], key: string): T[] {
  const a = items.slice(); let h = hash(key);
  for (let i = a.length - 1; i > 0; i--) { h = (Math.imul(h ^ (h >>> 15), 2246822519) >>> 0); const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function fmtJx(jx: string): string { return jx === 'ME,NH,VT' ? 'Tri-State' : jx; }
function listStates(jx: string[], max: number, more: string): string {
  const names = jx.map(fmtJx);
  if (names.length <= max) return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} ${more}`;
}

export function tierForKind(kind: string): SocialTier {
  if (kind.endsWith('_public')) return 1;
  if (kind.endsWith('_pro') || kind === 'brief') return 4;
  return 2;
}

/** The hook for (kind, date): the kind's shuffled cycle walked by day index, skipping yesterday's id. */
export function pickHook(kind: string, dateISO: string, memory: CaptionMemory, banks: CaptionBanks = CAPTION_BANKS): BankLine {
  const hb = hookBankFor(kind, banks);
  if (!hb) throw new Error(`no hook bank for kind "${kind}"`);
  const lines = hb.bank.lines.filter(l => l.text && !l.retired);
  if (!lines.length) throw new Error(`hook bank "${hb.key}" is empty`);
  const cycle = shuffled(lines, `${banks.banks_version}|hook|${hb.key}`);
  const yesterday = memory.recent.find(r => r.date === shiftISO(dateISO, -1))?.hook ?? null;
  let i = dayIndex(dateISO) % cycle.length;
  if (banks.rules.no_same_hook_consecutive_days && cycle.length > 1 && cycle[i].id === yesterday) i = (i + 1) % cycle.length;
  return cycle[i];
}

export function pickQuestion(kind: string, tier: SocialTier, dateISO: string, memory: CaptionMemory, banks: CaptionBanks = CAPTION_BANKS): { id: string; text: string } {
  const pool = banks.questions.filter(q => !q.retired).map(q => (tier === 1 && q.public ? { id: q.public.id, text: q.public.text, base: q.id } : { id: q.id, text: q.text, base: q.id }));
  const cycle = shuffled(pool, `${banks.banks_version}|q|${kind}`);
  const start = dayIndex(dateISO) % cycle.length;
  const cutoff = shiftISO(dateISO, -banks.rules.question_cooldown_days);
  const usedOnKind = new Set(memory.recent.filter(r => r.date > cutoff && r.date !== dateISO).map(r => (r.q ?? '').replace(/-pub$/, '')));
  const usedToday = new Set(memory.todayQuestions.map(q => q.replace(/-pub$/, '')));
  for (let k = 0; k < cycle.length; k++) {
    const c = cycle[(start + k) % cycle.length];
    if (banks.rules.question_once_per_day && usedToday.has(c.base)) continue;
    if (usedOnKind.has(c.base)) continue;
    return { id: c.id, text: c.text };
  }
  return { id: cycle[start].id, text: cycle[start].text };   // every question exhausted — take the cycle's own
}

export function pickCta(kind: string, tier: SocialTier, dateISO: string, memory: CaptionMemory, banks: CaptionBanks = CAPTION_BANKS): BankLine | null {
  const all = (banks.ctas[String(tier)] ?? []).filter(l => !l.retired);
  // a line scoped to kinds serves ONLY those kinds (C6/C7 → allday_free); the rest serve the unscoped kinds
  const scoped = all.filter(l => l.kinds?.includes(kind));
  const pool = scoped.length ? scoped : all.filter(l => !l.kinds);
  if (!pool.length) return null;
  const cycle = shuffled(pool, `${banks.banks_version}|cta|${kind}`);
  const yesterday = memory.recent.find(r => r.date === shiftISO(dateISO, -1))?.cta ?? null;
  let i = dayIndex(dateISO) % cycle.length;
  if (banks.rules.cta_no_consecutive_days && cycle.length > 1 && cycle[i].id === yesterday) i = (i + 1) % cycle.length;
  const line = cycle[i];
  return line.text ? line : null;   // K3 "none — the question carries it"
}

/** The fact line, or null (incomplete data → silence; zero matches → the STATES form has nothing to say → null). */
export function buildFact(kind: string, tier: SocialTier, facts: CaptionFacts | null, banks: CaptionBanks = CAPTION_BANKS): { type: string; text: string } | null {
  if (!facts) return null;
  const F = banks.facts; const sameday = facts.frame === 'sameday';
  const straightJx = [...new Set(facts.straightEvents.map(e => e.jurisdiction))];
  const n = facts.straightEvents.length;
  const form = (key: string) => { const f = F[key as keyof typeof F]; return f && typeof f === 'object' && 'text' in f && f.tiers.includes(tier) && (!f.kinds || f.kinds.includes(kind)) ? f.text : null; };
  if (n >= 1) {
    if (tier === 1) { const t = form('exact_public'); if (t) return { type: 'exact', text: t.replace('{states}', listStates(straightJx, F.max_states_named, F.more_suffix)) }; }
    else if (n === 1) { const t = form(sameday ? 'sameday_one' : 'straight_one'); if (t) return { type: 'straight', text: t.replace('{state}', fmtJx(straightJx[0])) }; }
    else { const t = form(sameday ? 'sameday_many' : 'straight_many'); if (t) return { type: 'straight', text: t.replace('{N_word}', N_WORD[Math.min(n, 10)] ?? String(n)).replace('{states}', listStates(straightJx, F.max_states_named, F.more_suffix)) }; }
  }
  if (facts.matchJurisdictions.length) {
    const t = form(sameday ? 'sameday_states' : 'states');
    if (t) return { type: 'states', text: t.replace('{states}', listStates(facts.matchJurisdictions, F.max_states_named, F.more_suffix)) };
  }
  return null;
}

export interface AssembleInput {
  kind: string; dateISO: string; tier?: SocialTier;
  facts: CaptionFacts | null; memory: CaptionMemory; links: CaptionLinks;
  banks?: CaptionBanks;
}

export function assembleCaption(inp: AssembleInput): AssembledCaption {
  const banks = inp.banks ?? CAPTION_BANKS;
  const tier = inp.tier ?? tierForKind(inp.kind);
  const fill = (t: string) => t.split('{weekday}').join(weekdayOf(shiftISO(inp.dateISO, inp.kind === 'verify' || inp.kind === 'verify_pro' ? -1 : 0))).split('{md}').join(mdOf(inp.dateISO))
    .split('{link_pro}').join(inp.links.pro ?? '').split('{link_free}').join(inp.links.free ?? '');
  const hook = pickHook(inp.kind, inp.dateISO, inp.memory, banks);
  const fact = buildFact(inp.kind, tier, inp.facts, banks);
  const cta = tier === 2 ? pickCta(inp.kind, 2, inp.dateISO, inp.memory, banks) : tier === 4 ? pickCta(inp.kind, 4, inp.dateISO, inp.memory, banks) : null;
  const q = pickQuestion(inp.kind, tier, inp.dateISO, inp.memory, banks);
  const slots: { slot: Parameters<typeof lintSlot>[0]; text: string }[] = [];
  if (tier === 1) {
    if (!inp.links.free) throw new Error('tier-1 caption needs the free-group link (L0)');
    slots.push({ slot: 'link', text: `Free group → ${inp.links.free}` });
  }
  slots.push({ slot: 'hook', text: fill(hook.text) });
  if (fact) slots.push({ slot: 'fact', text: fact.text });
  if (cta) {
    if (tier === 2 && cta.text.includes('{link_pro}') && !inp.links.pro) throw new Error('tier-2 CTA needs the Pro link');
    slots.push({ slot: 'cta', text: fill(cta.text) });
  }
  slots.push({ slot: 'question', text: q.text });
  for (const s of slots) {
    const v = lintSlot(s.slot, tier, s.text);
    if (v.length) throw new Error(`caption v2 lint BLOCK (${inp.kind} tier ${tier} ${s.slot}): ${v.join(' · ')} — "${s.text.slice(0, 60)}"`);
  }
  return {
    text: slots.map(s => s.text).join('\n\n'),
    meta: { v: banks.banks_version, hook: hook.id, cta: cta?.id ?? null, q: q.id, fact: { on: !!fact, type: fact?.type ?? null } },
  };
}
