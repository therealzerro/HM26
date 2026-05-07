import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Lock, Crown } from 'lucide-react-native';
import { theme } from '@/constants/theme';
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
      <View style={[styles.container, theme.shadows.soft]} testID="premium-gate">
        <View style={styles.iconContainer}>
          <View style={styles.lockBackground}>
            <Lock size={24} color={theme.colors.text} />
          </View>
          <Crown size={20} color={theme.colors.crownGold} style={styles.crownIcon} />
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
        <Crown size={32} color={theme.colors.crownGold} />
        <Text style={styles.modalTitle}>Unlock {feature}</Text>
        {description && (
          <Text style={styles.modalDescription}>{description}</Text>
        )}
        <TouchableOpacity style={styles.modalUpgradeButton} onPress={handleUpgrade}>
          <Text style={styles.modalUpgradeText}>Go {requiredTier}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.maybeLaterText}>Maybe Later</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    margin: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.premium + '40',
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
    backgroundColor: theme.colors.surfaceLight,
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
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  tierText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.premium,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: theme.colors.premium,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
  },
  upgradeText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: theme.typography.fontSize.md,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
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
    color: theme.colors.text,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  modalUpgradeButton: {
    backgroundColor: theme.colors.premium,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    width: '100%',
  },
  modalUpgradeText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: theme.typography.fontSize.lg,
    textAlign: 'center',
  },
  maybeLaterText: {
    color: theme.colors.textTertiary,
    fontSize: theme.typography.fontSize.sm,
    marginTop: theme.spacing.sm,
  },
});