// components/zk30/Confetti.tsx
//
// Hand-rolled confetti burst — replaces the deferred react-native-confetti-cannon
// (which shipped pre-modern Flow types Metro couldn't resolve). Each particle
// is an Animated.View with absolute positioning + reanimated shared values
// driving translate/rotate/opacity over ~1.5s.
//
// Design:
//   • Particles launch outward in a fan from the origin point
//   • Initial upward+lateral velocity (300-500ms), then gravity-style fall
//   • Rotation throughout
//   • Fade-out in the last 400ms
//   • Confetti fires once per mount; parent controls mount/unmount.

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, Easing,
} from 'react-native-reanimated';

interface Props {
  /** Burst origin (relative to the absolute-fill parent). */
  origin: { x: number; y: number };
  /** Particle count. Default 36 — heavy enough to feel festive, light
   *  enough to stay smooth on mid-range devices. */
  count?: number;
}

// Festive 5-color palette — gold, green, blue, pink, orange. Each particle
// picks one at random; the variety reads as "celebration" without leaning
// on any single hit-type's accent color.
const COLORS = ['#ffd93d', '#34c759', '#0ea5e9', '#ec4899', '#ff8800'];

interface Particle {
  id: number;
  dx: number;
  dy: number;
  rot: number;
  color: string;
  size: number;
  delay: number;
}

function generateParticles(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // Fan outward: angle slightly above horizontal so particles arc up first.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // -π to mostly upper half
    const speed = 140 + Math.random() * 180;
    out.push({
      id: i,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      rot: (Math.random() - 0.5) * 720,
      color: COLORS[i % COLORS.length],
      size: 5 + Math.floor(Math.random() * 4), // 5..8px
      delay: Math.floor(Math.random() * 80),    // stagger so launch isn't perfectly synced
    });
  }
  return out;
}

function ConfettiParticle({ p, originX, originY }: { p: Particle; originX: number; originY: number }) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rotV = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Outward burst (~500ms), then gravity-style fall (~800ms with downward bias).
    tx.value = withDelay(p.delay, withTiming(p.dx, { duration: 1200, easing: Easing.out(Easing.cubic) }));
    ty.value = withDelay(p.delay, withSequence(
      withTiming(p.dy, { duration: 500, easing: Easing.out(Easing.cubic) }),
      withTiming(p.dy + 380, { duration: 800, easing: Easing.in(Easing.quad) }),
    ));
    rotV.value = withDelay(p.delay, withTiming(p.rot, { duration: 1300, easing: Easing.linear }));
    opacity.value = withDelay(p.delay + 1000, withTiming(0, { duration: 400 }));
    // No cleanup needed — Animated.View unmounts cleanly when parent unmounts.
  }, [p, tx, ty, rotV, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rotV.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: originX,
          top: originY,
          width: p.size,
          height: p.size * 1.5,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ origin, count = 36 }: Props) {
  // Particle list is generated ONCE per mount — the same randomized fan
  // animates from start to finish without resampling.
  const particles = useMemo(() => generateParticles(count), [count]);

  // Web: reanimated's web shim handles this, but on extremely low-end
  // browsers 40 concurrent animations can stutter. Headless captures
  // (Playwright smokes) also struggle. Skip on web by default; the toast
  // alone carries the headline message there.
  if (Platform.OS === 'web') return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map(p => (
        <ConfettiParticle key={p.id} p={p} originX={origin.x} originY={origin.y} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    borderRadius: 1,
  },
});
