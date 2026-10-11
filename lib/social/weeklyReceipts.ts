/**
 * weeklyReceipts — the SUNDAY RECEIPTS weekly recap image: data + model
 * (MKT-83, content agent order 2026-10-11; Phase 0 report in
 * docs/mkt83_phase0_report.md).
 *
 * One week = the previous Sunday → Saturday (ruling A), seven rows, three
 * boards per row. Every cell is graded by the brief's own law
 * (lib/social/briefResolve.ts: BOX = sorted set ∩ draws, STRAIGHT =
 * result_digits === bestOrder) — the same resolver the daily brief and the
 * verify reel use. No stored hit flags (BUG-162).
 *
 * Cell states (ruling A):
 *   none     — board published, draws landed, nothing matched → dim dash
 *   box      — BOX MATCH chip (tier 1: ANY ORDER)
 *   straight — gold STRAIGHT MATCH chip (tier 1: EXACT ORDER)
 *   empty    — no board or no draws for that day/board → NOTHING drawn.
 *              Operator rule: internal timing issues never get a member-facing
 *              label. (0 of 168 cells in the eight measured weeks.)
 *
 * ⛔ R-A: no weekly total anywhere — no hero count, no "N matches this week".
 * The grid is the record. Nothing in this module counts.
 *
 * Like briefCopy.ts, every word the card draws comes from `buildWeeklyModel`
 * and `weeklyModelStrings` enumerates it for the lint — a string cannot reach
 * the PNG without passing `lintWeekly`.
 */

import type { SocialTier } from './brandLint';
import { lintStrings, type BriefLintResult } from './briefLint';
import { fetchDay, SCOPES, type Scope } from './socialBrief';
import { resolveDraws, type PickMatch } from './briefResolve';
import { briefTier, chipsFor, BRIEF_COPY, type BriefVariant, type GroupTier, type BriefChip } from './briefCopy';
import { sessionLabel } from './sessionLabels';
import { getTodayET } from '@/lib/dateUtils';

export type WeeklyCellState = 'none' | 'box' | 'straight' | 'empty';

export interface WeeklyCell {
  scope: Scope;
  state: WeeklyCellState;
  matches: PickMatch[];     // matched picks, slate order (empty unless box/straight)
}

export interface WeeklyDay {
  date: string;             // "2026-10-04"
  cells: Record<Scope, WeeklyCell>;
}

export interface WeeklyReceiptsData {
  start: string;            // Sunday "YYYY-MM-DD"
  end: string;              // Saturday
  days: WeeklyDay[];        // 7, Sun → Sat
}

export const WEEKLY_COPY = {
  kicker: 'SUNDAY RECEIPTS',
  footer1: 'Every match and every miss stays on the record.',
  // No "before the draw" here — the weekly image has no timing dependency (ruling C).
  footer2: 'Six signals a day · Graded the same day · 42 states & provinces',
  dash: '—',
  tagStraight: 'STRAIGHT MATCH',
  tagBox: 'BOX MATCH',
  tagStraightPublic: 'EXACT ORDER',   // tier 1 relabel (ruling A)
  tagBoxPublic: 'ANY ORDER',
} as const;

/** Column order per tier (ruling A): members ALL-DAY · MIDDAY · EVENING;
 *  public DAYTIME · NIGHTTIME · CONTINUOUS (the established §6 translation). */
export function weeklyColumns(tier: SocialTier): Scope[] {
  return tier === 1 || tier === 3 ? ['midday', 'evening', 'allday'] : ['allday', 'midday', 'evening'];
}

// ── dates ──────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dow(iso: string): number { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }

/** The last COMPLETE Sun–Sat week strictly before `today` (ET). On a Sunday
 *  that is the week that ended yesterday; any other day, the week that ended
 *  on the most recent Saturday. */
export function lastCompleteWeek(today: string = getTodayET()): { start: string; end: string } {
  const back = (dow(today) + 1) % 7;          // days back to the most recent Saturday before today
  const end = addDays(today, -(back === 0 ? 7 : back));
  return { start: addDays(end, -6), end };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
function monthDay(iso: string): string { const [, m, d] = iso.split('-').map(n => parseInt(n, 10)); return `${MONTHS[m - 1]} ${d}`; }

/** "OCT 4 – OCT 10" */
export function weekRangeLabel(start: string, end: string): string { return `${monthDay(start)} – ${monthDay(end)}`; }
/** "SUN · OCT 4" */
export function dayRowLabel(iso: string): string { return `${DOWS[dow(iso)]} · ${monthDay(iso)}`; }

// ── data ───────────────────────────────────────────────────────────────────

export async function buildWeeklyReceipts(week: { start: string; end: string } = lastCompleteWeek()): Promise<WeeklyReceiptsData> {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(addDays(week.start, i));
  const dayData = await Promise.all(dates.map(d => fetchDay(d)));
  const days: WeeklyDay[] = dates.map((date, i) => {
    const { boards, draws } = dayData[i];
    const cells = {} as Record<Scope, WeeklyCell>;
    for (const sc of SCOPES) {
      const picks = boards[sc];
      const r = resolveDraws(picks, draws, sc);
      const state: WeeklyCellState = !picks.length || !r.resolved ? 'empty' : r.straight ? 'straight' : r.slateHit ? 'box' : 'none';
      cells[sc] = { scope: sc, state, matches: state === 'box' || state === 'straight' ? r.matches : [] };
    }
    return { date, cells };
  });
  return { start: week.start, end: week.end, days };
}

// ── model ──────────────────────────────────────────────────────────────────

export interface WeeklyModelCell {
  state: WeeklyCellState;
  tag: string;              // '' for none/empty; the chip label otherwise
  chips: BriefChip[];       // tiers 2/4 only — tier 1 shows NO digits
}

export interface WeeklyModelRow {
  label: string;            // "SUN · OCT 4"
  cells: WeeklyModelCell[]; // in column order
}

export interface WeeklyModel {
  tier: SocialTier;
  variant: BriefVariant;
  groupTier?: GroupTier;
  kicker: string;           // "SUNDAY RECEIPTS"
  range: string;            // "OCT 4 – OCT 10"
  weekKey: string;          // "2026-10-04_2026-10-10" (PNG tag / filename)
  columns: string[];        // tier-translated column words
  rows: WeeklyModelRow[];   // 7
  footer1: string;
  footer2: string;
}

export function buildWeeklyModel(data: WeeklyReceiptsData, variant: BriefVariant, groupTier?: GroupTier): WeeklyModel {
  const tier = briefTier(variant, groupTier);
  const isPublic = tier === 1 || tier === 3;
  const cols = weeklyColumns(tier);
  const tagFor = (st: WeeklyCellState): string =>
    st === 'straight' ? (isPublic ? WEEKLY_COPY.tagStraightPublic : WEEKLY_COPY.tagStraight)
    : st === 'box' ? (isPublic ? WEEKLY_COPY.tagBoxPublic : WEEKLY_COPY.tagBox)
    : '';
  return {
    tier, variant, groupTier,
    kicker: WEEKLY_COPY.kicker,
    range: weekRangeLabel(data.start, data.end),
    weekKey: `${data.start}_${data.end}`,
    columns: cols.map(sc => sessionLabel(sc, tier).toUpperCase()),
    rows: data.days.map(d => ({
      label: dayRowLabel(d.date),
      cells: cols.map(sc => {
        const c = d.cells[sc];
        return { state: c.state, tag: tagFor(c.state), chips: isPublic ? [] : chipsFor(c.matches) };
      }),
    })),
    footer1: WEEKLY_COPY.footer1,
    footer2: WEEKLY_COPY.footer2,
  };
}

/** Every string the card will draw for this model, in reading order. */
export function weeklyModelStrings(m: WeeklyModel): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined | null) => { if (text) out.push({ where, text }); };
  add('brand', `${BRIEF_COPY.brand} ${BRIEF_COPY.brandAccent}`);
  add('kicker', m.kicker);
  add('range', m.range);
  m.columns.forEach((c, i) => add(`column.${i}`, c));
  m.rows.forEach((r, ri) => {
    add(`row.${ri}.label`, r.label);
    r.cells.forEach((c, ci) => {
      if (c.state === 'none') add(`row.${ri}.cell.${ci}`, WEEKLY_COPY.dash);
      add(`row.${ri}.cell.${ci}.tag`, c.tag);
      if (c.chips.length) add(`row.${ri}.cell.${ci}.chips`, c.chips.map(ch => ch.text).join(' '));
    });
  });
  add('footer1', m.footer1);
  add('footer2', m.footer2);
  return out;
}

export function lintWeekly(model: WeeklyModel): BriefLintResult {
  return lintStrings(model.tier, weeklyModelStrings(model));
}
