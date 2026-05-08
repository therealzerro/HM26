import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface EnergyMeterProps {
  value: number; // 0–100
  size?: number;
}

function energyColor(e: number) {
  if (e >= 80) return theme.colors.hot;
  if (e >= 65) return theme.colors.amber;
  if (e >= 45) return theme.colors.gold;
  return theme.colors.textTertiary;
}

function energyLabel(e: number) {
  if (e >= 80) return 'BLAZING';
  if (e >= 65) return 'HOT';
  if (e >= 45) return 'WARM';
  return 'COOL';
}

export function EnergyMeter({ value, size = 80 }: EnergyMeterProps) {
  const col = energyColor(value);
  const inner = size * 0.7;

  return (
    <View style={[s.outer, { width: size, height: size, borderRadius: size / 2, borderColor: col + '40', backgroundColor: col + '12' }]}>
      <View style={[s.inner, { width: inner, height: inner, borderRadius: inner / 2, borderColor: col + '66' }]}>
        <Text style={[s.num, { color: col, fontSize: size * 0.28 }]}>{value}</Text>
      </View>
      <Text style={[s.label, { color: col, fontSize: size * 0.11 }]}>{energyLabel(value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  inner: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  num: {
    fontFamily: theme.typography.fontFamily.monoBold,
    lineHeight: undefined,
  },
  label: {
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 0.8,
    position: 'absolute',
    bottom: 4,
  },
});
