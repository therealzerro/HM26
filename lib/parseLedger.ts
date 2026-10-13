// ─── parseLedger.ts ───────────────────────────────────────────────────────────
// Parses raw lottery-post style ledger text into structured rows.
//
// Input format:
//   STATE NAME          ← no tabs, must match known state list
//   Game	Date	Result  ← tab-separated, 3 columns
//   Game	Date	Result
//   STATE NAME
//   ...

export interface ParsedLedgerRow {
  jurisdiction: string;      // 2-letter abbreviation or code from DRAWINGS table, or full name
  game: string;              // cleaned game name (no session words)
  date_et: string;           // YYYY-MM-DD
  // Session is collapsed to two buckets only. Morning/night were dropped on
  // 2026-05-17 (BUG-148): the parser previously emitted 4 values, but DE
  // Play 3 Night = DE's evening draw (the source labels it "Night"), and
  // the evening hit-detection filter required session==='evening', so every
  // DE/CT/ID/VA night-labeled hit was silently missed. Source labels like
  // "Pick 3 Morning" or "Play 3 Night" now map to midday/evening here; the
  // genuinely 4-draw states (TX, GA, DC, TN) keep all draws via the wider
  // histories unique key (..., result_digits).
  session: 'midday' | 'evening';
  result_digits: string;     // exactly 3 digits e.g. "641"
  comboset_sorted: string;   // e.g. "{1,4,6}"
}

export interface ParseLedgerResult {
  rows: ParsedLedgerRow[];
  skipped: string[];         // human-readable skip reasons
  // PARSER-HARDEN-01: rows that were KEPT but look wrong (evening-only state
  // with a midday row). Surfaces in the CLI parse report; the wizard may ignore.
  warnings: string[];
}

// ─── State → Abbreviation Map ────────────────────────────────────────────────────
// This map should align with the 'code' column in the 'drawings' table where applicable.
// NOTE: For multi-state drawings like 'ME, NH & VT', the code is 'ME,NH,VT-Midday' etc.
// This parser will initially identify 'ME', 'NH', 'VT' and the application logic
// will need to group them based on the 'drawings' table.
// Similarly, 'W.Canada' might be parsed as 'W.Canada' and then looked up.

const STATE_MAP: Record<string, string> = {
  'Arizona': 'AZ',
  'Arkansas': 'AR',
  'California': 'CA',
  'Colorado': 'CO',
  'Connecticut': 'CT',
  'Delaware': 'DE',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Idaho': 'ID',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA', // Corrected: Explicitly mapped to LA
  // Tri-State Pick 3: Maine, New Hampshire, Vermont share one drawing.
  // Lottery-post style sources list each individually AND emit a separate
  // "Multi-State" header for the same drawing — all four headers map to
  // the same jurisdiction code so they count as ONE row in histories. The
  // dedup at the end of parseRawLedgerData drops the redundant 3 of 4.
  'Maine': 'ME,NH,VT',
  'New Hampshire': 'ME,NH,VT',
  'Vermont': 'ME,NH,VT',
  'Multi-State': 'ME,NH,VT',
  'Multistate': 'ME,NH,VT',
  'Multi State': 'ME,NH,VT',
  'Michigan': 'MI',
  'Minnesota': 'MN',
  'Mississippi': 'MS', // CORRECTED: Mapped to MS instead of MSS
  'Missouri': 'MO',
  'Nebraska': 'NE',    // Mapped NE to Nebraska
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'Ontario': 'ON',
  'Pennsylvania': 'PA',
  'Québec': 'QC',
  'Quebec': 'QC',
  'South Carolina': 'SC',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Virginia': 'VA',
  'Washington': 'WA',
  'Washington D.C.': 'DC',
  'Washington, D.C.': 'DC',
  'West Virginia': 'WV',
  'Western Canada': 'W.Canada', // Mapped to W.Canada code — separate from Multi-State
  'Wisconsin': 'WI',
  // Legacy alternate spellings still supported
  'Maine, New Hampshire & Vermont': 'ME,NH,VT',
  'ME, NH & VT': 'ME,NH,VT',
  // PARSER-HARDEN-01 (2026-10-13): the header the operator's source actually
  // prints for the shared drawing. Missing until the DATA-06 repair, when a
  // paste with this header parsed 0 rows.
  'Tri-State (ME, NH & VT)': 'ME,NH,VT',
  'Tri-State': 'ME,NH,VT',
  'Tri-State Pick 3': 'ME,NH,VT',
  'ME, NH, VT': 'ME,NH,VT',
};

// PARSER-HARDEN-01: jurisdictions whose sessions legitimately hold TWO draws
// each (Morning+Day → midday, Evening+Night → evening). Everything else has
// one draw per session, except an explicitly tagged "Double Draw" bonus drawing
// (NJ Green Ball, MI Red Ball, NC Double Draw — ruled official, DATA-06).
const MULTI_DRAW_PER_SESSION = new Set(['TX', 'GA', 'DC', 'TN']);
// Evening-only jurisdictions as observed in histories (0 midday rows ever). A
// midday row for one of these is the DATA-06 LA/NE class — a header mapped to
// the wrong state — so it is WARNED loudly (kept, not dropped, in case a
// jurisdiction adds a midday draw the way AZ did in June).
const EVENING_ONLY = new Set(['LA', 'NE', 'MN', 'OK', 'QC', 'WA', 'W.Canada', 'WV']);

// States that are explicitly excluded from import *results* by the parser.
// This is a first pass; final exclusion logic will also check the 'drawings' table.
const EXCLUDE_STATES_FROM_PARSING = new Set(['Maryland', 'Puerto Rico']); // Puerto Rico and Maryland (as requested for exclusion)

// ─── Game Validation Map ──────────────────────────────────────────────────────
// Maps jurisdiction → allowed cleaned game names (case-insensitive exact match).
// Rows whose cleaned game does not appear in this list are skipped.
// Jurisdictions absent from this map accept any game name.
// PARSER-HARDEN-01 (2026-10-13): complete, from the one label per jurisdiction
// observed in histories after the DATA-06 cleanup. Matching is on the
// alphanumeric skeleton ("Pick3" / "pick3" / "PICK 3" all match "Pick 3") and the
// row is written with THIS spelling — label variants used to defeat the
// histories unique key (TX "pick3" twins, FL/NY/OH "Pick3" rows). A game that
// is not listed for its jurisdiction is skipped with a visible reason (a stray
// Pick 4 / Cash 4 line, or a new label the operator must add here).
const GAME_VALID_MAP: Record<string, ReadonlyArray<string>> = {
  AR: ['Cash 3'], AZ: ['Pick 3'], CA: ['Daily 3'], CO: ['Pick 3'], CT: ['Play 3'],
  DC: ['DC-3'], DE: ['Play 3'], FL: ['Pick 3'], GA: ['Cash 3'], IA: ['Pick 3'],
  ID: ['Pick 3'], IL: ['Pick 3'], IN: ['Pick 3', 'Daily 3'], KS: ['Pick 3'], KY: ['Pick 3'],
  LA: ['Pick 3'], 'ME,NH,VT': ['Pick 3'], MI: ['Pick 3', 'Daily 3'], MN: ['Pick 3'],
  MO: ['Pick 3'], MS: ['Cash 3'], NC: ['Pick 3'], NE: ['Pick 3'], NJ: ['Pick 3'],
  NM: ['Pick 3'], NY: ['Numbers'], OH: ['Pick 3'], OK: ['Pick 3'], ON: ['Pick 3'],
  PA: ['Pick 3'], QC: ['Quotidienne 3'], SC: ['Pick 3'], TN: ['Cash 3'], TX: ['Pick 3'],
  VA: ['Pick 3'], 'W.Canada': ['Pick 3'], WA: ['Pick 3'], WI: ['Pick 3'], WV: ['Daily 3'],
};
const gameSkeleton = (g: string) => g.toLowerCase().replace(/[^a-z0-9]/g, '');

// ─── Month map ────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

// ─── Date parser ─────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  // "Tue, Apr 14, 2026"  or  "Apr 14, 2026"
  const m = raw.match(
    /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/i
  );
  if (!m) return null;
  const key = m[1].slice(0, 1).toUpperCase() + m[1].slice(1, 3).toLowerCase();
  const month = MONTH_MAP[key];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

// ─── Session detector ─────────────────────────────────────────────────────────

function parseSession(gameName: string): 'midday' | 'evening' {
  // BUG-148 (2026-05-17): collapse to two buckets. "Morning"/"Night" labels
  // were unreliable proxies for draw timing — DE Play 3 Night IS the DE
  // evening draw, just labeled differently by source; the strict evening
  // filter dropped those hits. Now: early-of-day → midday, late-of-day →
  // evening, regardless of source label.
  const lower = gameName.toLowerCase();

  // Explicit time like "1:50pm" or "7:50pm" — anything before 4 PM ET is
  // a midday-bucket draw; anything 4 PM and later is evening-bucket.
  const timeMatch = lower.match(/(\d{1,2}):(\d{2})(am|pm)/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    if (timeMatch[3] === 'pm' && h !== 12) h += 12;
    if (timeMatch[3] === 'am' && h === 12) h = 0;
    return h < 16 ? 'midday' : 'evening';
  }

  // Time like "10am" / "11am" → midday bucket
  if (/\d+(am)/.test(lower)) return 'midday';

  // Morning keyword folds into midday bucket
  if (/\b(morning|midday|day|daytime|d[ií]a)\b/.test(lower)) return 'midday';

  // Night keyword folds into evening bucket
  if (/\b(night|evening|noche)\b/.test(lower)) return 'evening';

  // Default: single daily draw → evening
  return 'evening';
}

// ─── Game name cleaner ────────────────────────────────────────────────────────

const SESSION_STRIP: RegExp[] = [
  /\s+morning$/i,
  /\s+midday$/i,
  /\s+\bday\b$/i,
  /\s+daytime$/i,
  /\s+d[ií]a$/i,
  /\s+evening$/i,
  /\s+night$/i,
  /\s+noche$/i,
  /\s+\d{1,2}:\d{2}(am|pm)$/i,
  /\s+\d{1,2}(am|pm)$/i,
];

function cleanGame(raw: string): string {
  let name = raw.trim();
  for (const re of SESSION_STRIP) {
    name = name.replace(re, '');
  }
  return name.trim();
}

// ─── Result parser ────────────────────────────────────────────────────────────

function parseResult(raw: string): string | null {
  // Discard anything after the first comma: "6-4-1, Fireball: 5" → "6-4-1"
  const before = raw.split(',')[0].trim();
  const digits = before.replace(/[^0-9]/g, '');
  return digits.length === 3 ? digits : null;
}

// ─── ComboSet builder ─────────────────────────────────────────────────────────

function makeComboSet(digits: string): string {
  return `{${digits.split('').sort().join(',')}}`;
}

// ─── Vertical-format normalization ────────────────────────────────────────────
// Some lottery-post exports emit each record as three lines (Game / Date /
// Result) under a state header instead of one tab-separated line. The parser
// treats any no-tab line as a state header, so those files parse to zero rows.
// Fold Game+Date+Result triples into the tab format the parser expects; lines
// already tab-separated (and state headers) pass through untouched.
// Lifted from scripts/imports/import-results.ts (IMPORT-REHAB-01) so every
// ledger path — app screens and CLI — accepts both export shapes.

const DATE_LINE = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/;
const RESULT_LINE = /\d\s*-\s*\d\s*-\s*\d/;

export function normalizeVerticalFormat(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();
    const after = (lines[i + 2] ?? '').trim();
    if (cur && !cur.includes('\t') && DATE_LINE.test(next) && RESULT_LINE.test(after)) {
      out.push(`${cur}\t${next}\t${after}`);
      i += 2;
    } else {
      out.push(lines[i]);
    }
  }
  return out.join('\n');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseRawLedgerData(rawText: string): ParseLedgerResult {
  const rows: ParsedLedgerRow[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  // PARSER-HARDEN-01: rows whose source line is tagged as a Double Draw bonus drawing.
  const doubleDraw = new WeakSet<ParsedLedgerRow>();

  try {
    if (!rawText || !rawText.trim()) return { rows, skipped, warnings };

    // Accept both the tab-separated and vertical (Game/Date/Result triple-line)
    // lottery-post export shapes — normalization is a no-op on tab input.
    const text = normalizeVerticalFormat(rawText);

    // Corrected regex for splitting lines: handles
    const lines = text.split(/\r?\n/);
    let currentAbbr: string | null = null;
    let currentStateFullName: string | null = null; // To store the full name for better context in 'jurisdiction'

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;

      // ── State name detection ──
      // A line is a state header if it has NO tab AND matches STATE_MAP.
      if (!raw.includes('	')) {
        // Check against the explicitly excluded states first
        if (EXCLUDE_STATES_FROM_PARSING.has(trimmed)) {
          currentAbbr = null; // Null out abbreviation to ensure subsequent data rows are skipped
          currentStateFullName = null;
          continue;
        }
        
        // Try to find a match in STATE_MAP
        let matchedFullName: string | null = null;
        for (const [fullName, abbr] of Object.entries(STATE_MAP)) {
          if (fullName.toLowerCase() === trimmed.toLowerCase()) {
            // Found a match, store its abbreviation and full name
            currentAbbr = abbr;
            currentStateFullName = fullName;
            matchedFullName = fullName;
            break;
          }
        }

        if (matchedFullName) {
          // Successfully identified a state/region header
          continue;
        }
        
        // If it's not a known state/region and not excluded, it might be a multi-state group line like "ME, NH & VT"
        // Check if it's a multi-state group from STATE_MAP
        for (const [fullName, abbr] of Object.entries(STATE_MAP)) {
          if (fullName.toLowerCase() === trimmed.toLowerCase() && abbr.includes(',')) { // Heuristic: codes with commas are multi-state groups
            currentAbbr = abbr;
            currentStateFullName = fullName;
            matchedFullName = fullName;
            break;
          }
        }

        if (matchedFullName) {
          // Successfully identified a multi-state group
          continue;
        }

        // Unknown no-tab line — CLEAR currentAbbr so the next data line
        // doesn't get silently mis-attributed to the previous valid state.
        // Defense-in-depth even after Multi-State / Maine / NH / Vermont
        // were added to STATE_MAP: any future unrecognized state header
        // (or page-section label like "Multi-State Lottery") now fails
        // safe by dropping its data lines rather than corrupting another
        // state's row.
        currentAbbr = null;
        currentStateFullName = null;
        continue;
      }

      // ── Data line: needs a current state/region ──
      // If currentAbbr is null, it means we either haven't seen a state name yet,
      // or the last state was explicitly excluded (like PR or MD), so we skip data rows.
      if (!currentAbbr) {
        skipped.push(`Line ${i + 1}: data before any valid state/region — "${trimmed}"`);
        continue;
      }

      // Check if the current state/region is marked for exclusion from import results.
      // This requires querying the DRAWINGS table to get the exclusion status.
      // For now, we will parse it but flag it for later filtering.
      // The actual exclusion logic will be in the commit stage.

      const parts = raw.split('	');
      if (parts.length < 3) {
        skipped.push(`Line ${i + 1}: fewer than 3 tab-columns — "${trimmed}"`);
        continue;
      }

      const rawGame   = parts[0].trim();
      const rawDate   = parts[1].trim();
      const rawResult = parts[2].trim();

      const date_et = parseDate(rawDate);
      if (!date_et) {
        skipped.push(`Line ${i + 1}: unparseable date "${rawDate}"`);
        continue;
      }

      const result_digits = parseResult(rawResult);
      if (!result_digits) {
        skipped.push(`Line ${i + 1}: unparseable result "${rawResult}"`);
        continue;
      }

      // Use the determined abbreviation/code as the primary jurisdiction identifier for now.
      // The application logic will later map this to the full name and check against DRAWINGS.
      const jurisdiction = currentAbbr;
      let game = cleanGame(rawGame);

      // Game validation + canonicalisation (PARSER-HARDEN-01): match on the
      // alphanumeric skeleton, write the canonical spelling from the list.
      const validGames = GAME_VALID_MAP[jurisdiction];
      if (validGames) {
        const skel = gameSkeleton(game);
        const canonical = validGames.find(v => gameSkeleton(v) === skel);
        if (!canonical) {
          skipped.push(`Line ${i + 1}: ${jurisdiction} game "${game}" not in allowed list (${validGames.join(' | ')})`);
          continue;
        }
        game = canonical;
      } else {
        game = game.replace(/\s+/g, ' ').trim();
      }

      const session = parseSession(rawGame); // Session detection remains based on game name keywords/times
      const row: ParsedLedgerRow = {
        jurisdiction,
        game,
        date_et,
        session,
        result_digits,
        comboset_sorted: makeComboSet(result_digits),
      };
      if (/double\s*draw/i.test(rawResult) || /double\s*draw/i.test(rawGame)) doubleDraw.add(row);
      if (EVENING_ONLY.has(jurisdiction) && session === 'midday') {
        warnings.push(`SUSPECT: ${jurisdiction} has never had a midday draw in histories, but "${rawGame}" on ${date_et} (${result_digits}) parsed as midday — KEPT. If ${jurisdiction} did not add a midday draw, the state header above this line is wrong (DATA-06 LA/NE class).`);
      }
      rows.push(row);
    }
  } catch (e: any) {
    // Catch any unexpected errors during parsing
    skipped.push(`Parsing error: ${e.message}`);
  }

  // Michigan midday dedup: keep only the first Pick 3 / Daily 3 midday row per date
  // Use a key that includes game to prevent deduping different games on the same date/session
  const miMiddaySeen = new Set<string>();
  const deduped = rows.filter(row => {
    if (row.jurisdiction !== 'MI' || row.session !== 'midday') return true;
    const key = `${row.date_et}-${row.game}`; // Use date and game for dedup key
    if (!miMiddaySeen.has(key)) {
      miMiddaySeen.add(key);
      return true;
    }
    return false;
  });

  // Tri-State (ME,NH,VT) dedup: Maine, New Hampshire, Vermont, and "Multi-State"
  // all map to the same jurisdiction code (one Pick 3 drawing shared by 3 states).
  // Lottery-post sources list each header separately + a Multi-State header, so
  // the parser emits up to 4 identical rows for the same drawing. Keep the first
  // only, drop the redundant 3.
  const triStateSeen = new Set<string>();
  const dedupedTriState = deduped.filter(row => {
    if (row.jurisdiction !== 'ME,NH,VT') return true;
    const key = `${row.date_et}-${row.game}-${row.session}`;
    if (!triStateSeen.has(key)) {
      triStateSeen.add(key);
      return true;
    }
    return false;
  });

  // PARSER-HARDEN-01: within-batch draw-count guard. One draw per (jurisdiction,
  // date, session) unless the jurisdiction is a known two-draw-per-session state
  // or the extra line is tagged "Double Draw". A second, DIFFERENT result for a
  // one-draw slot is the DATA-06 "two results for one draw" class — the first
  // line wins, the rest are dropped LOUDLY. Identical repeats are dropped quietly
  // (same draw pasted twice).
  const slotRows = new Map<string, ParsedLedgerRow[]>();
  const guarded: ParsedLedgerRow[] = [];
  for (const row of dedupedTriState) {
    const key = `${row.jurisdiction}|${row.date_et}|${row.session}`;
    const prior = slotRows.get(key) ?? [];
    if (prior.some(p => p.result_digits === row.result_digits)) {
      skipped.push(`DUPLICATE: ${row.jurisdiction} ${row.date_et} ${row.session} ${row.result_digits} appears twice in this paste — second copy dropped`);
      continue;
    }
    const allowance = MULTI_DRAW_PER_SESSION.has(row.jurisdiction) ? 2 : 1;
    if (prior.length >= allowance && !doubleDraw.has(row)) {
      skipped.push(`CONFLICT: ${row.jurisdiction} ${row.date_et} ${row.session} already has ${prior.map(p => p.result_digits).join('/')} in this paste; dropped a different result ${row.result_digits}. ${allowance === 1 ? 'One draw per session for this jurisdiction' : 'Two draws per session for this jurisdiction'} — if this is a bonus drawing the line must say "Double Draw"; otherwise check the state header above it.`);
      continue;
    }
    prior.push(row);
    slotRows.set(key, prior);
    guarded.push(row);
  }

  return { rows: guarded, skipped, warnings };
}
