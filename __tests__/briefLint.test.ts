// MKT-82 1.5 (2026-10-10): the brief does not render if it fails. The three
// live variants must PASS; the strings Phase 1 removed must BLOCK.
import { buildBriefModel, briefModelStrings, BRIEF_FOOTER_LINE } from '../lib/social/briefCopy';
import { lintBrief, BRIEF_RULES } from '../lib/social/briefLint';
import { lintCaption } from '../lib/social/brandLint';
import type { SocialBriefData } from '../lib/social/socialBrief';

const data: SocialBriefData = {
  todayLabel: '10/10', yesterdayLabel: '10/9',
  totalSignals: 18, verifiedCount: 3, jurisdictionCount: 5,
  scopes: [
    { scope: 'midday', todaySignals: [{ digits: '4-8-5', set: '458' }, { digits: '7-1-6', set: '167' }],
      yesterday: { resolved: true, live: false, slateHit: true, straight: false, hittingCombos: ['458'], matches: [{ set: '458', bestOrder: '485', straight: false }] },
      today: { resolved: true, live: false, slateHit: true, straight: true, hittingCombos: ['167'], matches: [{ set: '167', bestOrder: '716', straight: true }] } },
    { scope: 'evening', todaySignals: [{ digits: '3-2-5', set: '235' }],
      yesterday: { resolved: true, live: false, slateHit: false, straight: false, hittingCombos: [], matches: [] },
      today: { resolved: false, live: false, slateHit: false, straight: false, hittingCombos: [], matches: [] } },
    { scope: 'allday', todaySignals: [{ digits: '0-5-9', set: '059' }],
      yesterday: { resolved: true, live: false, slateHit: true, straight: true, hittingCombos: ['059'], matches: [{ set: '059', bestOrder: '059', straight: true }] },
      today: { resolved: true, live: true, slateHit: false, straight: false, hittingCombos: [], matches: [] } },
  ],
};

describe('lintBrief — live variants pass', () => {
  it.each([
    ['public', undefined, 1],
    ['group', 'free', 2],
    ['group', 'pro', 4],
  ] as const)('%s/%s passes at tier %d', (variant, groupTier, tier) => {
    const r = lintBrief(buildBriefModel(data, variant, groupTier));
    expect(r.tier).toBe(tier);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('R1 footer line passes tier 4 verbatim', () => {
    expect(lintCaption(BRIEF_FOOTER_LINE, 4).violations.filter(v => v.blocking)).toEqual([]);
    const m = buildBriefModel(data, 'group', 'pro');
    expect(briefModelStrings(m).some(s => s.text === BRIEF_FOOTER_LINE)).toBe(true);
  });

  it('member tiers say Midday/Evening/All-Day; public says nothing session-wise', () => {
    const pro = briefModelStrings(buildBriefModel(data, 'group', 'pro')).map(s => s.text).join('\n');
    expect(pro).toMatch(/MIDDAY/); expect(pro).toMatch(/ALL-DAY/); expect(pro).not.toMatch(/Daytime|Continuous/);
    const pub = briefModelStrings(buildBriefModel(data, 'public')).map(s => s.text).join('\n');
    expect(pub).not.toMatch(/\d-\d-\d/);
  });

  it('F1: yesterday box-only row reads BOX MATCH, exact-order reads STRAIGHT MATCH', () => {
    const rows = buildBriefModel(data, 'group', 'pro').yesterdayRows!;
    expect(rows[0].tag).toBe('BOX MATCH');
    expect(rows[1].tag).toBe('no match');
    expect(rows[2].tag).toBe('STRAIGHT MATCH');
    // chips carry their own type: box = set in braces, straight = exact order
    expect(rows[0].chips).toEqual([{ text: '{4,5,8}', straight: false }]);
    expect(rows[2].chips).toEqual([{ text: '0-5-9', straight: true }]);
  });
});

describe('lintBrief — the removed strings block', () => {
  const removed = [
    ['Intelligence is your edge. Use it.', 4],
    ['First access — inner circle 💎', 4],
    ['125 · 30d', 2],
    ['142 verified · 30d', 4],
    ['WHERE THE MODEL CONCENTRATES', 4],
    ['ALL STATES · ANY ORDER · 3-DAY WINDOW', 4],
    ['CONTINUOUS + DAYTIME · 90-DAY ACTIVITY 12', 4],
    ['The model concentrates on 1–2 combinations and carries them up to 3 days; a match closes that leg.', 4],
    ['Daytime structure: ranks 1–2 in the Daytime session have underperformed ranks 3–5 — a pattern confirmed four separate times. The combinations above already reflect that exclusion.', 4],
    ['these signals are ranked to maximise match probability. They are not ranked for profitability, and no analysis changes the underlying odds.', 4],
    ['Ranked by the engine, posted before the draw, graded the same day across 42 states & provinces. No ranking changes the odds.', 4],
    ['Pro members see it first ⚡', 4],
  ] as const;
  it.each(removed)('"%s" blocks at tier %d', (text, tier) => {
    const caption = lintCaption(text, tier).violations.some(v => v.blocking);
    const brief = BRIEF_RULES.some(b => (!b.tiers || b.tiers.includes(tier)) && (b.re.lastIndex = 0, b.re.test(text)));
    expect(caption || brief).toBe(true);
  });
  it('the free CTA is legal on tier 2', () => {
    const text = 'Pro members see it first ⚡';
    expect(lintCaption(text, 2).violations.some(v => v.blocking)).toBe(false);
    expect(BRIEF_RULES.some(b => (!b.tiers || b.tiers.includes(2)) && (b.re.lastIndex = 0, b.re.test(text)))).toBe(false);
  });
});
