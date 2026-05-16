import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { getTodayET } from '@/lib/dateUtils';

/**
 * MissDayCard — replaces the dead-state on Results when the selected date
 * has zero hits. Two branches:
 *
 *   • selectedDate === today + draws still ahead  → COMING UP preview with
 *     live countdown to next draw window (12:00 ET midday, 19:30 ET evening).
 *   • otherwise → MISSED DAY card paired with a trend fact ("hits on X of
 *     last 7 days") so the user leaves with momentum, not silence.
 *
 * Operator language is intentionally stripped. The copy is encouragement,
 * not methodology. Per the subscriber-voice memory: subscribers see
 * results, not the SRE dashboard.
 */

interface Props {
  selectedDate: string;
  /** Number of days in the last 7 (incl. today) that had ≥1 hit. */
  hitsLast7Days: number;
  /** Total followed states — adds a "your slate" personalization when present. */
  followedCount?: number;
}

const NEXT_DRAW_TARGETS: Array<{ h: number; m: number; label: string; emoji: string }> = [
  { h: 12, m: 0,  label: 'midday',  emoji: '☀️' },
  { h: 19, m: 30, label: 'evening', emoji: '🌙' },
];

function useNextDrawCountdown(): { text: string; label: string; emoji: string } | null {
  const [state, setState] = useState<{ text: string; label: string; emoji: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      let closest = Infinity;
      let chosen = NEXT_DRAW_TARGETS[0];
      for (const target of NEXT_DRAW_TARGETS) {
        const t = new Date(nowET);
        t.setHours(target.h, target.m, 0, 0);
        if (t <= nowET) continue; // already passed today
        const diff = t.getTime() - nowET.getTime();
        if (diff < closest) { closest = diff; chosen = target; }
      }
      if (!isFinite(closest)) { setState(null); return; }
      const hr = Math.floor(closest / 3_600_000);
      const mn = Math.floor((closest % 3_600_000) / 60_000);
      const sc = Math.floor((closest % 60_000) / 1_000);
      setState({
        text: hr > 0 ? `${hr}h ${mn}m` : `${mn}m ${sc}s`,
        label: chosen.label,
        emoji: chosen.emoji,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}

export function MissDayCard({ selectedDate, hitsLast7Days, followedCount }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const isToday = useMemo(() => selectedDate === getTodayET(), [selectedDate]);
  const next = useNextDrawCountdown();

  // Scenario A — today, draws still ahead
  if (isToday && next) {
    return (
      <View style={[s.card, { borderColor: colors.purple + '55' }]}>
        <View style={s.headerRow}>
          <Text style={[s.eyebrow, { color: colors.purple }]}>
            {next.emoji}  COMING UP
          </Text>
        </View>
        <Text style={s.line1}>
          Next {next.label} draws land in <Text style={[s.bold, { color: colors.purple }]}>{next.text}</Text>
        </Text>
        {typeof followedCount === 'number' && followedCount > 0 && (
          <Text style={s.line2}>
            Your slate is loaded · {followedCount} state{followedCount === 1 ? '' : 's'} you follow
          </Text>
        )}
      </View>
    );
  }

  // Scenario B — past date OR today after all draws + still no hit
  return (
    <View style={[s.card, { borderColor: colors.border }]}>
      <View style={s.headerRow}>
        <Text style={[s.eyebrow, { color: colors.textTertiary }]}>📅  NOTHING LANDED</Text>
      </View>
      <Text style={s.line1}>
        No K6 matches on this date.
      </Text>
      {hitsLast7Days > 0 ? (
        <Text style={s.line2}>
          But you've matched on <Text style={[s.bold, { color: colors.gold }]}>{hitsLast7Days} of the last 7 days</Text>.
        </Text>
      ) : (
        <Text style={s.line2}>
          Tomorrow's slate is the next chance — signals refresh after each import.
        </Text>
      )}
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  card: {
    marginHorizontal: theme.layout.screenInset,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    gap: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  line1: {
    fontSize: 13,
    color: colors.text,
    fontFamily: theme.typography.fontFamily.medium,
    lineHeight: 18,
  },
  line2: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: theme.typography.fontFamily.mono,
    marginTop: 4,
    lineHeight: 16,
  },
  bold: {
    fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
});

export default MissDayCard;
