// components/analytics/analyticsShared.tsx — ENH-ANALYTICS-01
//
// Small shared primitives for the Footprint / Pattern Stats panels. These
// render on BOTH admin and consumer surfaces — every string in this folder
// must stay brand-voice-safe (see CLAUDE.md; files are in check:brand-voice
// IN_SCOPE).

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primaryLight : colors.surface,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: active ? '700' : '500',
          color: active ? colors.primary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {children}
    </View>
  );
}

/** Standing honesty line — required on every analytics surface. */
export function DescriptiveNote() {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 10,
        lineHeight: 14,
        color: colors.textTertiary,
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      Descriptive statistics only. Every drawing is an independent event — past
      frequency does not influence future outcomes.
    </Text>
  );
}

export const fmtExpected = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1));
export const fmtRatio = (r: number) => `${r.toFixed(2)}×`;

/**
 * Diverging bar around the 1.0× baseline (observed/expected). Clamped to
 * [0, 2] for display; over-expectation fills right in cyan, under fills left
 * in neutral — deliberately not hot/cold colors (descriptive, not a signal).
 */
export function RatioBar({ ratio, width = 56 }: { ratio: number; width?: number }) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(2, ratio));
  const delta = clamped - 1; // −1 … +1
  const half = Math.abs(delta) * 50; // % of the track
  const over = delta >= 0;
  return (
    <View
      style={{
        width,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.surfaceLight,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: over ? '50%' : `${50 - half}%`,
          width: `${half}%`,
          top: 0,
          bottom: 0,
          backgroundColor: over ? colors.cyan : colors.textTertiary,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: '50%',
          width: 1,
          top: 0,
          bottom: 0,
          backgroundColor: colors.border,
        }}
      />
    </View>
  );
}

/** Proportional count bar (value vs the list max). */
export function CountBar({ value, max }: { value: number; max: number }) {
  const { colors } = useTheme();
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View
      style={{
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.surfaceLight,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 2,
          backgroundColor: colors.cyan,
        }}
      />
    </View>
  );
}

export const useAnalyticsStyles = () => {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 6,
      letterSpacing: 0.4,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 8,
    },
    mono: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    cell: { fontSize: 11, color: colors.textSecondary },
    cellDim: { fontSize: 10, color: colors.textTertiary },
    label: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
    bigStat: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      // monoBold — tabular digits, matching the app's numeric convention
      fontFamily: theme.typography.fontFamily.monoBold,
    },
    error: { fontSize: 12, color: colors.error ?? '#e5484d', marginVertical: 8 },
  });
