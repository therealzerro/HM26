import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Crown } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { SubscriptionTier } from '@/types/core';

interface TierBadgeProps {
  tier: SubscriptionTier;
  size?: 'small' | 'medium' | 'large';
}

export function TierBadge({ tier, size = 'medium' }: TierBadgeProps) {
  const getColors = () => {
    switch (tier) {
      case 'FREE':
        return {
          background: theme.colors.free + '20',
          border: theme.colors.free,
          text: theme.colors.free,
        };
      case 'PRO':
        return {
          background: theme.colors.premium + '20',
          border: theme.colors.premium,
          text: theme.colors.premium,
        };
      case 'PLUS':
        return {
          background: theme.colors.admin + '20',
          border: theme.colors.admin,
          text: theme.colors.admin,
        };
    }
  };

  const getSizes = () => {
    switch (size) {
      case 'small':
        return {
          padding: 4,
          fontSize: theme.typography.fontSize.xs,
          iconSize: 12,
        };
      case 'medium':
        return {
          padding: 6,
          fontSize: theme.typography.fontSize.sm,
          iconSize: 14,
        };
      case 'large':
        return {
          padding: 8,
          fontSize: theme.typography.fontSize.md,
          iconSize: 16,
        };
    }
  };

  const colors = getColors();
  const sizes = getSizes();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          paddingHorizontal: sizes.padding * 2,
          paddingVertical: sizes.padding,
        },
      ]}
    >
      {tier !== 'FREE' && (
        <Crown size={sizes.iconSize} color={colors.text} />
      )}
      <Text
        style={[
          styles.text,
          {
            color: colors.text,
            fontSize: sizes.fontSize,
          },
        ]}
      >
        {tier}
      </Text>
    </View>
  );
}

interface PremiumBadgeProps {
  size?: 'small' | 'medium' | 'large';
}

export function PremiumBadge({ size = 'medium' }: PremiumBadgeProps) {
  return <TierBadge tier="PRO" size={size} />;
}

interface ComingSoonBadgeProps {
  date?: string;
  size?: 'small' | 'medium' | 'large';
}

export function ComingSoonBadge({ date, size = 'medium' }: ComingSoonBadgeProps) {
  const sizes = {
    small: {
      padding: 4,
      fontSize: theme.typography.fontSize.xs,
    },
    medium: {
      padding: 6,
      fontSize: theme.typography.fontSize.sm,
    },
    large: {
      padding: 8,
      fontSize: theme.typography.fontSize.md,
    },
  };

  const currentSize = sizes[size];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.warning + '20',
          borderColor: theme.colors.warning,
          paddingHorizontal: currentSize.padding * 2,
          paddingVertical: currentSize.padding,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.colors.warning,
            fontSize: currentSize.fontSize,
          },
        ]}
      >
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
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  text: {
    fontWeight: 'bold',
    fontFamily: theme.typography.fontFamily.tabular,
  },
});