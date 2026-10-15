/**
 * pageInsightsParser — Parses the Meta Professional Dashboard PAGE-level
 * Insights exports (Insights → Results / Audience / Earnings → export) pasted
 * as one blob or one at a time. ENH-FUNNEL-04 (2026-10-15).
 *
 * Each export is a titled block: a `sep=,` line, a quoted title line, a header
 * line that starts with "Date", then one quoted row per day:
 *
 *   sep=,
 *   "Viewers"
 *   "Date","Primary"
 *   "2026-10-14T00:00:00","2371"
 *
 * Blocks and where they land (fb_page_daily, one row per day, no PII):
 *   "Viewers"              → viewers_unique
 *   "Content interactions" → content_interactions
 *   "Facebook follows"     → follows_new
 *   "Untitled" daily block whose header is "Date","FB_PAGE,SUBSCRIBE,UNIQUE_USERS"
 *                          → subscribers_total (a 0 is a partial day → null)
 *   "Approximate earnings" with the 5-column header
 *                          → earnings rows (handed to fb_earnings_daily by the caller)
 *
 * Skipped on purpose (reported in `skipped`, never stored): the Subscribers
 * summary counters, the 2-column subscriptions-only earnings export (no total —
 * paste the full earnings export instead), Age & gender, Top cities, Top
 * countries, Views / Content interactions / Published content by type.
 *
 * Cells are RFC-style quoted CSV — a quoted cell may contain commas
 * ("FB_PAGE,SUBSCRIBE,UNIQUE_USERS"), so this parser does not split on bare
 * commas. Tolerates TSV and unquoted CSV too.
 */

import type { ParsedEarningsRow } from './earningsParser';

export interface ParsedPageDay {
  day: string; // YYYY-MM-DD
  viewers_unique?: number | null;
  content_interactions?: number | null;
  follows_new?: number | null;
  subscribers_total?: number | null;
}

export interface PageInsightsParseResult {
  days: ParsedPageDay[];
  earnings: ParsedEarningsRow[];
  /** Subscribers summary counters when the Subscribers export is in the paste. */
  summary: { subscribers?: number; gained?: number; gifted?: number; canceled?: number };
  /** Block titles that were recognised and intentionally not stored. */
  skipped: string[];
  /** Metric columns found in `days` (drives the preview + the upsert key set). */
  metrics: Array<keyof Omit<ParsedPageDay, 'day'>>;
  warnings: string[];
  errors: string[];
}

/** Split one CSV/TSV line into trimmed cells, honouring double quotes. */
export function splitCells(line: string): string[] {
  if (line.includes('\t') && !line.includes('"')) return line.split('\t').map(c => c.trim());
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === '\t') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

type Metric = keyof Omit<ParsedPageDay, 'day'>;

const TITLE_TO_METRIC: Record<string, Metric> = {
  'viewers': 'viewers_unique',
  'content interactions': 'content_interactions',
  'facebook follows': 'follows_new',
};

const SKIP_TITLES = new Set([
  'age & gender', 'top cities', 'top countries', 'views', 'published content',
  'subscribers', 'gained subscribers', 'gifted subscribers', 'canceled subscribers',
]);

function num(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parsePageInsights(rawText: string): PageInsightsParseResult {
  const res: PageInsightsParseResult = { days: [], earnings: [], summary: {}, skipped: [], metrics: [], warnings: [], errors: [] };
  const byDay = new Map<string, ParsedPageDay>();
  const metricsSeen = new Set<Metric>();
  const earnSeen = new Set<string>();

  type Mode =
    | { kind: 'idle'; title: string }
    | { kind: 'metric'; title: string; metric: Metric; lastDay: string | null }
    | { kind: 'earnings'; title: string }
    | { kind: 'skip'; title: string }
    | { kind: 'summary'; title: string; key: keyof PageInsightsParseResult['summary'] };

  let mode: Mode = { kind: 'idle', title: '' };
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const setDay = (day: string, metric: Metric, value: number | null) => {
    const row = byDay.get(day) ?? { day };
    if (row[metric] !== undefined && row[metric] !== value) res.warnings.push(`${metric} for ${day} appears twice (${row[metric]} → ${value})`);
    row[metric] = value;
    byDay.set(day, row);
    metricsSeen.add(metric);
  };

  for (const line of lines) {
    if (line.toLowerCase().startsWith('sep=')) continue;
    const c = splitCells(line);
    const nonEmpty = c.filter(x => x !== '');
    const first = c[0] ?? '';
    const firstLower = first.toLowerCase();
    const isDateRow = /^\d{4}-\d{2}-\d{2}/.test(first);

    // ── Title lines: one non-empty cell that is not a date and not a number ──
    if (nonEmpty.length === 1 && !isDateRow && !/^-?\d+(\.\d+)?$/.test(first)) {
      const title = first;
      const t = firstLower;
      if (t === 'approximate earnings') { mode = { kind: 'earnings', title }; continue; }
      if (TITLE_TO_METRIC[t]) { mode = { kind: 'metric', title, metric: TITLE_TO_METRIC[t], lastDay: null }; continue; }
      if (t === 'untitled') { mode = { kind: 'idle', title }; continue; } // decided by its header
      if (t === 'subscribers') { mode = { kind: 'summary', title, key: 'subscribers' }; continue; }
      if (t === 'gained subscribers') { mode = { kind: 'summary', title, key: 'gained' }; continue; }
      if (t === 'gifted subscribers') { mode = { kind: 'summary', title, key: 'gifted' }; continue; }
      if (t === 'canceled subscribers') { mode = { kind: 'summary', title, key: 'canceled' }; continue; }
      if (SKIP_TITLES.has(t)) { if (!res.skipped.includes(title)) res.skipped.push(title); mode = { kind: 'skip', title }; continue; }
      // The summary blocks carry a metric-id line ("FB_PAGE,SUBSCRIBE,UNIQUE_USERS") — not a title.
      if (mode.kind === 'summary' && /^fb_page,/i.test(t)) continue;
      // Unknown single-cell line inside a skipped block (e.g. a city name with no value) — ignore.
      if (mode.kind === 'skip') continue;
      res.warnings.push(`Unrecognised block "${title}" — skipped`);
      mode = { kind: 'skip', title };
      continue;
    }

    // ── Header lines (start with "Date") ──
    if (firstLower === 'date') {
      const header = c.map(x => x.toLowerCase());
      if (mode.kind === 'earnings') {
        if (!(header.includes('subscriptions') && header.includes('stars'))) {
          res.skipped.push('Approximate earnings (subscriptions-only export — paste the full earnings export)');
          mode = { kind: 'skip', title: 'Approximate earnings (2-col)' };
        }
        continue;
      }
      if (header.some(h => h.includes('subscribe') && h.includes('unique_users'))) {
        mode = { kind: 'metric', title: 'Subscribers (daily)', metric: 'subscribers_total', lastDay: null };
        continue;
      }
      if (mode.kind === 'idle' && mode.title.toLowerCase() === 'untitled') {
        res.warnings.push('Untitled daily block with an unknown metric header — skipped');
        mode = { kind: 'skip', title: 'Untitled' };
      }
      continue;
    }

    // ── Summary counters: a lone number under a Subscribers summary title ──
    if (mode.kind === 'summary') {
      if (nonEmpty.length === 1 && /^-?\d+(\.\d+)?$/.test(first)) { res.summary[mode.key] = Number(first); mode = { kind: 'idle', title: '' }; }
      continue;
    }

    if (!isDateRow) continue; // table rows of skipped blocks, blank padding, etc.
    const day = first.slice(0, 10);

    if (mode.kind === 'earnings') {
      if (c.length < 5) { res.warnings.push(`Earnings row with <5 columns skipped: ${line.slice(0, 80)}`); continue; }
      const [total, content, stars, subs] = [num(c[1]) ?? 0, num(c[2]) ?? 0, num(c[3]) ?? 0, num(c[4]) ?? 0];
      if (earnSeen.has(day)) { res.warnings.push(`Duplicate earnings date: ${day}`); continue; }
      earnSeen.add(day);
      res.earnings.push({ earn_date: day, total_usd: total, content_monetization_usd: content, stars_usd: stars, subscriptions_usd: subs });
      continue;
    }

    if (mode.kind === 'metric') {
      const v = num(c[1] ?? '');
      if (v === null) { res.warnings.push(`${mode.title}: non-numeric value on ${day} skipped`); continue; }
      if (mode.metric === 'subscribers_total' && v === 0) {
        // Meta writes 0 for the still-open day; a page with subscribers never has 0.
        res.warnings.push(`Subscribers = 0 on ${day} treated as a partial day (stored as unknown)`);
        setDay(day, mode.metric, null);
      } else {
        setDay(day, mode.metric, v);
      }
      mode.lastDay = day;
      continue;
    }
    // idle / skip: date rows are ignored.
  }

  res.days = Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? -1 : 1));
  res.metrics = Array.from(metricsSeen);
  if (res.days.length === 0 && res.earnings.length === 0 && lines.length > 0) {
    res.errors.push('No page-level daily series or earnings rows found — expected Viewers / Content interactions / Facebook follows / Subscribers / Approximate earnings exports');
  }
  return res;
}
