/**
 * brandLint — tier-aware caption linter (SOCIAL-01).
 *
 * Encodes the Brand Rehab Skill Brief v2 (2026-05-18) §5 forbidden list and
 * §6 translation table as a mechanical check. The brief's core lesson: the
 * Two-Question filter and vocabulary rules must be MECHANICAL — "intuitive
 * 'this looks professional' judgment fails."
 *
 * Tier semantics (brief §4):
 *  - Tier 1 (public page) + Tier 3 (cross-posts): STRICT — full forbidden list.
 *  - Tier 2 (free group) + Tier 4 (Pro group): opted-in audiences; gambling
 *    vocabulary is allowed. Only universal rules apply (no guarantees, no
 *    hype/urgency, emoji cap).
 *
 * The edge function runs a server-side subset of the Tier-1 list as
 * defense-in-depth; this module is the full engine with suggestions.
 */

export type SocialTier = 1 | 2 | 3 | 4;

export interface LintViolation {
  term: string;          // the matched text
  rule: string;          // which rule fired
  suggestion?: string;   // approved replacement from the translation table
  blocking: boolean;     // blocks publish (vs advisory)
}

export interface LintResult {
  ok: boolean;                 // no blocking violations
  violations: LintViolation[];
  emojiCount: number;
  length: number;
}

/** Forbidden vocabulary for Tier 1/3, with §6 translation-table suggestions. */
const STRICT_VOCAB: { re: RegExp; suggestion: string }[] = [
  { re: /\blottery\b/gi, suggestion: 'numerical pattern analysis / public data' },
  { re: /\blotto\b/gi, suggestion: 'numerical pattern analysis' },
  { re: /\bpick ?3\b/gi, suggestion: '(omit the game name on public posts)' },
  { re: /\bwinning numbers\b/gi, suggestion: 'pattern matches / detected signals' },
  { re: /\bwinners?\b/gi, suggestion: 'members who outperform' },
  { re: /\bwinning\b/gi, suggestion: 'succeeding / outperforming' },
  { re: /\bwon\b/gi, suggestion: 'verified / aligned with observed outcomes' },
  { re: /\bwin\b/gi, suggestion: 'succeed / outperform' },
  { re: /\bdaily picks\b/gi, suggestion: 'daily signals / intelligence reports' },
  { re: /\bhot picks\b/gi, suggestion: 'top signals / top patterns' },
  { re: /\btoday'?s picks\b/gi, suggestion: "today's signals / today's intelligence" },
  { re: /\bpicks?\b/gi, suggestion: 'signals / intelligence reports / data drops' },
  { re: /\bdaily heat\b/gi, suggestion: 'Daily Intelligence / Daily Data Drop' },
  { re: /\bstraight\b/gi, suggestion: 'STRAIGHT MATCH (exact)' },
  { re: /\bbox\b/gi, suggestion: 'BOX MATCH (partial)' },
  { re: /\bplay(s|ed|ing)?\b/gi, suggestion: 'use / engage / apply' },
  { re: /\bgambl(e|ing|er)\b/gi, suggestion: '(remove — no gambling framing)' },
  { re: /\bbet(s|ting)?\b/gi, suggestion: '(remove — no gambling framing)' },
  { re: /\bluck(y)?\b/gi, suggestion: '(remove — data, not luck)' },
  { re: /\bfortune\b/gi, suggestion: '(remove — data, not luck)' },
  { re: /\bjackpot\b/gi, suggestion: '(remove)' },
  { re: /\bpayout\b/gi, suggestion: '(remove)' },
  { re: /\bget rich\b/gi, suggestion: '(remove — no get-rich framing)' },
  { re: /\beasy money\b/gi, suggestion: '(remove — no get-rich framing)' },
];

/** Universal rules — apply to EVERY tier (brief: Tier 2/4 still ban these). */
const UNIVERSAL_VOCAB: { re: RegExp; rule: string; suggestion: string }[] = [
  { re: /\bguaranteed( wins?| results?)?\b/gi, rule: 'no-guarantees', suggestion: '(remove — never imply guaranteed outcomes)' },
  { re: /\bdon'?t miss out\b/gi, rule: 'no-urgency-hype', suggestion: 'calm, measured framing' },
  { re: /\blast chance\b/gi, rule: 'no-urgency-hype', suggestion: 'calm, measured framing' },
  { re: /\bact now\b/gi, rule: 'no-urgency-hype', suggestion: 'calm, measured framing' },
  // Locked vocab law (§4a) — forbidden match labels on EVERY surface. The only
  // approved labels are MATCH / BOX MATCH (box) and STRAIGHT MATCH (exact).
  { re: /\bpartial match\b/gi, rule: 'vocab-law', suggestion: 'BOX MATCH' },
  { re: /\bhits?\b/gi, rule: 'vocab-law', suggestion: 'MATCH / verified match' },
];

/** US state abbreviations — for PUBLIC/cross-post attribution detection (§6). */
const STATE_CODES = new Set([
  'AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IA','KS','KY','LA','MD','MI',
  'MN','MS','MO','NE','NV','NJ','NM','NY','NC','ND','SC','SD','TN','TX','VA','VT',
  'WA','WV','WI','DC',
]);

/** Exported so the tier-4 register rule (constants/socialPlatforms.ts) thins
 *  emoji by the SAME definition this file caps them by — two copies would drift
 *  and the reshaped caption would fail the lint that shaped it. Safe to share:
 *  every consumer uses .match/.replace, which reset lastIndex; a bare .test on a
 *  /g regex would not. */
export const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Session labels paired with numbers are Tier-1 forbidden (brief §5). */
const SESSION_LABEL_RE = /\b(midday|evening|all-?day)\b/gi;

export function lintCaption(caption: string, tier: SocialTier): LintResult {
  const violations: LintViolation[] = [];
  const strict = tier === 1 || tier === 3;

  if (strict) {
    for (const { re, suggestion } of STRICT_VOCAB) {
      re.lastIndex = 0;
      const m = re.exec(caption);
      if (m) violations.push({ term: m[0], rule: 'forbidden-vocab', suggestion, blocking: true });
    }
    // Session labels: advisory on captions (hard-forbidden only when paired
    // with numbers in images; captions should still prefer omitting them).
    SESSION_LABEL_RE.lastIndex = 0;
    const sm = SESSION_LABEL_RE.exec(caption);
    if (sm) violations.push({ term: sm[0], rule: 'session-label', suggestion: 'daytime / nighttime / omit time-of-day', blocking: /\d{3}/.test(caption) });
  }

  for (const { re, rule, suggestion } of UNIVERSAL_VOCAB) {
    re.lastIndex = 0;
    const m = re.exec(caption);
    if (m) violations.push({ term: m[0], rule, suggestion, blocking: true });
  }

  // 3-digit numbers in a Tier-1/3 caption. Pick-formatted digits are blocking;
  // a count in statistical context ("131 verified matches over 30 days") is
  // the brief's sanctioned "clearly statistical" usage → advisory only.
  if (strict) {
    const pickFormatted = caption.match(/\d\s*[-·.]\s*\d\s*[-·.]\s*\d|\{\s*\d\s*,\s*\d\s*,\s*\d\s*\}/);
    if (pickFormatted) {
      violations.push({ term: pickFormatted[0], rule: 'three-digit-number', suggestion: 'no pick-formatted digits on public/cross-post captions', blocking: true });
    } else {
      const standalone = /(?<!\d)(\d{3})(?!\d)(\s*\w?)/.exec(caption);
      if (standalone) {
        const followedByWord = /^\s+[A-Za-z]/.test(caption.slice((standalone.index ?? 0) + 3));
        violations.push({
          term: standalone[1],
          rule: 'three-digit-number',
          suggestion: followedByWord
            ? 'confirm this is a statistical count, not signal data'
            : 'no standalone 3-digit numbers on public/cross-post captions',
          blocking: !followedByWord,
        });
      }
    }

    // §6 PUBLIC discipline (also cross-post to strangers): no pricing, no
    // Pro/upgrade language, no state-code attribution.
    const pricing = caption.match(/\$\s?\d|\/mo\b/i);
    if (pricing) violations.push({ term: pricing[0], rule: 'public-no-pricing', suggestion: 'no pricing on public/cross-post (§6)', blocking: true });
    const proLang = caption.match(/\b(pro tier|pro members?|inner[- ]circle|upgrade)\b/i);
    if (proLang) violations.push({ term: proLang[0], rule: 'public-no-pro-language', suggestion: 'no Pro/upgrade language on public/cross-post (§6)', blocking: true });
    for (const tok of caption.match(/\b[A-Z]{2}\b/g) ?? []) {
      if (STATE_CODES.has(tok)) {
        violations.push({ term: tok, rule: 'public-no-state-code', suggestion: 'no state-code attribution on public/cross-post (§6) — aggregate only', blocking: true });
        break;
      }
    }
  }

  // §6 PRO discipline: NO commercial/pricing on the Pro group (paying members
  // already bought — first-access framing only). FREE is the only surface
  // where pricing is allowed.
  if (tier === 4) {
    const pricing = caption.match(/\$\s?\d|\/mo\b/i);
    if (pricing) violations.push({ term: pricing[0], rule: 'pro-no-pricing', suggestion: 'no pricing on the Pro group (§6) — first-access framing only', blocking: true });
    const upgrade = caption.match(/\bupgrade\b|\bsubscribe now\b/i);
    if (upgrade) violations.push({ term: upgrade[0], rule: 'pro-no-commercial', suggestion: 'no commercial framing on the Pro group (§6)', blocking: true });
  }

  // Emoji cap (brief §5: >3 is too many; quality gate says 1-3)
  const emojiCount = (caption.match(EMOJI_RE) ?? []).length;
  if (emojiCount > 3) {
    violations.push({ term: `${emojiCount} emoji`, rule: 'emoji-cap', suggestion: 'maximum 3 emoji per post', blocking: true });
  }

  // Caps-lock dominance (forbidden tone element)
  const letters = caption.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 30) {
    const upperRatio = (letters.replace(/[^A-Z]/g, '').length) / letters.length;
    if (upperRatio > 0.5) {
      violations.push({ term: 'CAPS-LOCK dominance', rule: 'tone', suggestion: 'sentence case, calm and measured', blocking: false });
    }
  }

  // Length advisory (Facebook optimum ~150-300 chars per the quality gate)
  if (caption.length > 600) {
    violations.push({ term: `${caption.length} chars`, rule: 'length', suggestion: 'Facebook optimum is ~150-300 characters', blocking: false });
  }

  return {
    ok: !violations.some(v => v.blocking),
    violations,
    emojiCount,
    length: caption.length,
  };
}
