// components/SlateCard.tsx
// ───────────────────────────────────────────────────────────
// Drop-in replacement. Matches HITMASTER_UI_DATA_SPECS.md:
//   • Container padding 12h / 8v (was 16 all-sides)
//   • Rank container 32×, paddingRight 8 (was 36)
//   • Canonical temperature scale (hot/warm/mild/cold tokens)
//   • Bar fill = value × 60px, radius 2px (was inconsistent)
// ───────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { TrendingUp, Minus } from 'lucide-react-native';

interface SlateCardProps {
  rank: number;
  combo: string;
  comboSet: string;
  placeholder?: boolean;
  temperature?: number;
  components?: {
    BOX: number;
    PBURST: number;
    CO: number;
    DGC?: number;
  };
  multiplicity?: 'singles' | 'doubles' | 'triples';
  topPair?: string;
}

const BAR_MAX = 60;   // spec

// Canonical temperature → color (matches theme.colors.{hot,warm,mild,cold})
function tempColor(t: number): string {
  if (t >= 80) return theme.colors.hot;    // #ff3b30
  if (t >= 60) return theme.colors.warm;   // #ffcc00
  if (t >= 40) return theme.colors.mild;   // #34c759
  return         theme.colors.cold;        // #666666
}

export function SlateCard({
  rank,
  combo,
  comboSet,
  placeholder = false,
  temperature,
  components,
  multiplicity,
  topPair,
}: SlateCardProps) {

  const getTrendIcon = () => {
    if (placeholder) return <Minus size={14} color={theme.colors.textTertiary} />;
    const t = temperature ?? 50;
    if (t >= 70) return <TrendingUp size={14} color={theme.colors.cyan} />;
    if (t >= 30) return <Minus       size={14} color={theme.colors.gold} />;
    return <TrendingUp size={14} color={theme.colors.rose} style={{ transform: [{ rotate: '180deg' }] } as const} />;
  };

  const multLabel = (m?: string) => m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Singles';

  const renderBar = (label: string, value: number, color: string) => {
    const pct = Math.min(Math.max(value, 0), 1);
    return (
      <View style={styles.componentBar} key={label}>
        <Text style={styles.componentLabel}>{label}</Text>
        <View style={styles.componentBarTrack}>
          <View style={[
            styles.componentBarFill,
            {
              width: pct * BAR_MAX,
              backgroundColor: color,
              shadowColor: color,
              shadowOpacity: 0.6,
              shadowRadius: 5,
            },
          ]}/>
        </View>
        <Text style={[styles.componentValue, { color }]}>{Math.round(pct * 100)}</Text>
      </View>
    );
  };

  const t = temperature ?? 50;
  const tc = tempColor(t);

  return (
    <View style={styles.container} testID={`slate-card-${rank}`}>
      <View style={styles.rankContainer}>
        <Text style={[styles.rank, { color: tc, borderColor: tc + '55', backgroundColor: tc + '14' }]}>#{rank}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.comboRow}>
          <Text style={styles.combo}>{combo}</Text>
          <Text style={styles.comboSet}>{comboSet}</Text>
        </View>

        {placeholder ? (
          <View style={styles.placeholderContainer}>
            <View style={styles.componentBars}>
              {(['BOX', 'PB', 'CO'] as const).map((l, i) => (
                <View style={styles.componentBar} key={l}>
                  <Text style={styles.componentLabel}>{l}</Text>
                  <View style={[styles.placeholderBar, { width: 40 - i * 5 }]} />
                </View>
              ))}
            </View>
            <View style={styles.badgeRow}>
              <View style={styles.tempBadge}><Text style={styles.tempText}>--°</Text></View>
              <View style={styles.chip}><Text style={styles.chipText}>—</Text></View>
            </View>
          </View>
        ) : (
          <View style={styles.liveDataContainer}>
            {components && (
              <View style={styles.componentBars}>
                {renderBar('BOX',    components.BOX,            theme.colors.cyan)}
                {renderBar('PBURST', components.PBURST,         theme.colors.rose)}
                {renderBar('CO',     components.CO,             theme.colors.purple)}
                {renderBar('DGC',    components.DGC ?? 0,       theme.colors.gold)}
              </View>
            )}
            <View style={styles.badgeRow}>
              <View style={[styles.tempBadge, { borderColor: tc }]}>
                <Text style={[styles.tempText, { color: tc }]}>
                  {temperature != null ? `${Math.round(temperature)}°` : '--°'}
                </Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{multLabel(multiplicity)}</Text>
              </View>
              {topPair && (
                <View style={[styles.chip, { backgroundColor: theme.colors.purple + '20' }]}>
                  <Text style={[styles.chipText, { color: theme.colors.purple }]}>{topPair}</Text>
                </View>
              )}
              {getTrendIcon()}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.card,
    paddingHorizontal: 12,      // ← spec
    paddingVertical: 8,         // ← spec
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.purple + '28',
    ...theme.shadows.glow,
  },
  rankContainer: {
    width: 32,                  // ← spec (was 36)
    paddingRight: 8,            // ← spec
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontSize: theme.typography.fontSize.md,
    fontFamily: theme.typography.fontFamily.monoBold,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    gap: 8,                     // ← spec: 8px vertical gap
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
  },
  combo: {
    fontSize: theme.typography.fontSize.xl,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: theme.colors.text,
    letterSpacing: 6,
  },
  comboSet: {
    fontSize: theme.typography.fontSize.sm,
    fontFamily: theme.typography.fontFamily.mono,
    color: theme.colors.textSecondary,
  },
  placeholderContainer: { gap: theme.spacing.sm },
  liveDataContainer:    { gap: 6 },
  componentBars: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  componentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,                     // ← spec
  },
  componentLabel: {
    width: 60,                  // ← spec (was minWidth 28)
    fontSize: 9,                // ← spec (was xs token = 11)
    textAlign: 'right',
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  componentBarTrack: {
    width: BAR_MAX,             // ← fixed track
    height: 4,                  // ← spec
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 2,            // ← spec
    overflow: 'hidden',
  },
  placeholderBar: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
  },
  componentBarFill: {
    height: '100%',
    borderRadius: 2,            // ← spec (matches track)
  },
  componentValue: {
    width: 22,                  // ← spec
    fontSize: 9,
    fontFamily: theme.typography.fontFamily.monoBold,
    fontWeight: '700',
    textAlign: 'right',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  tempBadge: {
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,           // ← pill (matches mock)
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tempText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.monoBold,
    fontWeight: '800',
    color: theme.colors.textTertiary,
    letterSpacing: 0.5,
  },
  chip: {
    backgroundColor: theme.colors.cyan + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.chip,
  },
  chipText: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '700',
    color: theme.colors.cyan,
  },
});
