// components/EnergyMeter.tsx
// ───────────────────────────────────────────────────────────
// Drop-in replacement. Keeps the LinearGradient ring + pulse,
// upgrades the cool state (no longer a flat grey number),
// aligns labels with PickCard's heatInfo bands, and adds a
// soft ring glow on all energies (was only ≥80).
// ───────────────────────────────────────────────────────────
import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { useReduceMotion } from '@/hooks/useReduceMotion';

interface EnergyMeterProps {
  value: number; // 0–100
  size?: number;
}

// Aligned with PickCard.heatInfo: 90 ON FIRE → 80 BLAZING → 65 HOT → 45 WARM → COOL
function energyColor(e: number, colors: ColorTokens) {
  if (e >= 90) return colors.hot;
  if (e >= 80) return colors.amber;
  if (e >= 65) return colors.orange;
  if (e >= 45) return colors.gold;
  return colors.cyan;
}

function energyLabel(e: number) {
  if (e >= 90) return 'ON FIRE';
  if (e >= 80) return 'BLAZING';
  if (e >= 65) return 'HOT';
  if (e >= 45) return 'WARM';
  return 'COOL';
}

function energyGradient(e: number, colors: ColorTokens): [string, string] {
  if (e >= 90) return [colors.hot,    colors.amber];
  if (e >= 80) return [colors.amber,  colors.gold];
  if (e >= 65) return [colors.orange, colors.gold];
  if (e >= 45) return [colors.gold,   colors.cyan];
  return        [colors.cyan,   colors.purple];
}

export function EnergyMeter({ value, size = 80 }: EnergyMeterProps) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const col = energyColor(value, colors);
  const [g1, g2] = energyGradient(value, colors);
  const innerSize = size * 0.72;
  const reduceMotion = useReduceMotion();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hazeAnim  = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (value >= 80 && reduceMotion) {
      // Snap to a stable elevated state — keep the glow but skip the loop.
      pulseAnim.setValue(1);
      hazeAnim.setValue(0.4);
      return;
    }
    if (value >= 80) {
      const scale = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.14, duration: theme.animation.pulse, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: theme.animation.pulse, useNativeDriver: true }),
        ])
      );
      const haze = Animated.loop(
        Animated.sequence([
          Animated.timing(hazeAnim, { toValue: 0.6, duration: theme.animation.pulse, useNativeDriver: true }),
          Animated.timing(hazeAnim, { toValue: 0.2, duration: theme.animation.pulse, useNativeDriver: true }),
        ])
      );
      scale.start(); haze.start();
      return () => { scale.stop(); haze.stop(); };
    } else {
      pulseAnim.setValue(1);
      hazeAnim.setValue(0.3);
    }
  }, [value, reduceMotion]);

  const label = energyLabel(value);
  return (
    <View
      style={{ width: size, height: size + 16, alignItems: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Energy: ${value}, ${label}`}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value} of 100, ${label}` }}
    >
      {/* Animated glow halo — only for 80+ */}
      {value >= 80 && (
        <Animated.View
          style={[
            s.halo,
            {
              width: size * 1.3, height: size * 1.3,
              borderRadius: (size * 1.3) / 2,
              top: -(size * 0.15),
              backgroundColor: col + '30',
              transform: [{ scale: pulseAnim }],
              opacity: hazeAnim,
            },
          ]}
        />
      )}

      {/* Gradient ring — now with a subtle baseline glow on all energies */}
      <LinearGradient
        colors={[g1, g2]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: col,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.55,
          shadowRadius: 10,
          ...(Platform.OS === 'android' ? { elevation: 6 } : null),
        }}
      >
        <View style={{
          width: innerSize, height: innerSize, borderRadius: innerSize / 2,
          backgroundColor: colors.background,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text
            style={[s.num, { color: col, fontSize: size * 0.28 }]}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            adjustsFontSizeToFit
          >{value}</Text>
        </View>
      </LinearGradient>

      <Text style={[s.label, { color: col, fontSize: size * 0.12, marginTop: 4 }]}>
        {label}
      </Text>
    </View>
  );
}

const makeS = (_colors: ColorTokens) => StyleSheet.create({
  halo: { position: 'absolute' },
  num:  { fontFamily: theme.typography.fontFamily.monoBold },
  label:{ fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.8, fontWeight: '700' },
});
