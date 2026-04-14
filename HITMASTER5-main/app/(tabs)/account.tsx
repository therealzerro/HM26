import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

import { Crown, Shield, User, Book, ChevronRight, Check } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

import { UserRole } from '@/types/core';

const PLANS = [
  {
    role: 'free' as UserRole,
    name: 'Free',
    icon: User,
    color: theme.colors.free,
    features: [
      'View K-Slate Top 10',
      'Basic search',
      'Daily results',
    ],
  },
  {
    role: 'premium' as UserRole,
    name: 'Premium',
    icon: Crown,
    color: theme.colors.premium,
    features: [
      'Everything in Free',
      'Full K-Slate access',
      'Advanced analytics',
      'Historical data',
      'Export capabilities',
    ],
  },
  {
    role: 'admin' as UserRole,
    name: 'Admin',
    icon: Shield,
    color: theme.colors.admin,
    features: [
      'Everything in Premium',
      'Data import tools',
      'System health monitoring',
      'Slate generation',
      'Audit logs',
    ],
  },
];

export default function AccountScreen() {
  const { user, setRole } = useAuth();

  const currentPlan = PLANS.find(p => p.role === user?.role) || PLANS[0];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: currentPlan.color }]}>
            <currentPlan.icon size={32} color={theme.colors.background} />
          </View>
          <Text style={styles.userName}>User #{user?.id.slice(0, 8)}</Text>
          <View style={[styles.roleBadge, { backgroundColor: currentPlan.color + '20' }]}>
            <Text style={[styles.roleText, { color: currentPlan.color }]}>
              {currentPlan.name}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Entitlements</Text>
          
          {PLANS.map((plan) => (
            <TouchableOpacity
              key={plan.role}
              style={[
                styles.planCard,
                user?.role === plan.role && styles.planCardActive,
              ]}
              onPress={() => setRole(plan.role)}
              testID={`plan-${plan.role}`}
            >
              <View style={styles.planHeader}>
                <View style={[styles.planIcon, { backgroundColor: plan.color + '20' }]}>
                  <plan.icon size={24} color={plan.color} />
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {user?.role === plan.role && (
                    <Text style={styles.currentPlanLabel}>Current Plan</Text>
                  )}
                </View>
                {user?.role === plan.role ? (
                  <Check size={20} color={theme.colors.success} />
                ) : (
                  <ChevronRight size={20} color={theme.colors.textTertiary} />
                )}
              </View>
              
              <View style={styles.featuresList}>
                {plan.features.map((feature, index) => (
                  <View key={`${plan.role}-feature-${index}`} style={styles.featureItem}>
                    <View style={styles.featureDot} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => {
              // Glossary modal will be implemented in Phase 1
              console.log('Glossary - Phase 1 feature');
            }}
          >
            <Book size={20} color={theme.colors.primary} />
            <Text style={styles.menuText}>Glossary</Text>
            <ChevronRight size={20} color={theme.colors.textTertiary} />
          </TouchableOpacity>
          <Text style={styles.comingSoon}>Interactive glossary coming in Phase 1</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Phase 0 - Shell Ready for ZK6 Engine
          </Text>
          <Text style={styles.versionText}>v0.1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  userName: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  roleBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  roleText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
  },
  section: {
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  planCardActive: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  currentPlanLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.success,
    marginTop: 2,
  },
  featuresList: {
    marginLeft: 56,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  featureDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textTertiary,
    marginRight: theme.spacing.sm,
  },
  featureText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuText: {
    flex: 1,
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  footer: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  footerText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  versionText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
  },
  comingSoon: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});