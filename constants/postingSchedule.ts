// Daily posting schedule v1 (operator, 2026-08-02) — STRUCTURED MIRROR of
// assets/marketing/POSTING_SCHEDULE.txt, which remains canonical for the
// reasoning prose. This module is the ONE data source for both renderings:
// the captions PDF's page-1 schedule card (scripts/render-captions-pdf.ts)
// and the Admin → Reels panel (components/admin/ReelsView.tsx). When the
// schedule changes, update the txt and this file together — nothing else.
//
// Kinds are plain strings (not ReelKind) so this stays importable from both
// the RN app and node-side scripts without dragging either's dependencies.

export interface ScheduleSession {
  /** Wall-clock ET, e.g. "8:30 AM". All times in this system are Eastern. */
  time: string;
  title: string;
  /** Reel kinds in POSTING ORDER — order is load-bearing (brand line / contrast pair). */
  kinds: string[];
  /** One short operational line. Prose reasoning lives in POSTING_SCHEDULE.txt. */
  note?: string;
  /** Hard deadline, rendered prominently. */
  deadline?: string;
}

export const POSTING_SESSIONS: ScheduleSession[] = [
  {
    time: '8:30 AM', title: 'Morning stack',
    kinds: ['allday_pro', 'midday_pro', 'verify'],
    note: 'Boards first, receipts after — the order is the brand line. verify posts twice: Pro room (full precision), then Free room (qualitative).',
  },
  {
    time: '10:30 AM', title: 'Free contrast pair',
    kinds: ['allday_free', 'midday_free'],
    note: 'Back to back, THIS order — the full board, then the covered one.',
    deadline: 'midday_free live before ~12:30 PM ET',
  },
  {
    time: '4:30 PM', title: 'Same-day midday verify',
    kinds: ['verify_midday'],
    note: 'CONDITIONAL + MANUAL (MKT-62): only on days the midday ledger is imported and graded in time — npm run reel:verify-midday, never reel:daily. Free room; Pro at the operator\'s call. The highest-conversion slot in the system.',
  },
  {
    time: '5:30 PM', title: 'Evening pair',
    kinds: ['evening_pro', 'evening_free'],
    deadline: 'live before ~6:30 PM ET — some jurisdictions cut early',
  },
  {
    time: '7:00 PM', title: 'Public',
    kinds: ['allday_public', 'verify_public'],
    note: 'ONE cut, ALTERNATING daily — never both. No deadline; posts when strangers scroll.',
  },
];

export const SCHEDULE_SKIP_ORDER =
  'If a session must drop: ① Public  ② Free All-Day  ③ Verify — NEVER a board ahead of its own draw.';

/** Position of a kind in the day's posting order; unscheduled kinds sort last. */
export function postingOrder(kind: string): number {
  let i = 0;
  for (const s of POSTING_SESSIONS) {
    for (const k of s.kinds) {
      if (k === kind) return i;
      i++;
    }
  }
  return 999;
}
