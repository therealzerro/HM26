/**
 * subscriberEmailParser — Parses the Meta Business Suite subscriber exports.
 *
 * Two layouts are accepted (ENH-FUNNEL-2026-05-19, BUG-173, ENH-SUB-NAMES-01):
 *
 *   1. "Supporter Email Addresses" — email + date subscribed (M/D/YYYY).
 *      Tab, CSV, multi-space, or the phone's vertical pairs (email⏎date⏎).
 *   2. "Subscribers" list (2026-09-12) — Facebook display name + date in the
 *      `Mon D, YYYY` form, copied as vertical pairs (name⏎date⏎blank⏎). No
 *      email is present; the row is keyed on the name downstream
 *      (see lib/subscriberNameLink.ts).
 *
 * Every row needs a date. A line that is neither an email nor a date is a name
 * ONLY when the next non-blank line is a date; anything else is skipped with a
 * warning.
 */

export interface ParsedSubscriber {
  /** Present for the email export; absent for the name export. */
  email?: string;
  /** Present for the name export (Meta display name, trimmed, spaces collapsed). */
  facebook_name?: string;
  date_subscribed: string; // ISO date YYYY-MM-DD
}

export interface ParseResult {
  subscribers: ParsedSubscriber[];
  warnings: string[];
  errors: string[];
  /** Which layout the rows came from. 'mixed' = both in one paste. 'none' = nothing parsed. */
  format: 'email' | 'name' | 'mixed' | 'none';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
// M/D/YYYY · YYYY-MM-DD · Mon D, YYYY · Month D YYYY
const DATE_RE = /^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4})$/;

export function isDateToken(s: string): boolean {
  return DATE_RE.test(s.trim());
}

function splitTwoColumns(line: string): string[] | null {
  // A trailing date token (any accepted form) ends the row; everything before it
  // is the identity column. This is checked first because `Mon D, YYYY` contains
  // a comma and would otherwise be split as CSV.
  const trailing = line.match(/^(.*?)(?:[\t,]|\s{2,})\s*((?:[A-Za-z]{3,9}\.? \d{1,2},? \d{4})|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})$/);
  if (trailing && trailing[1].trim()) return [trailing[1].trim(), trailing[2].trim()];

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

export function parseDate(raw: string): string | null {
  // Facebook exports use M/D/YYYY (email list) or `Mon D, YYYY` (subscriber
  // list). Also accept YYYY-MM-DD already-ISO.
  let y: number, mo: number, d: number;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    [y, mo, d] = s.split('-').map(Number) as [number, number, number];
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)!;
    mo = parseInt(m[1], 10);
    d = parseInt(m[2], 10);
    y = parseInt(m[3], 10);
  } else {
    const m = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/);
    if (!m) return null;
    const mon = MONTHS[m[1].toLowerCase()];
    if (!mon) return null;
    mo = mon;
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

/** Trim, collapse inner whitespace. Used for both parsing and matching. */
export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isHeaderLine(lower: string): boolean {
  if (lower.includes('email') && (lower.includes('subscribed') || lower.includes('date'))) return true;
  return /^(name|names|subscriber|subscribers|supporter|supporters|date|date subscribed|joined|member|members)$/.test(lower);
}

function looksLikeName(s: string): boolean {
  if (s.length < 2 || s.length > 80) return false;
  if (EMAIL_RE.test(s) || isDateToken(s)) return false;
  if (/^\d+$/.test(s)) return false;
  // Must contain at least one letter; Meta names are free text otherwise.
  return /[A-Za-zÀ-ɏ]/.test(s);
}

export function parseSubscriberEmailExport(rawText: string): ParseResult {
  const result: ParseResult = { subscribers: [], warnings: [], errors: [], format: 'none' };
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // BUG-173 / ENH-SUB-NAMES-01: both Meta lists copy as VERTICAL pairs when
  // pasted from the phone — the identity (email or display name) on one line,
  // its date on the next. Pair such lines back into one tab-separated row
  // before column parsing so vertical and single-line layouts import
  // identically.
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cur = rawLines[i];
    const next = rawLines[i + 1];
    const curIsIdentity = EMAIL_RE.test(cur) || (looksLikeName(cur) && !isHeaderLine(cur.toLowerCase()));
    if (curIsIdentity && next !== undefined && isDateToken(next)) {
      lines.push(`${cur}\t${next}`);
      i++;
    } else {
      lines.push(cur);
    }
  }

  let emailRows = 0;
  let nameRows = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (isHeaderLine(lower)) continue;

    const parts = splitTwoColumns(line);
    if (!parts) {
      result.warnings.push(`Skipped malformed line: ${line.slice(0, 80)}`);
      continue;
    }

    const [identityRaw, dateRaw] = parts;
    const date_subscribed = parseDate(dateRaw);
    if (!date_subscribed) {
      result.warnings.push(`Skipped unparseable date "${dateRaw}" for ${identityRaw.slice(0, 40)}`);
      continue;
    }

    if (EMAIL_RE.test(identityRaw)) {
      const email = identityRaw.toLowerCase();
      if (seenEmails.has(email)) {
        result.warnings.push(`Duplicate email in input: ${email}`);
        continue;
      }
      seenEmails.add(email);
      result.subscribers.push({ email, date_subscribed });
      emailRows++;
      continue;
    }

    if (identityRaw.includes('@')) {
      result.warnings.push(`Skipped invalid email: ${identityRaw}`);
      continue;
    }

    const facebook_name = normalizeDisplayName(identityRaw);
    if (!looksLikeName(facebook_name)) {
      result.warnings.push(`Skipped unrecognised identity: ${identityRaw.slice(0, 40)}`);
      continue;
    }
    const nameKey = facebook_name.toLowerCase();
    if (seenNames.has(nameKey)) {
      result.warnings.push(`Duplicate name in input: ${facebook_name} (kept the first; two different people with one name must be linked by hand)`);
      continue;
    }
    seenNames.add(nameKey);
    result.subscribers.push({ facebook_name, date_subscribed });
    nameRows++;
  }

  result.format = emailRows && nameRows ? 'mixed' : emailRows ? 'email' : nameRows ? 'name' : 'none';

  if (result.subscribers.length === 0 && lines.length > 0) {
    result.errors.push('No valid subscriber rows parsed from input');
  }
  return result;
}
