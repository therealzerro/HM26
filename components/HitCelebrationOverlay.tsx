import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, Pressable, Animated, Easing, Share, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '@/constants/theme';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  rank: number;
  digits: string;
  jurisdiction: string;
  session: string;
  hitType?: 'straight' | 'box';
}

const SPARKLE_COUNT = 14;
const SHARE_URL = 'https://hitmaster.app';

export function HitCelebrationOverlay({ visible, onDismiss, rank, digits, jurisdiction, session, hitType }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const sparkles = useRef(
    Array.from({ length: SPARKLE_COUNT }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: Math.random() * 360,
    })),
  ).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0);
      fade.setValue(0);
      sparkles.forEach(s => { s.x.setValue(0); s.y.setValue(0); s.opacity.setValue(0); });
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();

    sparkles.forEach((s, i) => {
      const angle = (i / SPARKLE_COUNT) * Math.PI * 2;
      const dist = 120 + Math.random() * 80;
      Animated.parallel([
        Animated.sequence([
          Animated.timing(s.opacity, { toValue: 1, duration: 120, delay: 200, useNativeDriver: true }),
          Animated.timing(s.opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.timing(s.x, { toValue: Math.cos(angle) * dist, duration: 1100, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(s.y, { toValue: Math.sin(angle) * dist, duration: 1100, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  }, [visible]);

  const handleShare = async () => {
    const sessLabel = session === 'midday' ? 'Midday' : 'Evening';
    const typeLabel = hitType === 'straight' ? 'STRAIGHT' : 'BOX';
    const message = `🎯 Just hit on HitMaster — pick #${rank} was ${digits}, drew today in ${jurisdiction} ${sessLabel} (${typeLabel}). Try the app: ${SHARE_URL}`;
    try {
      await Share.share({ message });
    } catch {}
  };

  const sessIcon = session === 'midday' ? '☀️' : session === 'evening' ? '🌙' : '◈';
  const typeText = hitType === 'straight' ? 'Straight ✓' : 'Box ✓';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.sparkleAnchor} pointerEvents="none">
            {sparkles.map((s, i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.sparkle,
                  { transform: [{ translateX: s.x }, { translateY: s.y }, { rotate: `${s.rotate}deg` }], opacity: s.opacity },
                ]}
              >
                ✦
              </Animated.Text>
            ))}
          </View>
          <Text style={styles.bigEmoji}>🎯</Text>
          <Text style={styles.title}>HIT!</Text>
          <Text style={styles.combo} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{digits}</Text>
          <Text style={styles.meta}>Pick #{rank} · {jurisdiction} {sessIcon} · {typeText}</Text>
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>Tell your friends ✨</Text>
          </Pressable>
          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissBtnText}>Awesome</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,6,19,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.cyan,
    width: '100%',
    maxWidth: 360,
    shadowColor: theme.colors.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    overflow: 'visible',
  },
  sparkleAnchor: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 },
  sparkle: { position: 'absolute', fontSize: 22, color: theme.colors.cyan, top: -11, left: -11, fontWeight: '900' },
  bigEmoji: { fontSize: 56, marginBottom: 4 },
  title: { fontSize: 38, fontWeight: '900', color: theme.colors.cyan, letterSpacing: 6, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  combo: { fontSize: 56, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 6, marginVertical: 10 },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 22, textAlign: 'center', lineHeight: 18 },
  shareBtn: { backgroundColor: theme.colors.cyan, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginBottom: 6, width: '100%', alignItems: 'center' },
  shareBtnText: { color: theme.colors.background, fontSize: 15, fontWeight: '800', letterSpacing: 0.4 },
  dismissBtn: { paddingVertical: 10, marginTop: 4 },
  dismissBtnText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
