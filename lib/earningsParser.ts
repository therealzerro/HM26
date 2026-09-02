/**
 * earningsParser — Parses the Meta Professional Dashboard "Approximate earnings"
 * export (Monetization → Earnings → export). Shape as it arrives:
 *
 *   sep=,
 *   "Approximate earnings"
 *   "Date","Primary","content_monetization","stars","subscriptions"
 *   "2026-08-06T00:00:00","23.936","0.566","0","23.37"
 *
 * Every cell is double-quoted; dates are ISO timestamps at midnight. The
 * "Primary" column is the day's total. Subscriptions are NET of Meta's cut
 * ($2.49 → $1.74, $0.99 → $0.69). Tolerates unquoted CSV and TSV too.
 */

export interface ParsedEarningsRow {
  earn_date: string; // YYYY-MM-DD
  total_usd: number;
  content_monetization_usd: number;
  stars_usd: number;
  subscriptions_usd: number;
}

export interface EarningsParseResult {
  rows: ParsedEarningsRow[];
  warnings: string[];
  errors: string[];
}

function cells(line: string): string[] {
  const parts = line.includes('\t') ? line.split('\t') : line.split(',');
  return parts.map(c => c.trim().replace(/^"(.*)"$/, '$1').trim());
}

function num(raw: string): number | null {
  if (raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseEarningsExport(rawText: string): EarningsParseResult {
  const result: EarningsParseResult = { rows: [], warnings: [], errors: [] };
  const seen = new Set<string>();
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('sep=') || lower.includes('approximate earnings')) continue;
    if (lower.includes('date') && lower.includes('subscriptions')) continue; // header

    const c = cells(line);
    if (c.length < 5) {
      result.warnings.push(`Skipped row with <5 columns: ${line.slice(0, 80)}`);
      continue;
    }
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(c[0]);
    if (!m) {
      result.warnings.push(`Skipped row with unparseable date: ${line.slice(0, 80)}`);
      continue;
    }
    const earn_date = m[1];
    const [total, content, stars, subs] = [num(c[1]), num(c[2]), num(c[3]), num(c[4])];
    if (total === null || content === null || stars === null || subs === null) {
      result.warnings.push(`Skipped row with non-numeric amounts: ${line.slice(0, 80)}`);
      continue;
    }
    if (seen.has(earn_date)) {
      result.warnings.push(`Duplicate date in input: ${earn_date}`);
      continue;
    }
    seen.add(earn_date);
    result.rows.push({ earn_date, total_usd: total, content_monetization_usd: content, stars_usd: stars, subscriptions_usd: subs });
  }

  if (result.rows.length === 0 && lines.length > 0) result.errors.push('No valid earnings rows parsed from input');
  return result;
}
