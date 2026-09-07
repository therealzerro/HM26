/**
 * groupInsightsParser — Parses Facebook Group Insights exports pasted as
 * TSV/CSV. Two things come out of one paste:
 *
 *   1. CONTRIBUTORS (28-day rolling window) — the legacy 4-column shape,
 *      still accepted on its own:
 *
 *        Contributor    Posts    Comments    Reactions
 *        Jane Doe       4        12          47
 *
 *   2. DAILY SERIES (ENH-FUNNEL follow-up 2026-09-07) — the first block of the
 *      full "Group Insights" CSV download, one row per day:
 *
 *        Date,Total Members,Pending Members,Approved Member Requests,
 *        Declined Member Requests,Posts,Comments,Reactions,Active Members
 *
 *      Pasting the WHOLE download is now safe: the parser walks the file by
 *      section header. Before this, every date row parsed as a "contributor"
 *      named 2026-04-21 (the daily block has ≥4 numeric columns) and the
 *      "Popular Days" / "Popular Times" / "Posts" blocks produced warnings.
 *      Those blocks are skipped; the Posts block carries member names and
 *      post text (PII) and is never stored.
 *
 * "Reactions" is treated as the likes count for contributors. Header
 * detection is best-effort and case-insensitive. Cells wrapped in double
 * quotes (the CSV download quotes every cell) are unwrapped (BUG-172).
 *
 * For the Pro group, set group_type='pro'; for the Free group, 'free'.
 */

export interface ParsedContributor {
  facebook_name: string;
  posts: number;
  comments: number;
  likes: number;
}

export interface ParsedGroupDay {
  day: string; // YYYY-MM-DD
  total_members: number | null; // null when Insights reported 0 before the count existed, or when the export has no such column (free group)
  pending_members: number;
  approved_requests: number;
  declined_requests: number;
  posts: number;
  comments: number;
  reactions: number;
  active_members: number; // Pro export "Active Members"; free export "Viewed"
  joined: number | null; // free export "Joined" (new members that day); null on the Pro export
  engaged_members: number | null; // free export "Posted or Commented"; null on the Pro export
}

export interface GroupInsightsParseResult {
  contributors: ParsedContributor[];
  daily: ParsedGroupDay[];
  warnings: string[];
  errors: string[];
}

type Section = 'auto' | 'daily' | 'contributors' | 'skip';

const WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function unquote(cell: string): string {
  return cell.trim().replace(/^"(.*)"$/s, '$1').trim();
}

/** Split one line into cells. Tabs win; otherwise a quote-aware comma split. */
function splitColumns(line: string): string[] {
  if (line.includes('\t')) {
    return line.split('\t').map(unquote);
  }
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // doubled quote inside a quoted cell = literal quote
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(unquote);
}

function toIntSafe(raw: string | undefined): number | null {
  if (raw === undefined || raw === '' || raw == null) return 0;
  const cleaned = raw.replace(/[, ]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

function isAllEmpty(cols: string[]): boolean {
  return cols.every(c => c === '');
}

export function parseGroupInsights(rawText: string): GroupInsightsParseResult {
  const result: GroupInsightsParseResult = { contributors: [], daily: [], warnings: [], errors: [] };
  const seenNames = new Set<string>();
  const seenDays = new Set<string>();

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let section: Section = 'auto';
  let sawHeader = false;
  // Column indices for the daily block, resolved from its header row.
  let dailyIdx: Record<string, number> = {};

  for (const line of lines) {
    const cols = splitColumns(line);
    if (isAllEmpty(cols)) continue;
    const first = cols[0].toLowerCase();
    const lowerAll = cols.map(c => c.toLowerCase());

    // ── Section headers ──────────────────────────────────────────────────
    // Two daily-block shapes exist (2026-09-07): the PRO export has Total
    // Members … Active Members; the FREE export has Joined · Posted or
    // Commented · Viewed. Both start with "Date".
    if (first === 'date' && lowerAll.some(c => c.includes('total members') || c === 'viewed' || c === 'joined')) {
      section = 'daily';
      sawHeader = true;
      dailyIdx = {};
      lowerAll.forEach((c, i) => {
        if (c === 'total members') dailyIdx.total = i;
        else if (c === 'pending members') dailyIdx.pending = i;
        else if (c.startsWith('approved')) dailyIdx.approved = i;
        else if (c.startsWith('declined')) dailyIdx.declined = i;
        else if (c === 'posts') dailyIdx.posts = i;
        else if (c === 'comments') dailyIdx.comments = i;
        else if (c === 'reactions') dailyIdx.reactions = i;
        else if (c === 'active members') dailyIdx.active = i;
        else if (c === 'viewed') dailyIdx.viewed = i;
        else if (c === 'joined') dailyIdx.joined = i;
        else if (c === 'posted or commented') dailyIdx.engaged = i;
      });
      continue;
    }
    // The free group's "Group Insights" download (as opposed to its
    // Growth/Engagement export) ships a daily block that is a bare "Date"
    // header with EMPTY metric columns — nothing to store. Skip it and say so,
    // rather than letting the date rows fall through as 4-column contributors
    // (the pre-2026-09-07 failure: "the in-app import does not understand
    // this data").
    if (first === 'date') {
      section = 'skip';
      sawHeader = true;
      result.warnings.push('Daily block has no metric columns in this export (bare "Date" header) — skipped. The daily series comes from the Growth/Engagement export (Joined · Posted or Commented · Viewed · Posts · Comments · Reactions).');
      continue;
    }
    if (first.includes('contributor') && (lowerAll.some(c => c.includes('post') || c.includes('comment') || c.includes('reaction') || c.includes('like')))) {
      section = 'contributors';
      sawHeader = true;
      continue;
    }
    // Everything else the download carries is skipped and never stored:
    // Popular Days/Times, the Posts block (member names + post text), and the
    // free export's Age Range / Top Cities / country and weekday "Name,Value"
    // tables. A "Name,Value" header is only a section marker when it is the
    // whole header row.
    if (
      first.startsWith('popular ') ||
      (first === 'posts' && lowerAll[1] === 'member') ||
      first === 'age range' ||
      first === 'top cities' ||
      (first === 'name' && lowerAll[1] === 'value' && lowerAll.slice(2).every(c => c === ''))
    ) {
      section = 'skip';
      sawHeader = true;
      continue;
    }

    // ── Rows ─────────────────────────────────────────────────────────────
    if (section === 'skip') continue;

    if (section === 'daily') {
      if (!ISO_DAY.test(cols[0])) {
        // The daily block ends at the first non-date row (usually blanks, already dropped).
        section = 'skip';
        continue;
      }
      const has = (k: string) => dailyIdx[k] !== undefined;
      const get = (k: string) => toIntSafe(has(k) ? cols[dailyIdx[k]] : '0');
      const total = get('total'); const pending = get('pending'); const approved = get('approved'); const declined = get('declined');
      const posts = get('posts'); const comments = get('comments'); const reactions = get('reactions');
      // Pro export: Active Members. Free export: Viewed plays that role.
      const active = has('active') ? get('active') : get('viewed');
      const joined = has('joined') ? get('joined') : null;
      const engaged = has('engaged') ? get('engaged') : null;
      if ([total, pending, approved, declined, posts, comments, reactions, active].some(v => v === null) || (has('joined') && joined === null) || (has('engaged') && engaged === null)) {
        result.warnings.push(`Skipped daily row with non-numeric counts: ${line.slice(0, 80)}`);
        continue;
      }
      // Rows before the group had any activity are all zeros — nothing to store.
      if (total === 0 && posts === 0 && comments === 0 && reactions === 0 && active === 0 && pending === 0 && approved === 0 && declined === 0 && (joined ?? 0) === 0 && (engaged ?? 0) === 0) continue;
      if (seenDays.has(cols[0])) { result.warnings.push(`Duplicate day in input: ${cols[0]}`); continue; }
      seenDays.add(cols[0]);
      result.daily.push({
        day: cols[0],
        // Insights reports 0 members on days before the member count existed (and the
        // free export has no member column at all); store NULL, not 0.
        total_members: has('total') && total !== 0 ? total : null,
        pending_members: pending!, approved_requests: approved!, declined_requests: declined!,
        posts: posts!, comments: comments!, reactions: reactions!, active_members: active!,
        joined, engaged_members: engaged,
      });
      continue;
    }

    // contributors (explicit section) or legacy headerless paste (auto)
    if (section === 'auto') {
      // Guard the legacy path against the daily block pasted without its header.
      if (ISO_DAY.test(cols[0]) || WEEKDAYS.has(first)) continue;
    }
    if (cols.length < 4) {
      result.warnings.push(`Skipped row with <4 columns: ${line.slice(0, 80)}`);
      continue;
    }
    const [name, postsRaw, commentsRaw, likesRaw] = cols;
    if (!name || name.length < 2) {
      result.warnings.push(`Skipped row with empty/short name: ${line.slice(0, 80)}`);
      continue;
    }
    const posts = toIntSafe(postsRaw);
    const comments = toIntSafe(commentsRaw);
    const likes = toIntSafe(likesRaw);
    if (posts === null || comments === null || likes === null) {
      result.warnings.push(`Skipped row with non-numeric counts: ${line.slice(0, 80)}`);
      continue;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      result.warnings.push(`Duplicate contributor in input: ${name}`);
      continue;
    }
    seenNames.add(key);
    result.contributors.push({ facebook_name: name, posts, comments, likes });
  }

  if (result.contributors.length === 0 && result.daily.length === 0 && lines.length > 0) {
    result.errors.push(sawHeader
      ? 'Recognised the export but found no contributor or daily rows'
      : 'No valid contributor rows parsed from input');
  }
  return result;
}
