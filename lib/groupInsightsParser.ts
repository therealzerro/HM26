/**
 * groupInsightsParser — Parses Facebook Group Insights "Contributors" data
 * pasted or uploaded as TSV/CSV. Supports the common export shape:
 *
 *   Contributor    Posts    Comments    Reactions
 *   Jane Doe       4        12          47
 *   John Smith     0        3           8
 *
 * "Reactions" is treated as the likes count. Header detection is best-effort:
 * any header row containing "contributor" (any case) is skipped.
 *
 * For the Pro group, set group_type='pro'; for the Free group, 'free'.
 */

export interface ParsedContributor {
  facebook_name: string;
  posts: number;
  comments: number;
  likes: number;
}

export interface GroupInsightsParseResult {
  contributors: ParsedContributor[];
  warnings: string[];
  errors: string[];
}

function splitColumns(line: string): string[] {
  // Tab is the most reliable signal. Fall back to commas only if no tabs.
  if (line.includes('\t')) {
    return line.split('\t').map(s => s.trim());
  }
  // CSV: simple split. Names with commas (rare in Facebook) would break; we
  // warn rather than try to fully parse CSV escapes.
  return line.split(',').map(s => s.trim());
}

function toIntSafe(raw: string): number | null {
  if (raw === '' || raw == null) return 0;
  const cleaned = raw.replace(/[, ]/g, '');
  if (!/^-?\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

export function parseGroupInsights(rawText: string): GroupInsightsParseResult {
  const result: GroupInsightsParseResult = { contributors: [], warnings: [], errors: [] };
  const seen = new Set<string>();

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('contributor') && (lower.includes('post') || lower.includes('comment') || lower.includes('reaction') || lower.includes('like'))) {
      continue;
    }

    const cols = splitColumns(line);
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
    if (seen.has(key)) {
      result.warnings.push(`Duplicate contributor in input: ${name}`);
      continue;
    }
    seen.add(key);

    result.contributors.push({ facebook_name: name, posts, comments, likes });
  }

  if (result.contributors.length === 0 && lines.length > 0) {
    result.errors.push('No valid contributor rows parsed from input');
  }
  return result;
}
