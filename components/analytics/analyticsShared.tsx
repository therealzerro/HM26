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
    bigStat: { fontSize: 20, fontWeight: '800', color: colors.text },
    error: { fontSize: 12, color: colors.error ?? '#e5484d', marginVertical: 8 },
  });
