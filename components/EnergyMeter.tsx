import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

function energyGradient(e: number): [string, string] {
  if (e >= 80) return [theme.colors.hot, theme.colors.amber];
  if (e >= 65) return [theme.colors.amber, theme.colors.gold];
  if (e >= 45) return [theme.colors.gold, theme.colors.cyan];
  return ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.08)'];
}

export function EnergyMeter({ value, size = 80 }: EnergyMeterProps) {
  const col = energyColor(value);
  const [g1, g2] = energyGradient(value);
  const innerSize = size * 0.72;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hazeAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (value >= 80) {
      const scale = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.14, duration: theme.animation.pulse, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: theme.animation.pulse, useNativeDriver: true }),
        ])
      );
      const haze = Animated.loop(
        Animated.sequence([
          Animated.timing(hazeAnim, { toValue: 0.6, duration: theme.animation.pulse, useNativeDriver: true }),
          Animated.timing(hazeAnim, { toValue: 0.2, duration: theme.animation.pulse, useNativeDriver: true }),
        ])
      );
      scale.start();
      haze.start();
      return () => { scale.stop(); haze.stop(); };
    } else {
      pulseAnim.setValue(1);
      hazeAnim.setValue(0.3);
    }
  }, [value]);

  return (
    <View style={{ width: size, height: size + 16, alignItems: 'center' }}>
      {/* Animated glow halo — only for blazing energy */}
      {value >= 80 && (
        <Animated.View
          style={[
            s.halo,
            {
              width: size * 1.3,
              height: size * 1.3,
              borderRadius: (size * 1.3) / 2,
              top: -(size * 0.15),
              backgroundColor: col + '30',
              transform: [{ scale: pulseAnim }],
              opacity: hazeAnim,
            },
          ]}
        />
      )}

      {/* Gradient ring via LinearGradient + hollow inner circle */}
      <LinearGradient
        colors={[g1, g2]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: theme.colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[s.num, { color: col, fontSize: size * 0.28 }]}>{value}</Text>
        </View>
      </LinearGradient>

      {/* Label */}
      <Text style={[s.label, { color: col, fontSize: size * 0.12, marginTop: 4 }]}>
        {energyLabel(value)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  halo: {
    position: 'absolute',
  },
  num: {
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  label: {
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 0.8,
  },
});
