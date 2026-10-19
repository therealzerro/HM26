// MKT-91 (2026-10-19) — THE PUBLIC RECEIPTS FLOOR. Operator ruling: "in the
// verify public and allday public reels, only assemble if yesterday's board
// had 3 or more verified signals. 2 or less — do not assemble." The two
// assemblers read the decision from publicReceiptsGate; this pins the floor
// so a drift in either assembler's inline check cannot quietly re-admit a
// 2-of-6 day onto the page.
import { PUBLIC_MIN_VERIFIED, PUBLIC_RECEIPTS_GATE_KINDS, publicReceiptsGate } from '../scripts/public-hook-config';

describe('MKT-91 public receipts floor', () => {
  test('the floor is three verified signals', () => {
    expect(PUBLIC_MIN_VERIFIED).toBe(3);
  });
  test('the gate covers exactly the two public cuts that open on yesterday\'s board', () => {
    expect([...PUBLIC_RECEIPTS_GATE_KINDS].sort()).toEqual(['allday_public', 'verify_public']);
  });
  test('0, 1 and 2 of 6 do not build', () => {
    for (const n of [0, 1, 2]) {
      const g = publicReceiptsGate(n, 6);
      expect(g.ok).toBe(false);
      expect(g.why).toContain(`verified ${n} of 6`);
    }
  });
  test('3 of 6 and above build', () => {
    for (const n of [3, 4, 5, 6]) expect(publicReceiptsGate(n, 6).ok).toBe(true);
  });
  test('a missing count is below the floor (fail-closed)', () => {
    expect(publicReceiptsGate(null).ok).toBe(false);
    expect(publicReceiptsGate(undefined).ok).toBe(false);
    expect(publicReceiptsGate(NaN, 6).ok).toBe(false);
    expect(publicReceiptsGate(null).why).toMatch(/no verified count/);
  });
  test('the reason names the count the viewer would have seen', () => {
    expect(publicReceiptsGate(2, 6).why).toBe("yesterday's All-Day board verified 2 of 6 — below the floor of 3");
    expect(publicReceiptsGate(4, 6).why).toBe("yesterday's All-Day board verified 4 of 6 ≥ 3");
  });
});
