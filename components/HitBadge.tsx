import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';

/**
 * Shared hit-type pill (design.md step 4).
 *
 * The single source of truth for "this combo hit" affordances. Straight =
 * gold (rarer + higher payout), Box = cyan (more common, still wins).
 *
 * Replaces inline badge styles that drifted across Home, Slate, Results,
 * and PickCard. After this extraction the hit moment reads identically
 * everywhere a badge is shown.
 *
 * Variants:
 *   - default — full pill with emoji + label ("⭐ STRAIGHT" / "🎯 BOX")
 *   - compact — emoji only, no label (for dense lists)
 */

type HitType = 'straight' | 'box';

interface Props {
  type: HitType;
  /** Drop the text label, show emoji only. Useful in dense rows / small spaces. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function HitBadge({ type, compact, style }: Props) {
  const color = type === 'straight' ? theme.colors.gold : theme.colors.cyan;
  const emoji = type === 'straight' ? '⭐' : '🎯';
  const label = type === 'straight' ? 'STRAIGHT' : 'BOX';
  return (
    <View
      style={[
        s.badge,
        { borderColor: color + '66', backgroundColor: color + '22' },
        compact && s.badgeCompact,
        style,
      ]}
      accessibilityLabel={`${type} hit`}
    >
      <Text style={[s.badgeText, { color }]} numberOfLines={1}>
        {emoji}{compact ? '' : ` ${label}`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeCompact: { paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
});
