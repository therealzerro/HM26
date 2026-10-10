// MKT-82 F1 (2026-10-10): the yesterday row used a rank-1 BOX test under a
// STRAIGHT MATCH label. These pin the law: straight = result_digits === bestOrder.
import { resolveDraws, matchTag, parseBoard, fmtDigits } from '../lib/social/briefResolve';

const board = parseBoard([
  { comboSet: '{4,5,8}', bestOrder: '485' },
  { comboSet: '{1,6,7}', bestOrder: '716' },
  { comboSet: '{2,3,5}', bestOrder: '325' },
]);

describe('resolveDraws — one law for yesterday and today', () => {
  it('a box-only day renders BOX MATCH, never STRAIGHT MATCH', () => {
    const r = resolveDraws(board, [
      { session: 'midday', comboset_sorted: '{4,5,8}', result_digits: '854' }, // same set, different order
    ], 'midday');
    expect(r.slateHit).toBe(true);
    expect(r.straight).toBe(false);
    expect(matchTag(r)).toBe('BOX MATCH');
    expect(r.hittingCombos).toEqual(['458']);
  });

  it('an exact-order draw renders STRAIGHT MATCH', () => {
    const r = resolveDraws(board, [
      { session: 'evening', comboset_sorted: '{1,6,7}', result_digits: '716' },
    ], 'evening');
    expect(matchTag(r)).toBe('STRAIGHT MATCH');
  });

  it('rank-1 matching in any order is still only a BOX MATCH (the old defect)', () => {
    const r = resolveDraws(board, [
      { session: 'midday', comboset_sorted: '{4,5,8}', result_digits: '548' },
      { session: 'midday', comboset_sorted: '{4,5,8}', result_digits: '845' },
    ], 'midday');
    expect(matchTag(r)).toBe('BOX MATCH');
  });

  it('sessions are isolated; allday sees both and reads live until both drew', () => {
    const draws = [{ session: 'midday', comboset_sorted: '{2,3,5}', result_digits: '325' }];
    expect(matchTag(resolveDraws(board, draws, 'evening'))).toBe('no draws');
    const ad = resolveDraws(board, draws, 'allday');
    expect(ad.live).toBe(true);
    expect(matchTag(ad)).toBe('STRAIGHT MATCH');
  });

  it('10/9 evening: two straights and two boxes are typed per pick, not per row', () => {
    const b = parseBoard([
      { comboSet: '{1,6,8}', bestOrder: '861' }, { comboSet: '{0,1,4}', bestOrder: '104' },
      { comboSet: '{1,6,9}', bestOrder: '691' }, { comboSet: '{1,4,8}', bestOrder: '148' },
    ]);
    const r = resolveDraws(b, [
      { session: 'evening', comboset_sorted: '{1,6,8}', result_digits: '618' },
      { session: 'evening', comboset_sorted: '{1,6,8}', result_digits: '186' },
      { session: 'evening', comboset_sorted: '{0,1,4}', result_digits: '041' },
      { session: 'evening', comboset_sorted: '{1,6,9}', result_digits: '691' },
      { session: 'evening', comboset_sorted: '{1,4,8}', result_digits: '148' },
    ], 'evening');
    expect(matchTag(r)).toBe('STRAIGHT MATCH');
    expect(r.matches.map(m => m.straight)).toEqual([false, false, true, true]);
  });

  it('no match on a resolved session', () => {
    const r = resolveDraws(board, [{ session: 'midday', comboset_sorted: '{0,0,9}', result_digits: '009' }], 'midday');
    expect(matchTag(r)).toBe('no match');
  });

  it('formats digits for display', () => {
    expect(fmtDigits('485')).toBe('4-8-5');
    expect(fmtDigits('4-8-5')).toBe('4-8-5');
  });
});
