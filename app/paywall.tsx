import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { SubscriptionPlan } from '@/types/core';
import { useAuth } from '@/hooks/useAuth';

// Verified hit rate — measured 2026-05-27 on the current production stack
// (CONFIG-06 pure-H01Y + CONFIG-07 per-scope midday CO-heavy + ENH-BOA
// bestOrderFor realignment). 30-day window 4/28–5/27, n=87 slates × 3 scopes,
// balanced + floor=70. Mirrors the headline shown in the Home unified hero (§1.3).
const VERIFIED_HIT_RATE = 72.4;

interface PlanOption {
  id: SubscriptionPlan;
  title: string;
  price: string;
  description: string;
  badge?: string;
  features: string[];
}

const plans: PlanOption[] = [
  {
    id: 'trial5',
    title: '5-Day Access',
    price: '$4.99',
    description: 'Try the full slate for 5 days',
    features: ['No auto-renew', 'Full K6 slate', 'Cancel anytime'],
  },
  {
    id: 'monthly',
    title: 'Monthly',
    price: '$9.99/mo',
    description: 'Flexible monthly billing',
    features: ['Cancel anytime', 'Full K6 slate', 'Monthly billing'],
  },
  {
    id: 'annual',
    title: 'Annual',
    price: '$89.99/yr',
    description: 'Best value — save 25%',
    badge: 'BEST VALUE',
    features: ['Save 25%', 'Full K6 slate', 'Annual billing'],
  },
];

const featureComparison = [
  { feature: 'Full K6 Slate', free: 'Sample only', premium: 'Yes' },
  { feature: 'Signal Checks', free: '1/day', premium: 'Unlimited' },
  { feature: 'Budget Planner', free: 'No', premium: 'Yes' },
  { feature: 'Live Updates', free: '15-min delay', premium: 'Real-time' },
  { feature: 'Detailed Reasons', free: 'Summary only', premium: 'Full details' },
  { feature: 'Previous Matches', free: 'Summary', premium: 'Complete history' },
];

export default function PaywallScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { plan } = useLocalSearchParams<{ plan?: SubscriptionPlan }>();
  const { setRole } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(plan || 'trial5');

  const handleSubscribe = async () => {
    try {
      // TODO: wire RevenueCat SDK here
      await setRole('premium');
      
      Alert.alert(
        'Welcome to Premium!',
        'Your subscription is now active. Enjoy full access to HitMaster!',
        [
          {
            text: 'Get Started',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      console.error('Purchase failed:', error);
      Alert.alert('Purchase Failed', 'Please try again or contact support.');
    }
  };

  const handleRestore = async () => {
    try {
      // Phase 3: Live restore purchases (placeholder)
      // TODO: wire RevenueCat restore here
      await setRole('premium');
      
      Alert.alert(
        'Purchases Restored',
        'Your subscription has been restored successfully!',
        [
          {
            text: 'Continue',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      console.error('Restore failed:', error);
      Alert.alert('Restore Failed', 'No active subscriptions found.');
    }
  };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Section — verified-rate claim, no marketing fluff */}
        <View style={styles.hero}>
          <Text style={styles.heroBigNum} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{VERIFIED_HIT_RATE}%</Text>
          <Text style={styles.heroBigSub}>verified match rate</Text>
          <Text style={styles.heroCompare}>vs ~7% random chance</Text>
          <Text style={styles.heroTitle}>Unlock the full K6 slate</Text>
        </View>

        {/* Feature Comparison */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          <View style={styles.comparisonTable}>
            <View style={styles.comparisonHeader}>
              <Text style={styles.comparisonHeaderText}>Feature</Text>
              <Text style={styles.comparisonHeaderText}>Free</Text>
              <Text style={styles.comparisonHeaderText}>Premium</Text>
            </View>
            {featureComparison.map((item, index) => (
              <View key={item.feature} style={styles.comparisonRow}>
                <Text style={styles.comparisonFeature}>{item.feature}</Text>
                <Text style={styles.comparisonFree}>{item.free}</Text>
                <View style={styles.comparisonPremium}>
                  <Check size={16} color={colors.success} />
                  <Text style={styles.comparisonPremiumText}>{item.premium}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Plan Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          <View style={styles.plansContainer}>
            {plans.map((planOption) => (
              <TouchableOpacity
                key={planOption.id}
                style={[
                  styles.planCard,
                  selectedPlan === planOption.id && styles.planCardSelected
                ]}
                onPress={() => setSelectedPlan(planOption.id)}
              >
                {planOption.badge && (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{planOption.badge}</Text>
                  </View>
                )}
                <Text style={styles.planTitle}>{planOption.title}</Text>
                <Text style={styles.planPrice}>{planOption.price}</Text>
                <Text style={styles.planDescription}>{planOption.description}</Text>
                <View style={styles.planFeatures}>
                  {planOption.features.map((feature) => (
                    <View key={feature} style={styles.planFeature}>
                      <Check size={14} color={colors.success} />
                      <Text style={styles.planFeatureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
            <Text style={styles.subscribeButtonText}>
              Subscribe {selectedPlanData?.title} - {selectedPlanData?.price}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
            <Text style={styles.restoreButtonText}>Restore Purchase</Text>
          </TouchableOpacity>

          <View style={styles.legalLinks}>
            <TouchableOpacity>
              <Text style={styles.legalText}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}>•</Text>
            <TouchableOpacity>
              <Text style={styles.legalText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    gap: 4,
  },
  heroBigNum: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.cyan,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: -2,
    lineHeight: 68,
  },
  heroBigSub: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  heroCompare: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: theme.spacing.lg,
  },
  comparisonTable: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  comparisonHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  comparisonHeaderText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  comparisonFeature: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: colors.text,
  },
  comparisonFree: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  comparisonPremium: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  comparisonPremiumText: {
    fontSize: theme.typography.fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
  plansContainer: {
    gap: theme.spacing.md,
  },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  planBadge: {
    position: 'absolute',
    top: -8,
    right: theme.spacing.lg,
    backgroundColor: colors.warning,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
  },
  planBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: 'bold',
    color: colors.text,
  },
  planTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: theme.spacing.xs,
  },
  planPrice: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: theme.spacing.xs,
  },
  planDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  planFeatures: {
    gap: theme.spacing.xs,
  },
  planFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  planFeatureText: {
    fontSize: theme.typography.fontSize.sm,
    color: colors.textSecondary,
  },
  ctaSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  subscribeButton: {
    backgroundColor: colors.primary,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  subscribeButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: colors.text,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  restoreButtonText: {
    fontSize: theme.typography.fontSize.md,
    color: colors.primary,
    fontWeight: '600',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  legalText: {
    fontSize: theme.typography.fontSize.xs,
    color: colors.textTertiary,
  },
  legalSeparator: {
    fontSize: theme.typography.fontSize.xs,
    color: colors.textTertiary,
  },
});