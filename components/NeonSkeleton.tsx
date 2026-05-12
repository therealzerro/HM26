import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, ViewStyle } from 'react-native';
import { theme } from '@/constants/theme';

type Variant = 'card' | 'row' | 'combo' | 'text' | 'splash';

interface Props {
  variant?: Variant;
  count?: number;
  w?: number;
  h?: number;
  style?: ViewStyle;
}

export function NeonSkeleton({ variant = 'card', count = 1, w, h, style }: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  const items = Array.from({ length: count });
  return (
    <View style={[styles.wrap, style]}>
      {items.map((_, i) => (
        <SkeletonBody key={i} variant={variant} w={w} h={h} opacity={opacity} />
      ))}
    </View>
  );
}

function SkeletonBody({
  variant, w, h, opacity,
}: { variant: Variant; w?: number; h?: number; opacity: Animated.AnimatedInterpolation<number> }) {
  if (variant === 'card') {
    return (
      <Animated.View style={[styles.card, { opacity }]}>
        <View style={styles.cardRow}>
          <View style={[styles.block, styles.rank]} />
          <View style={[styles.block, { flex: 1, height: 14 }]} />
          <View style={[styles.block, { width: 56, height: 22, borderRadius: 999 }]} />
        </View>
        <View style={[styles.block, styles.combo]} />
        <View style={styles.barRow}>
          {[0, 1, 2, 3].map(k => (
            <View key={k} style={styles.barLine}>
              <View style={[styles.block, { width: 48, height: 9 }]} />
              <View style={[styles.block, { flex: 1, height: 4, marginHorizontal: 6 }]} />
              <View style={[styles.block, { width: 22, height: 9 }]} />
            </View>
          ))}
        </View>
      </Animated.View>
    );
  }
  if (variant === 'row') {
    return (
      <Animated.View style={[styles.row, { opacity }]}>
        <View style={[styles.block, { width: 32, height: 32, borderRadius: 16 }]} />
        <View style={[styles.block, { flex: 1, height: 14, marginLeft: 12 }]} />
        <View style={[styles.block, { width: 56, height: 14 }]} />
      </Animated.View>
    );
  }
  if (variant === 'combo') {
    return (
      <Animated.View style={[styles.comboWrap, { opacity }]}>
        <View style={[styles.block, styles.comboDigit]} />
        <View style={[styles.block, styles.comboDigit]} />
        <View style={[styles.block, styles.comboDigit]} />
      </Animated.View>
    );
  }
  if (variant === 'splash') {
    return (
      <Animated.View style={[styles.splash, { opacity }]}>
        <View style={[styles.block, styles.splashLogo]} />
        <View style={[styles.block, { width: 160, height: 14, marginTop: 18 }]} />
        <View style={[styles.block, { width: 100, height: 10, marginTop: 8 }]} />
      </Animated.View>
    );
  }
  // text
  return (
    <Animated.View style={{ opacity }}>
      <View style={[styles.block, { width: w ?? 120, height: h ?? 12 }]} />
    </Animated.View>
  );
}

const block: ViewStyle = {
  backgroundColor: 'rgba(155,91,255,0.18)',
  borderRadius: 6,
};

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  block,
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    gap: 8,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { width: 24, height: 14 },
  combo: { width: 200, height: 42, marginLeft: 32, marginVertical: 4 },
  barRow: { gap: 6, marginLeft: 32 },
  barLine: { flexDirection: 'row', alignItems: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  comboWrap: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  comboDigit: { width: 48, height: 56 },

  splash: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  splashLogo: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(155,91,255,0.28)',
  },
});

export default NeonSkeleton;
