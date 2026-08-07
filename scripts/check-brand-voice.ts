/**
 * check-brand-voice.ts — BRAND-01 Phase 5 soft guardrail.
 *
 * Scans the BRAND-01 in-scope consumer-facing file list for forbidden
 * vocabulary that would re-trigger Meta's gambling classifier on screenshot
 * cross-posts. Exits non-zero on a hit. Run before merging copy work.
 *
 * Doctrine:
 *   - CLAUDE.md "Brand voice — public-facing strings"
 *   - assets/HitMaster_Brand_Rehab_Skill_Brief_v2.md (canonical, 2026-05-18)
 *   - MASTER_AUDIT.md BRAND-01 (initial scrub) + BRAND-03 (match-type swap)
 *
 * Usage:
 *   npm run check:brand-voice
 *
 * Exit codes:
 *   0 — zero forbidden phrases in the in-scope file list
 *   1 — one or more findings (regression)
 *
 * Scope:
 *   - Consumer-facing surfaces only (T1–T3 from BRAND-01 inventory).
 *   - Admin/operator surfaces (intelligence, admin*, import-wizard, ledger-import,
 *     components/admin/*) are explicitly EXEMPT — they're internal tools.
 *   - Internal identifiers (function/variable/type names), comments, console.*,
 *     queryKey strings, and the `HitMaster`/`HitMaster ZK6` brand wordmark are
 *     all preserved. The script applies narrow line-level allowlist rules to
 *     skip those without missing real regressions.
 *
 * The forbidden list is HIGH-CONFIDENCE PHRASES, not single ambiguous words.
 * Single words like "hit"/"pick"/"play" appear in legitimate non-display
 * contexts (variable names, queryKey strings, "Play Store") and would
 * generate too many false positives. Phrase-level rules catch the actual
 * gambling-vocab tells.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

// ────────────────────────────────────────────────────────────────────────────
// In-scope files (BRAND-01 T1–T3 inventory)
// ────────────────────────────────────────────────────────────────────────────
const IN_SCOPE: string[] = [
  'app.json',
  'app.config.ts',
  'app/(tabs)/index.tsx',
  'app/(tabs)/explore.tsx',
  'app/(tabs)/results.tsx',
  'app/(tabs)/book.tsx',
  'app/(tabs)/learn.tsx',
  'app/(tabs)/account.tsx',
  'app/track-record.tsx',
  'app/replay.tsx',
  'app/paywall.tsx',
  'app/coming-soon.tsx',
  'app/pattern-explorer.tsx',
  'components/analytics/analyticsShared.tsx',
  'components/analytics/FootprintPanel.tsx',
  'components/analytics/PatternStatsPanel.tsx',
  'components/HitHeroBand.tsx',
  'components/HitBadge.tsx',
  'components/HitCard.tsx',
  'components/HitCelebrationOverlay.tsx',
  'components/HitReplay.tsx',
  'components/LastHitPill.tsx',
  'components/PickCard.tsx',
  'components/PickDetailModal.tsx',
  'components/PickExplainerModal.tsx',
  'components/HeatCheckFAB.tsx',
  'components/HeatCheckModal.tsx',
  'components/DailyRecapCard.tsx',
  'components/BudgetPlanner.tsx',
  'components/MissDayCard.tsx',
  'components/LockedPicksSummary.tsx',
  'components/TrialOfferBanner.tsx',
  'components/SessionFilter.tsx',
  'components/SectionTitle.tsx',
  // MKT-50 (2026-08-07): the social brief is a published member surface (Pro
  // group deliverable) generated from shared code — lint it like consumer UI.
  'components/social/SocialBriefCard.tsx',
  'lib/social/socialBrief.ts',
];

// ────────────────────────────────────────────────────────────────────────────
// Forbidden vocabulary (phrase-level, case-insensitive)
// ────────────────────────────────────────────────────────────────────────────
interface ForbiddenRule {
  pattern: RegExp;
  why: string;
  source: 'CLAUDE.md' | 'v2-brief' | 'BRAND-03' | 'BRAND-05' | 'MKT-03';
}

const FORBIDDEN: ForbiddenRule[] = [
  { pattern: /\blottery\b/i,         why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\blotto\b/i,           why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\bPick 3\b/,           why: 'game-name (drop entirely)',     source: 'CLAUDE.md' },
  { pattern: /\bPick 4\b/,           why: 'game-name (drop entirely)',     source: 'CLAUDE.md' },
  { pattern: /\bwinning numbers\b/i, why: 'gambling outcome phrasing',     source: 'CLAUDE.md' },
  { pattern: /\blucky numbers\b/i,   why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\bdaily picks\b/i,     why: 'replaced by "daily signals"',   source: 'CLAUDE.md' },
  { pattern: /\btoday's picks\b/i,   why: 'replaced by "today\'s signals"',source: 'CLAUDE.md' },
  { pattern: /\bhot picks\b/i,       why: 'replaced by "signal matches"',  source: 'CLAUDE.md' },
  { pattern: /\bDaily Heat\b/,       why: 'feature renamed to Signal Check', source: 'CLAUDE.md' },
  { pattern: /\bHeat Check\b/,       why: 'feature renamed to Signal Check (component names exempt)', source: 'CLAUDE.md' },
  { pattern: /\bplay the numbers\b/i,why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\bgambling\b/i,        why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\bgambler\b/i,         why: 'gambling vocab (1-800 hotline removed per Q5)', source: 'CLAUDE.md' },
  { pattern: /\bjackpot\b/i,         why: 'gambling vocab',                source: 'CLAUDE.md' },
  { pattern: /\bpayout\b/i,          why: 'replaced by tier/win-tier',     source: 'CLAUDE.md' },
  { pattern: /1[- ]?800[- ]?GAMBLER/i, why: 'hotline removed per Q5',      source: 'CLAUDE.md' },
  { pattern: /#Pick3\b/,             why: 'replaced by #DataIntelligence',  source: 'CLAUDE.md' },
  // Match-type vocab (BRAND-04 inversion, 2026-05-26): the prior 5/17 mapping
  // (Straight→Exact, Box→Partial) is RETIRED. The new public vocab is
  //   box match    → "MATCH"
  //   straight match → "STRAIGHT MATCH"
  // and "PARTIAL"/"EXACT" as match-status words are now banned (they were the
  // leak vector on the public redacted reel exports — see BUG-157).
  { pattern: /\bPARTIAL MATCH\b/i,   why: 'use "MATCH" (banned per BRAND-04)', source: 'BRAND-03' },
  { pattern: /\bEXACT MATCH\b/i,     why: 'use "STRAIGHT MATCH" (banned per BRAND-04)', source: 'BRAND-03' },
  { pattern: /\bPartial set\b/i,     why: 'use "Box set" (banned per BRAND-04)', source: 'BRAND-03' },
  { pattern: /\bBox match\b/,        why: 'use "MATCH" in result UI',        source: 'BRAND-03' },
  { pattern: /\bBox Match\b/,        why: 'use "MATCH" in result UI',        source: 'BRAND-03' },
  { pattern: /\bSTRAIGHT HIT\b/,     why: 'use STRAIGHT MATCH in result UI', source: 'BRAND-03' },
  { pattern: /\bBOX HIT\b/,          why: 'use MATCH in result UI',          source: 'BRAND-03' },
  // BRAND-05 (2026-07-23): phrase-level rules missed the 7/23 regressions —
  // bare EXACT/PARTIAL badge strings, a quoted 'HIT' count label, the 🎰
  // emoji, and a hardcoded match-rate % claim. These forms are now banned.
  { pattern: /[⭐🎯]\s*(EXACT|PARTIAL)\b/,        why: 'badge vocab — use STRAIGHT MATCH / MATCH (BRAND-04)', source: 'BRAND-05' },
  { pattern: /["'](Exact|EXACT|Partial|PARTIAL)["']/, why: 'bare match-status literal — use Straight / Box (BRAND-04)', source: 'BRAND-05' },
  // MKT-03 (2026-07-27): lowercase template-embedded status counts slipped past
  // every rule above — PickDetailModal rendered "· ${n} exact" only when a pick
  // had straight resolutions, so it evaded static review AND the badge rules.
  { pattern: /\$\{[^}]*\}\s+(exact|partial)\b/, why: 'template-embedded match-status count — use "straight" / "box" (BRAND-04)', source: 'MKT-03' },
  { pattern: /["']HIT["']/,                       why: 'displayed hit-count label — use MATCH', source: 'BRAND-05' },
  { pattern: /🎰/,                                why: 'slot-machine emoji is gambling imagery', source: 'BRAND-05' },
  { pattern: /\d+(\.\d+)?%\s*match rate/i,        why: 'hardcoded rate claim — provenance-unsound (BUG-162); compute live or omit', source: 'BRAND-05' },
];

// ────────────────────────────────────────────────────────────────────────────
// Line-level allowlist — skip lines matching ANY of these (narrow + explicit).
// Each entry needs a comment explaining WHY it's allowlisted.
// ────────────────────────────────────────────────────────────────────────────
const LINE_ALLOWLIST: { match: RegExp; reason: string }[] = [
  // Component file/import names preserved per BRAND-01 internal-identifier carve-out.
  { match: /from ['"].*HeatCheck/,      reason: 'HeatCheck* component import (internal name preserved)' },
  { match: /<HeatCheck(FAB|Modal)\b/,   reason: 'HeatCheck* JSX usage (internal component)' },
  // Single-line comments and JSDoc lines never render to users.
  { match: /^\s*\/\//,                  reason: 'single-line comment' },
  { match: /^\s*\*/,                    reason: 'JSDoc / block-comment continuation' },
  // queryKey strings are internal cache keys, not displayed.
  { match: /queryKey:/,                 reason: 'react-query cache key (not displayed)' },
];

// ────────────────────────────────────────────────────────────────────────────
// Scanner
// ────────────────────────────────────────────────────────────────────────────
interface Finding {
  file: string;
  line: number;
  text: string;
  rule: ForbiddenRule;
}

function scanFile(rel: string): Finding[] {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return [];
  const findings: Finding[] = [];
  const lines = readFileSync(abs, 'utf8').split('\n');
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track /* ... */ block comments across lines so banner comments don't trip the lint.
    let codeOnly = line;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end === -1) continue; // entire line is comment
      codeOnly = line.slice(end + 2);
      inBlockComment = false;
    }
    // Strip any /* ... */ openings that don't close on the same line.
    const open = codeOnly.indexOf('/*');
    if (open !== -1) {
      const close = codeOnly.indexOf('*/', open + 2);
      if (close === -1) {
        codeOnly = codeOnly.slice(0, open);
        inBlockComment = true;
      } else {
        codeOnly = codeOnly.slice(0, open) + codeOnly.slice(close + 2);
      }
    }
    if (!codeOnly.trim()) continue;
    if (LINE_ALLOWLIST.some((a) => a.match.test(codeOnly))) continue;
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(codeOnly)) {
        findings.push({ file: rel, line: i + 1, text: codeOnly.trim(), rule });
      }
    }
  }
  return findings;
}

const allFindings: Finding[] = [];
const missing: string[] = [];

for (const rel of IN_SCOPE) {
  if (!existsSync(join(ROOT, rel))) {
    missing.push(rel);
    continue;
  }
  allFindings.push(...scanFile(rel));
}

// ────────────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────────────
if (missing.length) {
  console.warn('[check-brand-voice] in-scope files not found (update IN_SCOPE if intentional):');
  for (const m of missing) console.warn('  -', m);
  console.warn('');
}

if (allFindings.length === 0) {
  console.log(`[check-brand-voice] ✅ ${IN_SCOPE.length - missing.length} files scanned, 0 forbidden-vocab findings.`);
  process.exit(0);
}

console.error(`[check-brand-voice] ❌ ${allFindings.length} finding(s):\n`);
for (const f of allFindings) {
  const match = f.rule.pattern.exec(f.text);
  const hit = match ? match[0] : '?';
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    rule: "${hit}" — ${f.rule.why} [${f.rule.source}]`);
  console.error(`    line: ${f.text.length > 140 ? f.text.slice(0, 137) + '...' : f.text}`);
  console.error('');
}
console.error(`See CLAUDE.md "Brand voice — public-facing strings" + assets/HitMaster_Brand_Rehab_Skill_Brief_v2.md.`);
console.error(`If a finding is a legitimate carve-out, add a narrow LINE_ALLOWLIST entry with a documented reason.`);
process.exit(1);
