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
    const temp = temperature ?? 50;
    if (temp >= 70) return <TrendingUp size={14} color={theme.colors.cyan} />;
    if (temp >= 30) return <Minus size={14} color={theme.colors.gold} />;
    return <TrendingUp size={14} color={theme.colors.rose} style={{ transform: [{ rotate: '180deg' }] } as const} />;
  };

  const tempColor = (temp: number) => {
    if (temp >= 80) return theme.colors.hot;
    if (temp >= 60) return theme.colors.amber;
    if (temp >= 40) return theme.colors.cyan;
    return theme.colors.textTertiary;
  };

  const multLabel = (mult?: string) => mult
    ? mult.charAt(0).toUpperCase() + mult.slice(1)
    : 'Singles';

  const renderBar = (label: string, value: number, color: string) => (
    <View style={styles.componentBar} key={label}>
      <Text style={styles.componentLabel}>{label}</Text>
      <View style={[styles.componentBarFill, { width: Math.max(8, value * 60), backgroundColor: color }]} />
      <Text style={styles.componentValue}>{Math.round(value * 100)}</Text>
    </View>
  );

  return (
    <View style={styles.container} testID={`slate-card-${rank}`}>
      <View style={styles.rankContainer}>
        <Text style={styles.rank}>#{rank}</Text>
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
                {renderBar('BOX', components.BOX,    theme.colors.cyan)}
                {renderBar('PB',  components.PBURST, theme.colors.rose)}
                {renderBar('CO',  components.CO,     theme.colors.purple)}
                {renderBar('DGC', components.DGC ?? 0, theme.colors.gold)}
              </View>
            )}
            <View style={styles.badgeRow}>
              <View style={[styles.tempBadge, { borderColor: tempColor(temperature ?? 50) }]}>
                <Text style={[styles.tempText, { color: tempColor(temperature ?? 50) }]}>
                  {temperature ? `${Math.round(temperature)}°` : '--°'}
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
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.glow,
  },
  rankContainer: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontSize: theme.typography.fontSize.md,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: theme.colors.purple,
    backgroundColor: theme.colors.purple + '18',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.purple + '40',
  },
  content: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
    marginBottom: 6,
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
    gap: 4,
  },
  componentLabel: {
    fontSize: theme.typography.fontSize.xs,
    fontFamily: theme.typography.fontFamily.mono,
    color: theme.colors.textTertiary,
    minWidth: 28,
  },
  placeholderBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.bar,
  },
  componentBarFill: {
    height: 6,
    borderRadius: theme.borderRadius.bar,
    minWidth: 8,
  },
  componentValue: {
    fontSize: theme.typography.fontSize.xs,
    fontFamily: theme.typography.fontFamily.mono,
    color: theme.colors.textTertiary,
    minWidth: 20,
    textAlign: 'right',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tempBadge: {
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.chip,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tempText: {
    fontSize: theme.typography.fontSize.xs,
    fontFamily: theme.typography.fontFamily.mono,
    color: theme.colors.textTertiary,
  },
  chip: {
    backgroundColor: theme.colors.cyan + '18',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.chip,
  },
  chipText: {
    fontSize: theme.typography.fontSize.xs,
    fontFamily: theme.typography.fontFamily.mono,
    color: theme.colors.cyan,
  },
});
