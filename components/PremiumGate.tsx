import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { goBackSafe } from '@/lib/safeBack';
import { Lock, Crown } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens, type ShadowTokens } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionTier } from '@/types/core';

interface PremiumGateProps {
  children: React.ReactNode;
  requiredTier: 'PRO' | 'PLUS';
  feature: string;
  description?: string;
  variant?: 'inline' | 'modal';
}

export function PremiumGate({ 
  children, 
  requiredTier, 
  feature, 
  description,
  variant = 'inline'
}: PremiumGateProps) {
  const { colors, shadows } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  
  const getUserTier = (): SubscriptionTier => {
    if (user?.role === 'admin') return 'PLUS';
    if (user?.role === 'premium') return 'PRO';
    return 'FREE';
  };
  
  const currentTier = getUserTier();
  const hasAccess = (
    (requiredTier === 'PRO' && (currentTier === 'PRO' || currentTier === 'PLUS')) ||
    (requiredTier === 'PLUS' && currentTier === 'PLUS')
  );
  
  if (hasAccess) {
    return <>{children}</>;
  }
  
  const handleUpgrade = () => {
    // For now, just navigate to paywall without params
    // TODO: Implement proper plan selection
    console.log('Navigating to paywall for tier:', requiredTier);
    router.push('/paywall');
  };
  
  if (variant === 'inline') {
    return (
      <View style={[styles.container, shadows.glow]} testID="premium-gate">
        <View style={styles.iconContainer}>
          <View style={styles.lockBackground}>
            <Lock size={24} color={colors.text} />
          </View>
          <Crown size={20} color={colors.crownGold} style={styles.crownIcon} />
        </View>
        
        <View style={styles.content}>
          <Text style={styles.title}>{feature}</Text>
          {description && (
            <Text style={styles.description}>{description}</Text>
          )}
          <Text style={styles.tierText}>Requires {requiredTier} tier</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.upgradeButton} 
          onPress={handleUpgrade}
          testID="upgrade-button"
        >
          <Text style={styles.upgradeText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Modal variant would be implemented here
  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <Crown size={32} color={colors.crownGold} />
        <Text style={styles.modalTitle}>Unlock {feature}</Text>
        {description && (
          <Text style={styles.modalDescription}>{description}</Text>
        )}
        <TouchableOpacity style={styles.modalUpgradeButton} onPress={handleUpgrade}>
          <Text style={styles.modalUpgradeText}>Go {requiredTier}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goBackSafe()}>
          <Text style={styles.maybeLaterText}>Maybe Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    margin: theme.spacing.md,
    borderWidth: 2,
    borderColor: colors.premium + '40',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBackground: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownIcon: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  tierText: {
    fontSize: theme.typography.fontSize.xs,
    color: colors.premium,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: colors.premium,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
  },
  upgradeText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: theme.typography.fontSize.md,
  },
  modalContainer: {
    flex: 1,
    // scrim stays dark in both modes (LIGHT-01)
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: theme.typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalUpgradeButton: {
    backgroundColor: colors.premium,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
  },
  modalUpgradeText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: theme.typography.fontSize.lg,
    textAlign: 'center',
  },
  maybeLaterText: {
    color: colors.textTertiary,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.sm,
  },
});