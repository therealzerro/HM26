// lib/zk30/parseTxRaw.ts
//
// Pure parser for the TX Pick 3 raw-draws paste format. No I/O, no Supabase —
// the CLI importer (scripts/imports/import_tx_raw.ts) and the future admin-UI
// daily import path both call this and share its validation rules.
//
// Expected line shape (tab-separated, 4 fields):
//   Wed, May 21, 2025\tTX Morning\t1-2-7\t4
//   Wed, May 21, 2025\tTX Day\t8-0-3\t9
//   ...
//
// Tolerates:
//   • CRLF + LF line endings
//   • blank lines (skipped silently)
//   • trailing .,; on the line as a whole (paste artifacts)
//   • session prefix variations — only the trailing token matters
//     (Morning|Day|Evening|Night)
//   • dashed or undashed result strings (1-2-7 or 127)
//   • missing fireball field treated as null
//
// Rejects (with structured reason, not by throwing):
//   • lines with < 3 or > 4 tab fields      → reason='field_count'
//     (3 = no fireball, 4 = with fireball; both valid per spec)
//   • date that doesn't match "%a, %b %d, %Y" → reason='bad_date'
//   • Sunday draws (TX has no Sunday Pick 3) → reason='sunday'
//   • session not ending in M/D/E/N         → reason='bad_session'
//   • result not exactly 3 digits           → reason='bad_result'
//   • fireball present but not a single digit → reason='bad_fireball'

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
const RESULT_RE = /^\d-\d-\d$|^\d{3}$/;
const FIREBALL_RE = /^\d$/;

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

// Session token is the trailing whitespace-delimited word. "TX Morning" → "Morning",
// "Texas Day" → "Day", "Morning" → "Morning". Returns null if no valid token tails.
function extractSession(field: string): TxSession | null {
  const trimmed = field.trim();
  if (!trimmed) return null;
  const tail = trimmed.split(/\s+/).pop();
  if (!tail) return null;
  return SESSIONS.has(tail as TxSession) ? (tail as TxSession) : null;
}

function normalizeResult(field: string): string | null {
  const trimmed = field.trim();
  if (!RESULT_RE.test(trimmed)) return null;
  const stripped = trimmed.replace(/-/g, '');
  return stripped.length === 3 ? stripped : null;
}

function normalizeFireball(field: string | undefined): string | null | 'invalid' {
  if (field === undefined) return null;
  const trimmed = field.trim();
  if (!trimmed) return null;
  return FIREBALL_RE.test(trimmed) ? trimmed : 'invalid';
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

    const [dateField, sessionField, resultField, fireballField] = fields;

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

    const result_digits = normalizeResult(resultField);
    if (!result_digits) {
      rejected.push({ line_number: lineNumber, raw, reason: 'bad_result' });
      continue;
    }

    const fireball = normalizeFireball(fireballField);
    if (fireball === 'invalid') {
      rejected.push({ line_number: lineNumber, raw, reason: 'bad_fireball' });
      continue;
    }

    records.push({
      date_et: parsedDate.iso,
      session,
      result_digits,
      fireball,
    });
  }

  return { records, rejected };
}
