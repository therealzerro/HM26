// lib/zk30/txDrawSchedule.ts
//
// TX Pick 3 draw schedule + "next draw in" helper. Drives the countdown chip
// in the ZK30 header (Phase B4 of the UI Evolution work order).
//
// Times are in America/New_York. Texas Lottery's published draw times are
// closer to "approximate" than precise, so these are best-effort anchors
// based on the operator's existing imports. If TX shifts a session, just
// update the entry below — the helper recomputes from scratch each call.

export type TxSession = 'Morning' | 'Day' | 'Evening' | 'Night';

/** Approximate ET draw times. Sourced from observed result_at timestamps on
 *  histories_tx. Verify against Texas Lottery's official schedule if you
 *  want minute-perfect accuracy; for a "next draw in 2h 14m" chip the spec
 *  tolerance is wide. */
export const TX_DRAW_TIMES: Record<TxSession, { hour: number; minute: number }> = {
  Morning: { hour: 10, minute: 0 },
  Day:     { hour: 12, minute: 27 },
  Evening: { hour: 18, minute: 0 },
  Night:   { hour: 22, minute: 12 },
};

const SESSION_ORDER: ReadonlyArray<TxSession> = ['Morning', 'Day', 'Evening', 'Night'];

/** Parse the current wall-clock hour + minute in the America/New_York zone.
 *  DST-safe — uses Intl rather than UTC offsets. */
function nowInET(now: Date): { hour: number; minute: number; dayOfWeek: number } {
  const hour   = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  const minute = parseInt(now.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }), 10);
  // 0 = Sunday, 6 = Saturday — drives Sunday skip (TX has no Pick 3 on Sun).
  const dayOfWeek = parseInt(
    now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) === 'Sun' ? '0' :
    // Workaround: toLocaleString doesn't give us a numeric weekday directly,
    // so we compute via the ET-formatted date string and JS Date parsing.
    (() => {
      const etDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      return String(new Date(etDateStr + 'T12:00:00Z').getUTCDay());
    })(),
    10,
  );
  return { hour, minute, dayOfWeek };
}

export interface NextDraw {
  session: TxSession;
  /** Wall-clock minutes from now until this draw fires. */
  minutesUntil: number;
  /** Convenience: hour portion of minutesUntil. */
  hoursUntil: number;
  /** Convenience: minute portion (0–59) after splitting out hours. */
  minutesUntilRemainder: number;
}

/** Returns the next TX Pick 3 draw from `now`. Skips Sunday entirely (no
 *  Pick 3 on Sun). Returns null only if every session pathologically
 *  computes negative — should never happen in practice. */
export function getNextDraw(now: Date = new Date()): NextDraw | null {
  const { hour, minute, dayOfWeek } = nowInET(now);
  const nowMinutes = hour * 60 + minute;

  // Same-day candidates: any session whose draw time > now.
  if (dayOfWeek !== 0) { // Not Sunday
    for (const session of SESSION_ORDER) {
      const t = TX_DRAW_TIMES[session];
      const drawMinutes = t.hour * 60 + t.minute;
      if (drawMinutes > nowMinutes) {
        const minutesUntil = drawMinutes - nowMinutes;
        return {
          session,
          minutesUntil,
          hoursUntil: Math.floor(minutesUntil / 60),
          minutesUntilRemainder: minutesUntil % 60,
        };
      }
    }
  }

  // No same-day draw left. Walk forward to the next non-Sunday day's Morning.
  // Sunday → next is Monday Morning. Other days → tomorrow Morning.
  let daysAhead = 1;
  let probeDay = (dayOfWeek + 1) % 7;
  while (probeDay === 0) { daysAhead++; probeDay = (probeDay + 1) % 7; }

  const morningMinutes = TX_DRAW_TIMES.Morning.hour * 60 + TX_DRAW_TIMES.Morning.minute;
  // Minutes remaining today (until 24:00) + minutes from midnight to Morning
  // draw on the target day. daysAhead-1 full intervening days × 1440 min.
  const minutesUntil = (24 * 60 - nowMinutes) + (daysAhead - 1) * 24 * 60 + morningMinutes;
  return {
    session: 'Morning',
    minutesUntil,
    hoursUntil: Math.floor(minutesUntil / 60),
    minutesUntilRemainder: minutesUntil % 60,
  };
}

/** Human-readable "2h 14m" / "47m" formatter. */
export function formatTimeUntil(n: NextDraw): string {
  if (n.hoursUntil === 0) return `${n.minutesUntilRemainder}m`;
  return `${n.hoursUntil}h ${n.minutesUntilRemainder}m`;
}
