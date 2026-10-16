// MKT-89 (2026-10-16) — the hard-sell Pro CTA on the same-day verify captions.
// Every rendered verify_midday caption (8 templates × straight/none × board)
// must stay tier-2 clean with the Pro link substituted, carry the link, and
// never leak a literal token when publish-reels has no URL to substitute.
import { buildReelCaption, samedayProCta, PRO_URL_TOKEN, type SamedayCtx } from '../scripts/reel-captions';
import { lintCaption } from '../lib/social/brandLint';

const URL = 'https://www.facebook.com/groups/hitmasterzk';
const sub = (t: string, url: string) => url
  ? t.replace(/\{pro_url\}/g, url)
  : t.replace(/^[^\n]*\{pro_url\}[^\n]*\n\n?/m, ''); // publish-reels' drop rule, verbatim
const DATES = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
const CTXS: (SamedayCtx | null)[] = [
  { elapsed: '7h 51m', straights: 0, straightBoard: null },
  { elapsed: '7h 51m', straights: 1, straightBoard: 'midday' },
  { elapsed: '7h 51m', straights: 1, straightBoard: 'allday' },
  { elapsed: '7h 51m', straights: 2, straightBoard: 'both' },
  null, // fallback
];

describe('MKT-89 same-day verify Pro CTA', () => {
  test('every rendered caption is tier-2 clean, carries the Pro link, ≤ 3 emoji', () => {
    for (const d of DATES) for (const sd of CTXS) {
      const raw = buildReelCaption('verify_midday', d, null, sd);
      const text = sub(raw, URL);
      const bad = lintCaption(text, 2).violations.filter(v => v.blocking);
      expect({ d, sd, bad }).toEqual({ d, sd, bad: [] });
      expect(text).toContain(URL);
      expect(text).not.toContain(PRO_URL_TOKEN);
      if (sd?.straights) expect(text.startsWith('STRAIGHT MATCH')).toBe(true);
    }
  });
  test('no URL → the link line is dropped whole, never a literal token', () => {
    for (const sd of CTXS) {
      const text = sub(buildReelCaption('verify_midday', '2026-10-16', null, sd), '');
      expect(text).not.toContain('{pro_url}');
      expect(text).toContain('$2.49/mo');
    }
  });
  test('the straight-day escalation names the board honestly', () => {
    expect(samedayProCta({ elapsed: '1h', straights: 1, straightBoard: 'midday' })).toMatch(/went up COVERED/);
    expect(samedayProCta({ elapsed: '1h', straights: 1, straightBoard: 'allday' })).toMatch(/in full this morning, for everyone/);
    expect(samedayProCta({ elapsed: '1h', straights: 0, straightBoard: null })).not.toMatch(/exact order/);
    expect(samedayProCta(null)).toContain(PRO_URL_TOKEN);
  });
});
