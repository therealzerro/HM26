// MKT-87 (2026-10-16) — TRIPLE BOARD SIGNAL: an exact order posted on ALL
// THREE of the day's boards. The law is the posted order (bestOrder), not the
// box set — 10/16 had {3,7,9} on two boards as 9-3-7 / 7-3-9 (no) and 5-7-3 on
// all three as 5-7-3 (yes, the first one). Pro-only on the card; every string
// it adds must pass the tier-4 lint.
import { findTripleBoard, type SocialBriefData } from '../lib/social/socialBrief';
import { parseBoard } from '../lib/social/briefResolve';
import { buildBriefModel, briefModelStrings, BRIEF_COPY } from '../lib/social/briefCopy';
import { lintBrief } from '../lib/social/briefLint';

// The 10/16 boards, verbatim (combo = enumeration index, bestOrder = posted order).
const b = (rows: [string, string, string][]) => parseBoard(rows.map(([combo, bestOrder, comboSet]) => ({ combo, bestOrder, comboSet })));
const boards1016 = {
  allday:  b([['861','816','{1,6,8}'],['896','896','{6,8,9}'],['937','937','{3,7,9}'],['369','396','{3,6,9}'],['987','987','{7,8,9}'],['573','573','{3,5,7}']]),
  evening: b([['943','493','{3,4,9}'],['754','457','{4,5,7}'],['937','739','{3,7,9}'],['369','693','{3,6,9}'],['573','573','{3,5,7}'],['461','461','{1,4,6}']]),
  midday:  b([['861','618','{1,6,8}'],['146','416','{1,4,6}'],['743','473','{3,4,7}'],['317','173','{1,3,7}'],['724','742','{2,4,7}'],['573','573','{3,5,7}']]),
};

describe('findTripleBoard', () => {
  it('10/16: 5-7-3 is the only triple — shared sets with different orders do not count', () => {
    expect(findTripleBoard(boards1016)).toEqual([{ digits: '5-7-3', set: '357', triple: true }]);
  });

  it('a missing board → no signal', () => {
    expect(findTripleBoard({ ...boards1016, midday: [] })).toEqual([]);
  });

  it('two boards sharing an order is not enough', () => {
    const midday = b([['861','618','{1,6,8}'],['573','375','{3,5,7}']]);
    expect(findTripleBoard({ ...boards1016, midday })).toEqual([]);
  });

  it('is deduped and in allday slate order', () => {
    const allday = b([['573','573','{3,5,7}'],['861','816','{1,6,8}'],['573','573','{3,5,7}']]);
    const evening = b([['573','573','{3,5,7}'],['861','816','{1,6,8}']]);
    const midday = b([['861','816','{1,6,8}'],['573','573','{3,5,7}']]);
    expect(findTripleBoard({ allday, evening, midday }).map(t => t.digits)).toEqual(['5-7-3', '8-1-6']);
  });
});

const empty = { resolved: false, live: false, slateHit: false, straight: false, hittingCombos: [], matches: [] };
const data: SocialBriefData = {
  todayLabel: '10/16', yesterdayLabel: '10/15',
  totalSignals: 18, verifiedCount: 3, jurisdictionCount: 5,
  scopes: (['midday', 'evening', 'allday'] as const).map(scope => ({
    scope,
    todaySignals: [{ digits: '8-1-6', set: '168' }, { digits: '5-7-3', set: '357', triple: true }],
    yesterday: empty, today: empty,
  })),
  tripleBoard: [{ digits: '5-7-3', set: '357', triple: true }],
};

describe('TRIPLE BOARD SIGNAL on the brief model', () => {
  it('Pro carries it; free and public never do', () => {
    expect(buildBriefModel(data, 'group', 'pro').triple).toEqual({
      title: BRIEF_COPY.tripleTitle, sub: BRIEF_COPY.tripleSub, line: BRIEF_COPY.tripleLine, digits: ['5-7-3'],
    });
    expect(buildBriefModel(data, 'group', 'free').triple).toBeUndefined();
    expect(buildBriefModel(data, 'public').triple).toBeUndefined();
  });

  it('every triple string is linted and passes tier 4', () => {
    const m = buildBriefModel(data, 'group', 'pro');
    const where = briefModelStrings(m).map(s => s.where);
    expect(where).toEqual(expect.arrayContaining(['triple.title', 'triple.digits', 'triple.sub', 'triple.line']));
    const r = lintBrief(m);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('absent on an ordinary day', () => {
    expect(buildBriefModel({ ...data, tripleBoard: [] }, 'group', 'pro').triple).toBeUndefined();
  });
});
