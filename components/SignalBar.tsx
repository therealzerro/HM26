import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface SignalBarProps {
  label: string;
  value: number; // 0–1
  color: string;
}

export function SignalBar({ label, value, color }: SignalBarProps) {
  const pct = Math.min(Math.max(value, 0), 1);
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[s.val, { color }]}>{Math.round(pct * 100)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  label: {
    fontSize: 9,
    color: theme.colors.textTertiary,
    width: 60,
    textAlign: 'right',
    fontFamily: 'Courier',
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  val: { fontSize: 9, width: 22, fontFamily: 'Courier', fontWeight: '700' },
});
