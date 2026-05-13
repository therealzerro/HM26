// components/SignalBar.tsx
// ───────────────────────────────────────────────────────────
// Drop-in replacement. Matches HITMASTER_UI_DATA_SPECS.md
//   • Track width is fixed at 60px (the max fill width)
//   • Fill width = value × 60px (no flex stretch)
//   • Fill border-radius matches the track (2px)
//   • Native glow under fill via shadow props
// ───────────────────────────────────────────────────────────
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from '@/constants/theme';

interface SignalBarProps {
  label: string;
  value: number; // 0–1
  color: string;
}

const BAR_MAX = 60;   // spec — max fill width in px

export function SignalBar({ label, value, color }: SignalBarProps) {
  const pct = Math.min(Math.max(value, 0), 1);
  const fillW = pct * BAR_MAX;
  const valuePct = Math.round(pct * 100);

  return (
    <View
      style={s.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} signal`}
      accessibilityValue={{ min: 0, max: 100, now: valuePct, text: `${valuePct} of 100` }}
    >
      <Text style={s.label}>{label}</Text>
      <View style={s.track}>
        <View
          style={[
            s.fill,
            {
              width: fillW,
              backgroundColor: color,
              // iOS-friendly glow
              shadowColor: color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.7,
              shadowRadius: 6,
              // Android — elevation only renders on opaque, so use a subtle one
              ...(Platform.OS === 'android' ? { elevation: 2 } : null),
            },
          ]}
        />
      </View>
      <Text style={[s.val, { color }]}>{valuePct}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    width: 60,
    fontSize: 9,
    textAlign: 'right',
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  track: {
    width: BAR_MAX,         // ← fixed; was flex:1
    height: 4,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,         // ← was 3; matches track
  },
  val: {
    width: 22,
    fontSize: 9,
    fontWeight: '700',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
});
