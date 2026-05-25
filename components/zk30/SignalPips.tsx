// components/zk30/SignalPips.tsx
//
// Four micro pips visualizing BOX / PBURST / CO / DGC signal strengths in
// dense tile contexts. Color = channel; opacity = strength (0..1). At a
// glance the operator can spot "this pick is heavy BOX + DGC, weak CO."

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface SignalPipsProps {
  signals: { BOX: number; PBURST: number; CO: number; DGC?: number };
  /** ZK30 brand blue — used for CO (swaps ZK6's purple). */
  brandBlue: string;
  /** Pip diameter, default 4px. */
  size?: number;
}

const MIN_OPACITY = 0.18;  // never fully invisible — keeps the row legible as "4 pips"
const MAX_OPACITY = 1.0;

function clampOpacity(v: number): number {
  const x = Math.min(Math.max(v, 0), 1);
  return MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * x;
}

export function SignalPips({ signals, brandBlue, size = 4 }: SignalPipsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeS(colors, size), [colors, size]);

  // Order matches the modal's signal display: BOX / PBURST / CO / DGC.
  // Operator memorizes the spatial layout left→right.
  const pips = [
    { color: colors.cyan, value: signals.BOX,         label: 'BOX' },
    { color: colors.rose, value: signals.PBURST,      label: 'PBURST' },
    { color: brandBlue,    value: signals.CO,         label: 'CO' },
    { color: colors.gold, value: signals.DGC ?? 0,    label: 'DGC' },
  ];

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={pips
        .map(p => `${p.label} ${Math.round(p.value * 100)}`)
        .join(', ')}
    >
      {pips.map((p, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            { backgroundColor: p.color, opacity: clampOpacity(p.value) },
          ]}
        />
      ))}
    </View>
  );
}

const makeS = (colors: ColorTokens, size: number) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: Math.max(2, Math.round(size * 0.7)),
      alignItems: 'center',
    },
    pip: {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
  });
