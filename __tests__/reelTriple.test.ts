// MKT-88 (2026-10-16) — TRIPLE BOARD SIGNAL ON THE SLATE REELS. The tile
// burns; the law (findTripleBoard) is shared with the Pro brief through
// lib/social/briefResolve.ts. Operator rule under test: yellow / gold is
// reserved for a STRAIGHT MATCH that was DRAWN — nothing in the fire palette
// may read as gold (hue ≤ 28°). Copy must pass tier 2 (allday's full body is
// the free group's too) and tier 4.
import { lintStrings } from '../lib/social/briefLint';
import { lintCaption } from '../lib/social/brandLint';
import { findTripleBoard } from '../lib/social/socialBrief';
import { findTripleBoard as law } from '../lib/social/briefResolve';
import {
  FIRE, FIRE_PATTERN, FIRE_PHASES, FIRE_STEP_FRAMES, TRIPLE_FIRE_COPY,
  firePhaseAt, hexHue, parseTripleTag, tripleForScope, tripleRankMap, tripleTagValue, tripleKey, NO_TRIPLE,
  TRIPLE_CAPTION, TRIPLE_RING, tripleCaptionLine,
} from '../scripts/reel-triple-core';

const board = (orders: string[]) => orders.map(o => ({ comboSet: o.split('').sort().join(''), bestOrder: o }));
const DAY_1016 = {
  midday: board(['618', '416', '473', '173', '742', '573']),
  evening: board(['493', '457', '739', '693', '573', '461']),
  allday: board(['816', '896', '937', '396', '987', '573']),
};

describe('the law is shared (socialBrief re-exports briefResolve)', () => {
  it('is the same function', () => { expect(findTripleBoard).toBe(law); });
  it('10/16: 5-7-3 is the triple; {3,7,9} as 9-3-7 / 7-3-9 is not', () => {
    expect(law(DAY_1016).map(t => t.digits)).toEqual(['5-7-3']);
  });
});

describe('fire palette — never gold', () => {
  it('every FIRE hex has hue ≤ 28° (gold/amber/yellow start past ~35°)', () => {
    for (const [k, v] of Object.entries(FIRE)) {
      if (!v.startsWith('#')) continue;
      const h = hexHue(v);
      const hue = h > 180 ? h - 360 : h;   // deep red wraps (351° → −9°)
      expect({ k, hue }).toEqual({ k, hue: expect.any(Number) });
      expect(hue).toBeLessThanOrEqual(28);
    }
  });
  it('hexHue sanity: gold is far outside the band', () => {
    expect(hexHue('#FBBF24')).toBeGreaterThan(40);   // the verify stamps' GOLD
    expect(hexHue('#FFD700')).toBeGreaterThan(40);
    expect(hexHue('#FF2A00')).toBeCloseTo(10, 0);
  });
});

describe('copy', () => {
  const strings = Object.entries(TRIPLE_FIRE_COPY).map(([where, text]) => ({ where, text }));
  it('passes tier 2 (free group sees the allday body) and tier 4', () => {
    expect(lintStrings(2, strings).ok).toBe(true);
    expect(lintStrings(4, strings).ok).toBe(true);
  });
  it('carries no likelihood word and no count-led hook', () => {
    for (const { text } of strings) expect(text).not.toMatch(/likel|probab|edge|hot|overdue|trend|win|lotto|lottery/i);
  });
  it('the tile badge carries no digit (it rides the redacted cuts, whose observer masks digits)', () => {
    expect(TRIPLE_FIRE_COPY.tileBadge).not.toMatch(/\d/);
  });
});

describe('caption line (operator 10/16)', () => {
  it('Pro kinds + allday_free name the digits; redacted free session kinds tease; public gets nothing', () => {
    expect(tripleCaptionLine('allday_pro', ['5-7-3'])).toBe(TRIPLE_CAPTION.withDigits(['5-7-3']));
    expect(tripleCaptionLine('midday_pro', ['5-7-3'])).toContain('5-7-3');
    expect(tripleCaptionLine('evening_pro', ['5-7-3', '1-2-3'])).toContain('5-7-3 and 1-2-3 are');
    expect(tripleCaptionLine('allday_free', ['5-7-3'])).toContain('5-7-3');
    expect(tripleCaptionLine('midday_free', [TRIPLE_RING])).toBe(TRIPLE_CAPTION.tease);
    expect(tripleCaptionLine('evening_free', [TRIPLE_RING])).toBe(TRIPLE_CAPTION.tease);
    expect(tripleCaptionLine('evening_free', ['5-7-3'])).toBe(TRIPLE_CAPTION.tease);   // never the digits on a free session cut
    expect(tripleCaptionLine('allday_public', ['5-7-3'])).toBeNull();
    expect(tripleCaptionLine('verify', ['5-7-3'])).toBeNull();
    expect(tripleCaptionLine('allday_pro', [])).toBeNull();
    expect(tripleCaptionLine('allday_pro', [TRIPLE_RING])).toBeNull();   // a ring tag on a full kind names nothing
  });
  it('passes the universal caption lint at the tier it ships on', () => {
    const blocking = (t: string, tier: 2 | 4) => lintCaption(t, tier).violations.filter(v => v.blocking).map(v => v.rule);
    expect(blocking(TRIPLE_CAPTION.withDigits(['5-7-3']), 4)).toEqual([]);
    expect(blocking(TRIPLE_CAPTION.withDigits(['5-7-3']), 2)).toEqual([]);
    expect(blocking(TRIPLE_CAPTION.tease, 2)).toEqual([]);
    expect(TRIPLE_CAPTION.tease).not.toMatch(/\d/);
  });
});

describe('flicker', () => {
  it('phases stay in range and the pattern is irregular (not a plain loop)', () => {
    for (let f = 0; f < 1200; f++) { const p = firePhaseAt(f); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(FIRE_PHASES); }
    const loop = FIRE_PATTERN.every((p, i) => p === i % FIRE_PHASES);
    expect(loop).toBe(false);
    expect(new Set(FIRE_PATTERN).size).toBe(FIRE_PHASES);
  });
  it('holds each phase for FIRE_STEP_FRAMES frames and never the same phase twice in a row', () => {
    for (let s = 0; s < FIRE_PATTERN.length - 1; s++) expect(FIRE_PATTERN[s]).not.toBe(FIRE_PATTERN[s + 1]);
    expect(firePhaseAt(0)).toBe(firePhaseAt(FIRE_STEP_FRAMES - 1));
    expect(firePhaseAt(FIRE_STEP_FRAMES)).toBe(FIRE_PATTERN[1]);
  });
});

describe('ranks per scope', () => {
  it('10/16: allday #6, midday #6, evening #5 — all burn 5-7-3', () => {
    const raw = { midday: DAY_1016.midday, evening: DAY_1016.evening, allday: DAY_1016.allday };
    expect(tripleForScope(raw, 'allday').ranks).toEqual([6]);
    expect(tripleForScope(raw, 'midday').ranks).toEqual([6]);
    const eve = tripleForScope(raw, 'evening');
    expect(eve.ranks).toEqual([5]);
    expect(eve.byRank.get(5)).toBe('5-7-3');
    expect(tripleKey('5-7-3')).toBe('573');
  });
  it('a missing board → no triple, no ranks (and JSON strings parse)', () => {
    expect(tripleForScope({ midday: DAY_1016.midday, allday: DAY_1016.allday }, 'allday')).toMatchObject({ triples: [], ranks: [] });
    const raw = { midday: JSON.stringify(DAY_1016.midday), evening: JSON.stringify(DAY_1016.evening), allday: JSON.stringify(DAY_1016.allday) };
    expect(tripleForScope(raw, 'allday').ranks).toEqual([6]);
    expect(NO_TRIPLE.ranks).toEqual([]);
  });
  it('two triples map to two ranks', () => {
    const b = board(['123', '573', '999', '321', '111', '000']);
    const m = tripleRankMap(b, [{ digits: '5-7-3' }, { digits: '3-2-1' }]);
    expect(Array.from(m.entries())).toEqual([[2, '5-7-3'], [4, '3-2-1']]);
  });
});

describe('container tag', () => {
  it('round-trips, joins with |, and rejects junk', () => {
    expect(tripleTagValue([])).toBeNull();
    expect(tripleTagValue([{ digits: '5-7-3' }])).toBe('5-7-3');
    expect(tripleTagValue([{ digits: '5-7-3' }, { digits: '1-2-3' }])).toBe('5-7-3|1-2-3');
    expect(parseTripleTag('5-7-3|1-2-3')).toEqual(['5-7-3', '1-2-3']);
    expect(parseTripleTag('573')).toEqual([]);
    expect(parseTripleTag('ring')).toEqual(['ring']);
    expect(parseTripleTag('ring|5-7-3')).toEqual([]);
    expect(parseTripleTag('')).toEqual([]);
    expect(parseTripleTag('5-7-3|x')).toEqual([]);
  });
});
