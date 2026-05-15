import React, { useMemo } from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { ZK6_ENGINE_VERSION } from '@/constants/zk6';
import { getTodayET } from '@/lib/dateUtils';

/**
 * Shared engine freshness line (design.md step 5).
 *
 * One subscriber-voice line for "when did this slate refresh." Replaces:
 *   - Home's inline `engineFreshness` subtitle
 *   - Slate's operator-style `statusStrip` (🟢 LIVE · time · ago · #hash)
 *
 * Three rendered states (auto-derived from snapshot):
 *   - fresh:  `ZK6 v2.0 · slate generated 11:43 AM ET`
 *   - stale:  `🟡 Engine inputs last refreshed 2h ago` (yellow tint)
 *   - empty:  `ZK6 v2.0` (no snapshot yet)
 *
 * Stale = `snapshot.slate_date < today ET`. Yellow tint signals to admins
 * that the rebuild trigger didn't fire today (subscriber-side, this just
 * reads as "the engine hasn't refreshed yet").
 *
 * Operator data (the live-dot, the hash, raw ET clock) is intentionally
 * NOT here — that's diagnostic info for the admin tab, not subscriber
 * surface. Hash and last-rebuild stats stay available via `storage.getItem('rebuild_last_stats')`.
 */

interface SnapshotLike {
  slate_date?: string | null;
  updated_at_et?: string | null;
}

interface Props {
  snapshot: SnapshotLike | null | undefined;
  /** Override engine version label. Defaults to `ZK6 v2.0` from constants. */
  versionLabel?: string;
  style?: StyleProp<TextStyle>;
}

function formatTimeET(updatedAt: string): string | null {
  try {
    return new Date(updatedAt).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' ET';
  } catch { return null; }
}

function agoLabel(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function FreshnessLine({ snapshot, versionLabel = `ZK6 ${ZK6_ENGINE_VERSION}`, style }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { text, stale } = useMemo(() => {
    if (!snapshot) return { stale: false, text: versionLabel };
    const today = getTodayET();
    const slateDate = snapshot.slate_date ?? null;
    const isToday = !!slateDate && slateDate === today;
    if (!isToday && slateDate) {
      const ago = snapshot.updated_at_et ? agoLabel(snapshot.updated_at_et) : 'earlier';
      return { stale: true, text: `🟡 Engine inputs last refreshed ${ago}` };
    }
    if (!snapshot.updated_at_et) return { stale: false, text: versionLabel };
    const t = formatTimeET(snapshot.updated_at_et);
    return { stale: false, text: t ? `${versionLabel} · slate generated ${t}` : versionLabel };
  }, [snapshot, versionLabel]);

  return (
    <Text
      style={[s.line, stale && { color: colors.warning ?? colors.gold }, style]}
      accessibilityLabel={text}
    >
      {text}
    </Text>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  line: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
    fontFamily: theme.typography.fontFamily.mono,
  },
});
