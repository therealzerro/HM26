/**
 * reel-caption-v2 — MKT-85 CAPTION SYSTEM v2, build 4: the publish-side
 * wiring around the pure assembler (lib/social/captionAssembler.ts).
 *
 *   · GATING — a kind is drafted by v2 ONLY while it is listed in
 *     constants/captionBanks.v2.json `live_kinds`; every other kind runs the
 *     old caption family (scripts/reel-captions.ts) unchanged. live_kinds is
 *     EMPTY until the operator has eyeballed a week of previews per kind.
 *     A v2 failure (no bank, a slot lint block, a missing link) is logged and
 *     the kind falls back to the old family — the upload never blocks.
 *   · MEMORY — the rotation rules need history: the last MEMORY_DAYS of
 *     marketing_reels.caption_meta. The row is the post; `free` = the
 *     `caption` column's meta, `pro` = `caption_pro`'s (verify rows carry
 *     both). Nothing else is stored.
 *   · DAY — the assembler's `dateISO` is the POST day (its verify hooks say
 *     "yesterday's" weekday). verify / record rows are dated D−1 (reel_date =
 *     content date), so their caption day = reel_date + 1; slate kinds post
 *     on their reel_date.
 *
 * Pure: no env, no I/O, no process — importable by __tests__. The one fetch
 * (fetchCaptionMetaRows) takes the caller's GET.
 */
import { CAPTION_BANKS, type CaptionBanks } from '../lib/social/captionBanks';
import { assembleCaption, type AssembledCaption, type CaptionFacts, type CaptionLinks, type CaptionMemory, type CaptionMeta } from '../lib/social/captionAssembler';

/** days of caption_meta read back: the 7-day question cooldown + today */
export const MEMORY_DAYS = 8;

export type CaptionMetaPair = { free?: CaptionMeta; pro?: CaptionMeta };
export interface CaptionMetaRow { reel_date: string; kind: string; caption_meta: CaptionMetaPair | null }

/** kinds whose reel_date is the CONTENT day (D−1) — they post the morning after */
const D_MINUS_1_KINDS = new Set(['verify', 'verify_pro', 'verify_public', 'record_public']);

export function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day a caption kind's row with this reel_date is posted — the assembler's dateISO and the memory key. */
export function captionDayFor(kind: string, reelDate: string): string {
  return D_MINUS_1_KINDS.has(kind) ? shiftISO(reelDate, 1) : reelDate;
}

/** Where a caption kind's meta lives: the row kind and the side of caption_meta. */
export function metaSlotFor(kind: string): { rowKind: string; side: 'free' | 'pro' } {
  return kind === 'verify_pro' ? { rowKind: 'verify', side: 'pro' } : { rowKind: kind, side: 'free' };
}

/** v2 drafts this kind ONLY while it is on live_kinds. */
export function isV2Live(kind: string, banks: CaptionBanks = CAPTION_BANKS): boolean {
  return Array.isArray(banks.live_kinds) && banks.live_kinds.includes(kind);
}

/** The REST path for the memory read (last MEMORY_DAYS by reel_date, meta-bearing rows only). */
export function captionMetaPath(captionDay: string): string {
  // D−1 kinds post a day after their reel_date, so the window starts a day earlier than the cooldown needs
  return `/rest/v1/marketing_reels?select=reel_date,kind,caption_meta&caption_meta=not.is.null` +
    `&reel_date=gte.${shiftISO(captionDay, -MEMORY_DAYS)}&reel_date=lte.${captionDay}&order=reel_date.desc,kind.asc&limit=400`;
}

export async function fetchCaptionMetaRows(get: <T>(path: string) => Promise<T>, captionDay: string): Promise<CaptionMetaRow[]> {
  const rows = await get<CaptionMetaRow[]>(captionMetaPath(captionDay));
  return Array.isArray(rows) ? rows : [];
}

/**
 * CaptionMemory for (kind, captionDay) from the rows: this kind's own slot
 * newest first (the assembler applies the no-consecutive and cooldown rules),
 * plus every OTHER slot's question used on captionDay (once-per-day rule).
 * `inRun` = question ids already drafted earlier in this same publish run
 * (not yet on a row).
 */
export function buildCaptionMemory(kind: string, captionDay: string, rows: CaptionMetaRow[], inRun: string[] = []): CaptionMemory {
  const own = metaSlotFor(kind);
  const recent: CaptionMemory['recent'] = [];
  const todayQuestions = [...inRun];
  for (const r of rows) {
    if (!r.caption_meta) continue;
    for (const side of ['free', 'pro'] as const) {
      const m = r.caption_meta[side];
      if (!m) continue;
      const slotKind = side === 'pro' && r.kind === 'verify' ? 'verify_pro' : r.kind;
      const date = captionDayFor(slotKind, r.reel_date);
      const mine = r.kind === own.rowKind && side === own.side;
      if (mine) recent.push({ date, hook: m.hook ?? null, cta: m.cta ?? null, q: m.q ?? null });
      else if (date === captionDay && m.q) todayQuestions.push(m.q);
    }
  }
  recent.sort((a, b) => b.date.localeCompare(a.date));
  return { recent, todayQuestions };
}

export interface V2DraftInput {
  kind: string; reelDate: string; facts: CaptionFacts | null; links: CaptionLinks;
  rows: CaptionMetaRow[]; inRun?: string[]; banks?: CaptionBanks;
  warn?: (msg: string) => void;
}

/**
 * The v2 draft for a kind, or null → the caller runs the old family.
 * null when the kind is not live, or when the assembler refuses (logged).
 */
export function v2Draft(inp: V2DraftInput): AssembledCaption | null {
  const banks = inp.banks ?? CAPTION_BANKS;
  if (!isV2Live(inp.kind, banks)) return null;
  const captionDay = captionDayFor(inp.kind, inp.reelDate);
  const memory = buildCaptionMemory(inp.kind, captionDay, inp.rows, inp.inRun ?? []);
  try {
    return assembleCaption({ kind: inp.kind, dateISO: captionDay, facts: inp.facts, memory, links: inp.links, banks });
  } catch (e) {
    inp.warn?.(`[caption-v2] ${inp.kind}: assembler refused — old family used. ${String(e instanceof Error ? e.message : e).slice(0, 200)}`);
    return null;
  }
}

/** The caption_meta column value for a row: NULL unless v2 drafted at least one side. */
export function captionMetaFor(free: CaptionMeta | null | undefined, pro: CaptionMeta | null | undefined): CaptionMetaPair | null {
  if (!free && !pro) return null;
  const out: CaptionMetaPair = {};
  if (free) out.free = free;
  if (pro) out.pro = pro;
  return out;
}
