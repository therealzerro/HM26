/**
 * hitToPickItem — the one helper every hit surface routes through to turn an
 * adaptive_tracking-shaped row into a PickItem. Pins the combo-vs-posted-order
 * contract that bit four surfaces (BUG-155, BUG-158, BUG-184, BUG-185):
 *
 *   • adaptive_tracking.combo is the engine ENUMERATION INDEX. It is not
 *     sorted and it is never the order posted on the slate.
 *   • STRAIGHT  → the posted order equals the draw, so hit_result is shown.
 *   • BOX       → posted_order (snapshot bestOrder) is shown when present;
 *                 the enumeration index is the fallback only.
 */
import { hitRowToPickItem, formatHitContext } from '../lib/hitToPickItem';

describe('hitRowToPickItem — posted order contract', () => {
  it('STRAIGHT: shows the draw (hit_result), never the enumeration index', () => {
    // 9/29 evening #? style: combo 168 / posted 861 / KS drew 861 → straight.
    const p = hitRowToPickItem({ combo: '168', combo_set: '{1,6,8}', hit_box: true, hit_straight: true, hit_result: '861', posted_order: '861' });
    expect(p.combo).toBe('861');
    expect(p.bestOrder).toBe('861');
    expect(p.hitType).toBe('straight');
    expect(p.comboSet).toBe('{1,6,8}');
  });

  it('BOX with posted_order: shows the posted order, not combo', () => {
    // 9/30 midday #1: combo 178 / posted 718 / VA drew 178 → box against 718.
    const p = hitRowToPickItem({ combo: '178', hit_box: true, hit_straight: false, hit_result: '178', posted_order: '718' });
    expect(p.combo).toBe('718');
    expect(p.bestOrder).toBe('718');
    expect(p.hitType).toBe('box');
    expect(p.hitResult).toBe('178');
  });

  it('BOX without posted_order: falls back to combo (legacy rows)', () => {
    const p = hitRowToPickItem({ combo: '871', hit_box: true, hit_straight: false, hit_result: '718' });
    expect(p.combo).toBe('871');
    expect(p.bestOrder).toBe('871');
  });

  it('derives comboSet from the enumeration index when combo_set is absent (combo is NOT sorted)', () => {
    const p = hitRowToPickItem({ combo: '871', hit_box: true });
    expect(p.comboSet).toBe('{1,7,8}');
  });

  it('a STRAIGHT row without hit_result degrades to posted_order, then combo', () => {
    expect(hitRowToPickItem({ combo: '178', hit_straight: true, posted_order: '718' }).combo).toBe('718');
    expect(hitRowToPickItem({ combo: '178', hit_straight: true }).combo).toBe('178');
  });

  it('never locks a hit and maps the hit context', () => {
    const p = hitRowToPickItem({ combo: '178', hit_box: true, hit_state: 'VA', hit_session: 'midday', slate_date: '2026-09-30', scope: 'midday' });
    expect(p.locked).toBe(false);
    expect(formatHitContext(p)).toBe('9/30 VA Midday');
  });
});
