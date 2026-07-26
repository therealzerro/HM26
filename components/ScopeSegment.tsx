import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { scopeAccent } from '@/lib/scopeAccent';

/**
 * Shared scope segmented control (design.md step 1).
 *
 * Replaces three older per-screen implementations:
 *   - Home normal `s.scopeRow / s.scopeBtn` (flat, cyan-only)
 *   - Home coffee inline tabs
 *   - Slate `s.scopeBigRow / s.scopeBigBtn`
 *
 * Per-scope accent comes from `scopeAccent()`: midday = gold (sun),
 * evening = purple (moon), allday = cyan (neutral/engine). The active
 * pill tints background + border + text in that accent so the screen's
 * visual identity follows the scope choice.
 *
 * Use the `size` prop to keep this lightweight on Home normal mode (where
 * vertical real estate is tight) while letting Slate and Home coffee get
 * the taller pill treatment that's screenshot-friendly.
 */

type Scope = 'midday' | 'evening' | 'allday';

const SCOPE_LABELS: Record<Scope, string> = {
  midday:  '☀️ Midday',
  evening: '🌙 Evening',
  allday:  '◈ All Day',
};

interface Props {
  value: Scope;
  onChange: (scope: Scope) => void;
  /** `compact` for tight rows (Home header); `tall` for screenshot-prominent surfaces (Home coffee, Slate). */
  size?: 'compact' | 'tall';
  style?: ViewStyle;
}

export function ScopeSegment({ value, onChange, size = 'tall', style }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const isCompact = size === 'compact';
  return (
    <View style={[s.row, isCompact && s.rowCompact, style]}>
      {(['midday', 'evening', 'allday'] as const).map(sc => {
        const active = value === sc;
        const accent = scopeAccent(sc, colors);
        return (
          <TouchableOpacity
            key={sc}
            style={[
              isCompact ? s.btnCompact : s.btnTall,
              active && {
                backgroundColor: accent + (isCompact ? '14' : '14'),
                borderColor: accent + '88',
              },
            ]}
            onPress={() => onChange(sc)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${SCOPE_LABELS[sc]} scope${active ? ', selected' : ''}`}
            activeOpacity={0.75}
          >
            <Text
              style={[
                isCompact ? s.textCompact : s.textTall,
                { color: active ? accent : colors.textSecondary },
                active && { fontWeight: '900' },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {SCOPE_LABELS[sc]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  rowCompact: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 2,
    gap: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnCompact: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnTall: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  textTall: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
