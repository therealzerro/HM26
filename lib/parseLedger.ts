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
  session: 'midday' | 'evening' | 'morning' | 'night';
  result_digits: string;     // exactly 3 digits e.g. "641"
  comboset_sorted: string;   // e.g. "{1,4,6}"
}

export interface ParseLedgerResult {
  rows: ParsedLedgerRow[];
  skipped: string[];         // human-readable skip reasons
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
};

// States that are explicitly excluded from import *results* by the parser.
// This is a first pass; final exclusion logic will also check the 'drawings' table.
const EXCLUDE_STATES_FROM_PARSING = new Set(['Maryland', 'Puerto Rico']); // Puerto Rico and Maryland (as requested for exclusion)

// ─── Game Validation Map ──────────────────────────────────────────────────────
// Maps jurisdiction → allowed cleaned game names (case-insensitive exact match).
// Rows whose cleaned game does not appear in this list are skipped.
// Jurisdictions absent from this map accept any game name.
const GAME_VALID_MAP: Record<string, ReadonlyArray<string>> = {
  MI: ['Pick 3', 'Daily 3'], // Added common variations
  IN: ['Pick 3', 'Daily 3'],
  GA: ['Cash 3'],
  AR: ['Cash 3'],
  MS: ['Cash 3'], // Mississippi should use Cash 3
  TN: ['Cash 3'],
  CT: ['Play 3'],
  DE: ['Play 3'],
  NY: ['Numbers'],
};

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

function parseSession(gameName: string): 'midday' | 'evening' | 'morning' | 'night' {
  const lower = gameName.toLowerCase();

  // Explicit time like "1:50pm" or "7:50pm"
  const timeMatch = lower.match(/(\d{1,2}):(\d{2})(am|pm)/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    if (timeMatch[3] === 'pm' && h !== 12) h += 12;
    if (timeMatch[3] === 'am' && h === 12) h = 0;
    if (h < 11) return 'morning';
    if (h < 18) return 'midday';
    if (h < 21) return 'evening';
    return 'night';
  }

  // Time like "10am" / "11am"
  if (/\d+(am)/.test(lower)) return 'morning';

  // Morning keyword (must check before midday/day)
  if (/\bmorning\b/.test(lower)) return 'morning';

  // Night keyword (must check before evening)
  if (/\bnight\b/.test(lower)) return 'night';

  // Midday keywords
  if (/\b(midday|day|daytime|d[ií]a)\b/.test(lower)) return 'midday';

  // Evening keywords
  if (/\b(evening|noche)\b/.test(lower)) return 'evening';

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

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseRawLedgerData(text: string): ParseLedgerResult {
  const rows: ParsedLedgerRow[] = [];
  const skipped: string[] = [];

  try {
    if (!text || !text.trim()) return { rows, skipped };

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
      const game = cleanGame(rawGame);

      // Game validation — skip rows whose game name isn't in the allowed list for this jurisdiction
      const validGames = GAME_VALID_MAP[jurisdiction];
      if (validGames) {
        const lower = game.toLowerCase();
        if (!validGames.some(v => v.toLowerCase() === lower)) {
          skipped.push(`Line ${i + 1}: ${jurisdiction} game "${game}" not in allowed list`);
          continue;
        }
      }

      rows.push({
        jurisdiction,
        game,
        date_et,
        session:         parseSession(rawGame), // Session detection remains based on game name keywords/times
        result_digits,
        comboset_sorted: makeComboSet(result_digits),
      });
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

  return { rows: dedupedTriState, skipped };
}
