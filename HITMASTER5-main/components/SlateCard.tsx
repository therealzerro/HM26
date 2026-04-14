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
  topPair 
}: SlateCardProps) {
  // Debug logging for first few cards
  if (rank <= 3) {
    console.log(`[SlateCard] Rank ${rank}:`, {
      combo,
      comboSet,
      placeholder,
      temperature,
      components,
      multiplicity,
      topPair
    });
  }
  const getTrendIcon = () => {
    if (placeholder) return <Minus size={16} color={theme.colors.textTertiary} />;
    const temp = temperature ?? 50;
    if (temp >= 70) return <TrendingUp size={16} color={theme.colors.success} />;
    if (temp >= 30) return <Minus size={16} color={theme.colors.warning} />;
    const rotateStyle = { transform: [{ rotate: '180deg' }] } as const;
    return <TrendingUp size={16} color={theme.colors.error} style={rotateStyle} />;
  };

  const getTemperatureColor = (temp: number) => {
    if (temp >= 80) return theme.colors.error;
    if (temp >= 60) return theme.colors.warning;
    if (temp >= 40) return theme.colors.success;
    return theme.colors.textTertiary;
  };

  const getMultiplicityLabel = (mult?: string) => {
    if (!mult) return 'Singles';
    return mult.charAt(0).toUpperCase() + mult.slice(1);
  };

  const renderComponentBar = (label: string, value: number, color: string) => {
    const width = Math.max(8, value * 60); // Scale to max 60px
    return (
      <View style={styles.componentBar}>
        <Text style={styles.componentLabel}>{label}</Text>
        <View style={[styles.componentBarFill, { width, backgroundColor: color }]} />
        <Text style={styles.componentValue}>{Math.round(value * 100)}</Text>
      </View>
    );
  };

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
              <View style={styles.componentBar}>
                <Text style={styles.componentLabel}>BOX</Text>
                <View style={[styles.placeholderBar, { width: 40 }]} />
              </View>
              <View style={styles.componentBar}>
                <Text style={styles.componentLabel}>PBURST</Text>
                <View style={[styles.placeholderBar, { width: 35 }]} />
              </View>
              <View style={styles.componentBar}>
                <Text style={styles.componentLabel}>CO</Text>
                <View style={[styles.placeholderBar, { width: 25 }]} />
              </View>
            </View>
            <View style={styles.badgeRow}>
              <View style={styles.tempBadge}>
                <Text style={styles.tempText}>--°</Text>
              </View>
              <View style={styles.bestOrderChip}>
                <Text style={styles.chipText}>BestOrder</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.liveDataContainer}>
            <View style={styles.componentBars}>
              {components && (
                <>
                  {renderComponentBar('BOX', components.BOX, theme.colors.primary)}
                  {renderComponentBar('PB', components.PBURST, theme.colors.dataGreen)}
                  {renderComponentBar('CO', components.CO, theme.colors.dataPurple)}
                </>
              )}
            </View>
            <View style={styles.badgeRow}>
              <View style={[styles.tempBadge, { borderColor: getTemperatureColor(temperature ?? 50) }]}>
                <Text style={[styles.tempText, { color: getTemperatureColor(temperature ?? 50) }]}>
                  {temperature ? `${Math.round(temperature)}°` : '--°'}
                </Text>
              </View>
              <View style={styles.bestOrderChip}>
                <Text style={styles.chipText}>{getMultiplicityLabel(multiplicity)}</Text>
              </View>
              {topPair && (
                <View style={styles.topPairChip}>
                  <Text style={styles.chipText}>{topPair}</Text>
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.primary,
    fontFamily: 'monospace',
  },
  content: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  combo: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  comboSet: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  metric: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
    fontFamily: 'monospace',
  },
  placeholderContainer: {
    gap: theme.spacing.sm,
  },
  componentBars: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  componentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
  },
  componentLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    fontWeight: '600',
  },
  placeholderBar: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
  },
  liveDataContainer: {
    gap: theme.spacing.sm,
  },
  componentBarFill: {
    height: 8,
    borderRadius: theme.borderRadius.sm,
    minWidth: 8,
  },
  componentValue: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    fontWeight: '600',
    fontFamily: 'monospace',
    minWidth: 20,
    textAlign: 'right',
  },
  topPairChip: {
    backgroundColor: theme.colors.dataPurple + '20',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tempBadge: {
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tempText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  bestOrderChip: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  chipText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});