/**
 * subscriberEmailParser — Parses Meta Business Suite "Supporter Email
 * Addresses" exports. Two columns: email + date subscribed. Tolerates tab,
 * CSV, or multi-space separators and skips a header row if present.
 */

export interface ParsedSubscriber {
  email: string;
  date_subscribed: string; // ISO date YYYY-MM-DD
}

export interface ParseResult {
  subscribers: ParsedSubscriber[];
  warnings: string[];
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitTwoColumns(line: string): string[] | null {
  // Try tab first, then unambiguous CSV (comma followed by a digit-or-space-digit), then 2+ spaces.
  const byTab = line.split('\t').map(s => s.trim()).filter(Boolean);
  if (byTab.length === 2) return byTab;

  const byCsv = line.split(/,(?=\s*\d)/).map(s => s.trim()).filter(Boolean);
  if (byCsv.length === 2) return byCsv;

  const bySpace = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  if (bySpace.length === 2) return bySpace;

  // Fallback: split on whitespace only if the second token looks like a date.
  const generic = line.split(/\s+/);
  if (generic.length === 2 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(generic[1])) {
    return generic;
  }
  return null;
}

function parseDate(raw: string): string | null {
  // Facebook exports use M/D/YYYY. Also accept YYYY-MM-DD already-ISO.
  let y: number, mo: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [y, mo, d] = raw.split('-').map(Number) as [number, number, number];
  } else {
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    mo = parseInt(m[1], 10);
    d = parseInt(m[2], 10);
    y = parseInt(m[3], 10);
  }
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 2020 || y > 2099) return null;
  // Round-trip through Date to catch impossible day/month combos (Feb 30 etc).
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseSubscriberEmailExport(rawText: string): ParseResult {
  const result: ParseResult = { subscribers: [], warnings: [], errors: [] };
  const seen = new Set<string>();

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Skip header rows
    if (lower.includes('email') && (lower.includes('subscribed') || lower.includes('date'))) {
      continue;
    }

    const parts = splitTwoColumns(line);
    if (!parts) {
      result.warnings.push(`Skipped malformed line: ${line.slice(0, 80)}`);
      continue;
    }

    const [emailRaw, dateRaw] = parts;
    const email = emailRaw.toLowerCase();

    if (!EMAIL_RE.test(email)) {
      result.warnings.push(`Skipped invalid email: ${emailRaw}`);
      continue;
    }

    const date_subscribed = parseDate(dateRaw);
    if (!date_subscribed) {
      result.warnings.push(`Skipped unparseable date "${dateRaw}" for ${email}`);
      continue;
    }

    if (seen.has(email)) {
      result.warnings.push(`Duplicate email in input: ${email}`);
      continue;
    }
    seen.add(email);

    result.subscribers.push({ email, date_subscribed });
  }

  if (result.subscribers.length === 0 && lines.length > 0) {
    result.errors.push('No valid subscriber rows parsed from input');
  }
  return result;
}
