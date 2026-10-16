// MKT-90 (2026-10-16) — THE PRO ROOM SEAL + THE GUEST PASS. The seal strings
// are tier 4 (the Pro room is never commercial — MKT-82 F4), the guest strings
// tier 2 (the free room; price and the Pro link sanctioned). Every rendered
// Pro caption ends on the room's line; every guest caption opens on the Pro
// link and never leaks a literal token.
import { lintCaption } from '../lib/social/brandLint';
import { buildReelCaption, GUEST_LINK_LEAD } from '../scripts/reel-captions';
import { lintProRoomStrings, PRO_ROOM_CAPTION_LINE, PRO_ROOM_STAMP_EYEBROW, GUEST_STAMP_EYEBROW, guestFurnitureKind, GUEST_KINDS } from '../scripts/pro-room-config';
import { CHIP_LABELS } from '../scripts/intro-chip-config';
import { STINGERS } from '../scripts/stinger-config';
import { ENDCARDS } from '../scripts/endcard-config';
import { REEL_KIND_AUDIENCE } from '../constants/reelKinds';

const URL = 'https://www.facebook.com/groups/hitmasterzk';
const sub = (t: string) => t.replace(/\{pro_url\}/g, URL);
const DATES = Array.from({ length: 12 }, (_, i) => `2026-10-${String(17 + i).padStart(2, '0')}`);
const receipts = { date: '2026-10-16', totalSignals: 18, verifiedCount: 7, straightJx: ['NC'], boxJx: ['IA', 'IN'], verified30d: 90 };

describe('MKT-90 Pro Room seal', () => {
  test('seal, guest and caption strings lint at their tiers', () => {
    expect(lintProRoomStrings()).toEqual({ ok: true, problems: [] });
    expect(lintCaption(PRO_ROOM_STAMP_EYEBROW, 4).violations.filter(v => v.blocking)).toEqual([]);
    expect(lintCaption(GUEST_STAMP_EYEBROW, 2).violations.filter(v => v.blocking)).toEqual([]);
    expect(/\$|\/mo|upgrade|first[- ]access/i.test(PRO_ROOM_CAPTION_LINE + PRO_ROOM_STAMP_EYEBROW)).toBe(false);
  });
  test('every Pro kind chips PRO ROOM, stings MEMBERS\' BOARD, and stays tier-4 clean with the room line', () => {
    for (const k of ['allday_pro', 'midday_pro', 'evening_pro'] as const) {
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
});

describe('MKT-90 Guest pass', () => {
  test('guest kinds are free-audience, chip GUEST PASS, borrow the Pro furniture, and close with the price', () => {
    for (const k of GUEST_KINDS) {
      expect(REEL_KIND_AUDIENCE[k as keyof typeof REEL_KIND_AUDIENCE]).toBe('free');
      expect(CHIP_LABELS[k].text).toMatch(/^GUEST PASS · /);
      expect(guestFurnitureKind(k)).toMatch(/_pro$/);
      expect(ENDCARDS[k].lines[2]).toMatch(/\$2\.49\/MO$/);
      expect(ENDCARDS[k].motion).toBe('endcard_motion_free.mp4');
    }
    expect(ENDCARDS.midday_guest.lines).toEqual(ENDCARDS.evening_guest.lines);
  });
  test('every guest caption opens on the Pro link, is tier-2 clean, ≤ 3 emoji, no token leak', () => {
    for (const k of GUEST_KINDS) for (const d of DATES) {
      const t = sub(buildReelCaption(k as any, d, null));
      expect(t.startsWith(`${GUEST_LINK_LEAD}${URL}`)).toBe(true);
      expect(t).not.toContain('{pro_url}');
      const bad = lintCaption(t, 2).violations.filter(v => v.blocking);
      expect({ k, d, bad }).toEqual({ k, d, bad: [] });
    }
  });
});
