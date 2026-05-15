import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';

interface Props {
  pickRank: number;
  pickCombo: string;
  hitType?: 'box' | 'straight';
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Trial extension on hit (enhancements §6.2). Renders only when a Free
 * user has a visible pick (5 or 6 in current free-tier reveal) that hit
 * today. High-value moment — the engine just delivered something the user
 * can verify, so the upgrade ask lands with concrete proof attached.
 */
export function TrialOfferBanner({ pickRank, pickCombo, hitType, onUpgrade, onDismiss }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const typeLabel = hitType === 'straight' ? 'straight' : 'box';
  return (
    <LinearGradient
      colors={[colors.gold + '22', colors.cyan + '14']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.headerRow}>
        <Text style={s.title}>🎯 Your free pick #{pickRank} just hit</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Dismiss trial offer">
          <Text style={s.dismiss}>×</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.body}>
        <Text style={s.combo}>{pickCombo}</Text> {typeLabel} hit verified today. The full K6 slate has 4 more picks just like it.
      </Text>
      <TouchableOpacity style={s.cta} onPress={onUpgrade}>
        <Text style={s.ctaText}>Try Oracle+ 5 days free →</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gold + '88',
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 13, fontWeight: '900', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  dismiss: { fontSize: 18, color: colors.textTertiary, fontWeight: '700' },
  body: { fontSize: 12, color: colors.text, lineHeight: 18 },
  combo: { fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.5 },
  cta: { backgroundColor: colors.gold, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', alignSelf: 'flex-start', marginTop: 4 },
  ctaText: { color: colors.background, fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
});
