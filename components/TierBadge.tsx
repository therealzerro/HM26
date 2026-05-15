// components/TierBadge.tsx
// ───────────────────────────────────────────────────────────
// Drop-in replacement. Visual upgrades:
//   • PRO / PLUS get a subtle native glow (matches neon mocks)
//   • Uses monoBold token instead of fontWeight: 'bold'
//   • FREE no longer gets the same border weight as paid tiers
//   • Crown icon scales with size more consistently
//   • ComingSoonBadge inherits the same pill styling
// ───────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Crown } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { SubscriptionTier } from '@/types/core';

interface TierBadgeProps {
  tier: SubscriptionTier;
  size?: 'small' | 'medium' | 'large';
}

function tierPalette(tier: SubscriptionTier, colors: ColorTokens) {
  switch (tier) {
    case 'FREE':
      return { bg: colors.surfaceLight, border: colors.borderMed, text: colors.textTertiary, glow: false };
    case 'PRO':
      return { bg: colors.premium + '20', border: colors.premium, text: colors.premium, glow: true };
    case 'PLUS':
      return { bg: colors.admin + '20',   border: colors.admin,   text: colors.admin,   glow: true };
  }
}

function sizeMetrics(size: 'small' | 'medium' | 'large') {
  switch (size) {
    case 'small':  return { padX: 8,  padY: 3,  fontSize: 10, iconSize: 11 };
    case 'medium': return { padX: 10, padY: 4,  fontSize: 12, iconSize: 13 };
    case 'large':  return { padX: 14, padY: 6,  fontSize: 14, iconSize: 16 };
  }
}

export function TierBadge({ tier, size = 'medium' }: TierBadgeProps) {
  const { colors } = useTheme();
  const p = tierPalette(tier, colors);
  const m = sizeMetrics(size);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          paddingHorizontal: m.padX,
          paddingVertical: m.padY,
          // soft glow on paid tiers — readable, not blinding
          ...(p.glow ? {
            shadowColor: p.border,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.45,
            shadowRadius: 6,
            ...(Platform.OS === 'android' ? { elevation: 3 } : null),
          } : null),
        },
      ]}
    >
      {tier !== 'FREE' && <Crown size={m.iconSize} color={p.text} />}
      <Text style={[styles.text, { color: p.text, fontSize: m.fontSize }]}>{tier}</Text>
    </View>
  );
}

interface PremiumBadgeProps { size?: 'small' | 'medium' | 'large' }
export function PremiumBadge({ size = 'medium' }: PremiumBadgeProps) {
  return <TierBadge tier="PRO" size={size} />;
}

interface ComingSoonBadgeProps {
  date?: string;
  size?: 'small' | 'medium' | 'large';
}
export function ComingSoonBadge({ date, size = 'medium' }: ComingSoonBadgeProps) {
  const { colors } = useTheme();
  const m = sizeMetrics(size);
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.warning + '20',
          borderColor: colors.warning,
          paddingHorizontal: m.padX,
          paddingVertical: m.padY,
          shadowColor: colors.warning,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 5,
          ...(Platform.OS === 'android' ? { elevation: 2 } : null),
        },
      ]}
    >
      <Text style={[styles.text, { color: colors.warning, fontSize: m.fontSize }]}>
        Coming {date || 'Soon'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,            // pill
    borderWidth: 1,
  },
  text: {
    fontWeight: '800',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 0.6,
  },
});
