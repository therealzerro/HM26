// components/zk30/HitCelebration.tsx
//
// Phase D2 — toast banner that fires on natural N→N+1 hit transitions.
// Original spec called for confetti via react-native-confetti-cannon, but
// that package ships Flow types referencing pre-modern RN paths and Metro
// can't resolve them. The toast carries the headline information; visual
// confetti was decorative on top of that, not the primary signal. Toast-only
// implementation ships D2 cleanly without a broken native dep.
//
// Future: revisit confetti via a maintained alternative (e.g. lottie file)
// or a hand-rolled reanimated particle system if visual punch matters more
// than the toast already delivers.

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ZK30_THEME } from '@/lib/theme/zk30Theme';
import { theme } from '@/constants/theme';

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

  useEffect(() => {
    const t = setTimeout(onDismiss, HOLD_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
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
