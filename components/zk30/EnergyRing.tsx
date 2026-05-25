// components/zk30/EnergyRing.tsx
//
// Circular progress ring for the compact tile. Arc length = energy/100;
// stroke color = energy tier (hot/amber/orange/gold/cyan). Children are
// rendered absolutely-positioned in the dead center so the combo digits sit
// inside the ring.

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { energyTier } from './types';

interface EnergyRingProps {
  energy: number;          // 0–100
  size: number;            // outer diameter in px
  stroke?: number;         // ring thickness
  children?: React.ReactNode;
  /** Override stroke color (e.g., gold when straight-hit). When set, ignores tier. */
  overrideColor?: string;
}

export function EnergyRing({ energy, size, stroke = 2.5, children, overrideColor }: EnergyRingProps) {
  const { colors } = useTheme();

  const tier = energyTier(energy);
  const tierColor = colors[tier.key as keyof ColorTokens] as string;
  const ringColor = overrideColor ?? tierColor;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(energy / 100, 0), 1);
  const dashOffset = circumference * (1 - pct);

  // Background track — very low-contrast hairline so the empty arc reads as
  // "ring shape" without dominating.
  const trackColor = colors.border;

  const styles = useMemo(() => makeS(size), [size]);

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children && <View style={styles.center}>{children}</View>}
    </View>
  );
}

const makeS = (size: number) => StyleSheet.create({
  wrap: {
    width: size,
    height: size,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
