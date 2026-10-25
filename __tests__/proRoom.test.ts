// MKT-90 (2026-10-16) — THE PRO ROOM SEAL on the session Pro cuts. Every seal
// string is tier 4 (the Pro room is never commercial — MKT-82 F4); midday_pro
// and evening_pro carry the room on chip + stinger and end every caption on
// the room's line; allday_pro carries NONE of it (its body is allday_free's
// full board, SOCIAL-13).
import { lintCaption } from '../lib/social/brandLint';
import { buildReelCaption } from '../scripts/reel-captions';
import { lintProRoomStrings, PRO_ROOM_CAPTION_LINE, PRO_ROOM_STAMP_EYEBROW, PRO_BOARD_BRAND_LINE, SEALED_KINDS, isSealedKind } from '../scripts/pro-room-config';
import { CHIP_LABELS } from '../scripts/intro-chip-config';
import { STINGERS } from '../scripts/stinger-config';

const DATES = Array.from({ length: 12 }, (_, i) => `2026-10-${String(17 + i).padStart(2, '0')}`);
const receipts = { date: '2026-10-16', totalSignals: 18, verifiedCount: 7, straightJx: ['NC'], boxJx: ['IA', 'IN'], verified30d: 90, straightEvents: [{ session: 'midday', jurisdiction: 'NC' }], matchJx: ['IA', 'IN', 'NC'] };

describe('MKT-90 Pro Room seal', () => {
  test('seal strings lint at tier 4 and never sell', () => {
    expect(lintProRoomStrings()).toEqual({ ok: true, problems: [] });
    for (const s of [PRO_ROOM_STAMP_EYEBROW, PRO_BOARD_BRAND_LINE, PRO_ROOM_CAPTION_LINE]) {
      expect(lintCaption(s, 4).violations.filter(v => v.blocking)).toEqual([]);
      expect(/\$|\/mo|upgrade|first[- ]access|inner[- ]circle/i.test(s)).toBe(false);
    }
  });
  test('midday_pro and evening_pro chip PRO ROOM, sting MEMBERS\' BOARD, and end every caption on the room line, tier-4 clean', () => {
    expect([...SEALED_KINDS]).toEqual(['midday_pro', 'evening_pro']);
    for (const k of ['midday_pro', 'evening_pro'] as const) {
      expect(isSealedKind(k)).toBe(true);
      expect(CHIP_LABELS[k].text).toMatch(/^PRO ROOM · /);
      expect(STINGERS[k].lines[1]).toMatch(/MEMBERS' BOARD$/);
      for (const d of DATES) {
        const t = buildReelCaption(k, d, receipts);
        expect(t.endsWith(PRO_ROOM_CAPTION_LINE)).toBe(true);
        const bad = lintCaption(t, 4).violations.filter(v => v.blocking);
        expect({ k, d, bad }).toEqual({ k, d, bad: [] });
      }
    }
  });
  test('allday_pro carries none of it (its body is the free room\'s full board)', () => {
    expect(isSealedKind('allday_pro')).toBe(false);
    expect(CHIP_LABELS.allday_pro.text).toBe('ALL-DAY');
    expect(STINGERS.allday_pro.lines[1]).not.toMatch(/MEMBERS' BOARD/);
    for (const d of DATES) expect(buildReelCaption('allday_pro', d, receipts)).not.toContain(PRO_ROOM_CAPTION_LINE);
  });
});
