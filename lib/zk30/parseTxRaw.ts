// lib/zk30/parseTxRaw.ts
//
// Pure parser for the TX Pick 3 raw-draws paste format. No I/O, no Supabase —
// the CLI importer (scripts/imports/import_tx_raw.ts) and the future admin-UI
// daily import path both call this and share its validation rules.
//
// Expected line shape (tab-separated, 4 fields):
//   Mon, May 25, 2026\tTexas\tPick 3 Day\t1-7-1, Fireball: 3
//   Mon, May 25, 2026\tTexas\tPick 3 Morning\t8-3-6, Fireball: 4
//   ...
//
// Field 2 is jurisdiction (always "Texas" for ZK30 v1.0; ignored at parse
// time). Field 4 combines the 3-digit result with an optional Fireball suffix
// — the parser splits them. Defensively tolerates a 3-field shape where
// jurisdiction is omitted (date, session, result-with-fireball).
//
// Tolerates:
//   • CRLF + LF line endings
//   • blank lines (skipped silently)
//   • trailing .,; on the line as a whole (paste artifacts)
//   • session prefix variations — only the trailing token matters
//     (Morning|Day|Evening|Night), so "Pick 3 Day", "TX Day", "Texas Day",
//     and bare "Day" all parse the same.
//   • dashed or undashed result strings (1-7-1 or 171)
//   • result-only field 4 (no Fireball suffix) → fireball = null
//   • case-insensitive "Fireball:" label
//
// Rejects (with structured reason, not by throwing):
//   • lines with < 3 or > 4 tab fields      → reason='field_count'
//   • date that doesn't match "%a, %b %d, %Y" → reason='bad_date'
//   • Sunday draws (TX has no Sunday Pick 3) → reason='sunday'
//   • session not ending in M/D/E/N         → reason='bad_session'
//   • field 4 doesn't match result(, Fireball: D)? shape → reason='bad_result'
//   • fireball suffix present but value not a single digit → reason='bad_fireball'

export type TxSession = 'Morning' | 'Day' | 'Evening' | 'Night';

export type TxRawRecord = {
  date_et: string;          // YYYY-MM-DD
  session: TxSession;
  result_digits: string;    // 'DDD' (3 chars)
  fireball: string | null;  // single digit or null
};

export type RejectedLine = {
  line_number: number;      // 1-indexed within the input
  raw: string;              // original (untrimmed, unstripped) line
  reason: string;           // 'field_count' | 'bad_date' | 'sunday' | 'bad_session' | 'bad_result' | 'bad_fireball'
};

export type ParseResult = {
  records: TxRawRecord[];
  rejected: RejectedLine[];
};

const MONTHS: Record<string, number> = {
  Jan: 1,  Feb: 2,  Mar: 3,  Apr: 4,  May: 5,  Jun: 6,
  Jul: 7,  Aug: 8,  Sep: 9,  Oct: 10, Nov: 11, Dec: 12,
};

const SESSIONS: ReadonlySet<TxSession> = new Set(['Morning', 'Day', 'Evening', 'Night']);

const DATE_RE = /^([A-Za-z]{3}),\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/;

// Captures the 3-digit result (group 1) and the optional fireball (group 2).
// Group 2 is undefined if no Fireball suffix is present; explicitly a single
// digit when present. Anything between "Fireball:" and a non-digit (or a
// multi-char value) leaves group 2 unmatched → result is missing → bad_result.
const RESULT_FIREBALL_RE = /^(\d-\d-\d|\d{3})(?:\s*,\s*Fireball:\s*(\d))?$/i;

// Strip ONE trailing run of . , ; (and surrounding whitespace) from the line.
// Handles "...Fireball: 2." → "...Fireball: 2" but leaves embedded punctuation intact.
function stripTrailingPunct(line: string): string {
  return line.replace(/[.,;\s]+$/u, '');
}

// Manual %a, %b %d, %Y parse — avoids platform-dependent Date.parse for this format.
// Returns { iso: 'YYYY-MM-DD', dayOfWeek: 0..6 } or null on any failure.
// dayOfWeek is the *computed* weekday (UTC midnight), not the named weekday from
// the input — that way a bogus "Wed, May 21, 2025" where 5/21 is actually Wed
// passes, but a row mislabeled "Sun, May 21, 2025" rejects via the computed
// weekday rule, not via name-matching.
function parseDate(s: string): { iso: string; dayOfWeek: number } | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const monthNum = MONTHS[m[2]];
  if (!monthNum) return null;
  const day = Number(m[3]);
  const year = Number(m[4]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return null;

  const d = new Date(Date.UTC(year, monthNum - 1, day));
  // Guard against Date overflow: e.g. Feb 30 silently rolls to Mar 2.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthNum - 1 || d.getUTCDate() !== day) {
    return null;
  }
  const iso = `${year.toString().padStart(4, '0')}-${monthNum.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return { iso, dayOfWeek: d.getUTCDay() };
}

// Session token is the trailing whitespace-delimited word. "Pick 3 Day" → "Day",
// "Texas Morning" → "Morning", bare "Night" → "Night". Returns null if no valid
// token tails the field.
function extractSession(field: string): TxSession | null {
  const trimmed = field.trim();
  if (!trimmed) return null;
  const tail = trimmed.split(/\s+/).pop();
  if (!tail) return null;
  return SESSIONS.has(tail as TxSession) ? (tail as TxSession) : null;
}

// Split field 4 into result + fireball. Returns:
//   { result: 'DDD', fireball: 'D' }       — fully-formed with Fireball suffix
//   { result: 'DDD', fireball: null }      — result only, no Fireball suffix
//   { error: 'bad_result' }                — field 4 doesn't match the shape
//   { error: 'bad_fireball' }              — for future-proofing; the regex
//                                            currently rejects malformed fireball
//                                            at the bad_result level. We keep the
//                                            return shape extensible.
type ResultParse =
  | { result: string; fireball: string | null }
  | { error: 'bad_result' | 'bad_fireball' };

function parseResultField(field: string): ResultParse {
  const trimmed = field.trim();
  const m = RESULT_FIREBALL_RE.exec(trimmed);
  if (!m) {
    // Distinguish "looks like it tried to have a fireball but the value is junk"
    // from "result digits themselves are malformed". If the field contains
    // "Fireball" (case-insensitive) but the regex didn't match, the result
    // portion is OK and the fireball value is what failed.
    if (/fireball/i.test(trimmed) && /^(\d-\d-\d|\d{3})/.test(trimmed)) {
      return { error: 'bad_fireball' };
    }
    return { error: 'bad_result' };
  }
  const result = m[1].replace(/-/g, '');
  if (result.length !== 3) return { error: 'bad_result' };
  const fireball = m[2] ?? null;
  return { result, fireball };
}

export function parseTxRawText(input: string): ParseResult {
  const records: TxRawRecord[] = [];
  const rejected: RejectedLine[] = [];

  // Split on either CRLF or LF (handle both; \r\n captured first).
  const lines = input.split(/\r\n|\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const stripped = stripTrailingPunct(trimmed);
    const fields = stripped.split('\t');

    if (fields.length < 3 || fields.length > 4) {
      rejected.push({ line_number: lineNumber, raw, reason: 'field_count' });
      continue;
    }

    // 4-field shape: date \t jurisdiction \t session \t result-with-fireball
    // 3-field shape (defensive): date \t session \t result-with-fireball
    let dateField: string;
    let sessionField: string;
    let resultField: string;
    if (fields.length === 4) {
      [dateField, , sessionField, resultField] = fields;
    } else {
      [dateField, sessionField, resultField] = fields;
    }

    const parsedDate = parseDate(dateField.trim());
    if (!parsedDate) {
      rejected.push({ line_number: lineNumber, raw, reason: 'bad_date' });
      continue;
    }
    if (parsedDate.dayOfWeek === 0) {
      rejected.push({ line_number: lineNumber, raw, reason: 'sunday' });
      continue;
    }

    const session = extractSession(sessionField);
    if (!session) {
      rejected.push({ line_number: lineNumber, raw, reason: 'bad_session' });
      continue;
    }

    const parsed = parseResultField(resultField);
    if ('error' in parsed) {
      rejected.push({ line_number: lineNumber, raw, reason: parsed.error });
      continue;
    }

    records.push({
      date_et: parsedDate.iso,
      session,
      result_digits: parsed.result,
      fireball: parsed.fireball,
    });
  }

  return { records, rejected };
}
