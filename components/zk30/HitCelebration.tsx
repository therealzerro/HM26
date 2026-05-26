// components/zk30/HitCelebration.tsx
//
// Phase D2 — toast banner + (natural-only) confetti burst when zk30 detects
// an N→N+1 hit transition. The confetti was originally deferred because
// react-native-confetti-cannon shipped pre-modern Flow types Metro couldn't
// resolve; replaced with a hand-rolled reanimated particle system in
// components/zk30/Confetti.tsx (no extra dep beyond reanimated, which is
// already in the project).

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ZK30_THEME } from '@/lib/theme/zk30Theme';
import { theme } from '@/constants/theme';
import { Confetti } from './Confetti';

export type CelebrationKind = 'natural-straight' | 'natural-box' | 'fireball';

interface Props {
  kind: CelebrationKind;
  combo: string;
  /** Called after the auto-dismiss timer fires so the parent can clear
   *  its "celebration in flight" state. */
  onDismiss: () => void;
}

const COPY: Record<CelebrationKind, { headline: string; sub: string; color: string }> = {
  'natural-straight': {
    headline: '🎯 NATURAL STRAIGHT MATCH',
    sub: 'Top of slate — exact-position match',
    color: '#ffd93d',  // gold
  },
  'natural-box': {
    headline: '✓ NATURAL BOX MATCH',
    sub: 'Right digits, any order',
    color: '#34c759',  // success green
  },
  'fireball': {
    headline: '🔥 FIREBALL MATCH',
    sub: 'TX-only · fireball-substitution prize',
    color: ZK30_THEME.accentTX,
  },
};

const HOLD_MS = 4000;

export function HitCelebration({ kind, combo, onDismiss }: Props) {
  const { headline, sub, color } = COPY[kind];
  // ARCH-08 — fireball hits get the quieter variant. Natural hits (straight
  // or box) trigger the confetti burst from just above the toast.
  const isNatural = kind === 'natural-straight' || kind === 'natural-box';

  useEffect(() => {
    const t = setTimeout(onDismiss, HOLD_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  // Origin point — roughly the toast's horizontal center, just below where it
  // sits. Particles fan upward+outward from there.
  const { width: screenW } = Dimensions.get('window');
  const confettiOrigin = { x: screenW / 2 - 4, y: 130 };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {isNatural && <Confetti origin={confettiOrigin} count={40} />}
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(220)}
        style={[styles.toast, { borderColor: color + '88' }]}
      >
        <Text style={[styles.headline, { color }]}>{headline}</Text>
        <Text style={styles.combo}>{combo}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 80, left: 20, right: 20,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5,
    backgroundColor: 'rgba(10,6,19,0.95)',
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    ...(Platform.OS === 'android' ? { elevation: 10 } : null),
  },
  headline: { fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
  combo: {
    fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 2,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  sub: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.4 },
});
