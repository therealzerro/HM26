import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Clock, Bell, Zap, Target, TrendingUp, Shield, BarChart3, Users } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';

interface ComingSoonFeature {
  id: string;
  name: string;
  description: string;
  launchDate: Date;
  progress: 'build' | 'qa' | 'launch';
  earlyAccess?: boolean;
}

const COMING_SOON_FEATURES: ComingSoonFeature[] = [
  {
    id: 'hitmaster-3-straight',
    name: 'HitMaster 3 Straight',
    description: 'Advanced 3-digit straight play analysis with position-specific insights',
    launchDate: new Date('2025-12-15'),
    progress: 'build',
    earlyAccess: true
  },
  {
    id: 'hitmaster-3-state',
    name: 'HitMaster 3 State',
    description: 'Multi-state data aggregation and cross-state pattern recognition',
    launchDate: new Date('2026-01-20'),
    progress: 'build'
  },
  {
    id: 'hitmaster-4-box',
    name: 'HitMaster 4 Box',
    description: '4-digit box combination analysis with enhanced prediction models',
    launchDate: new Date('2026-03-10'),
    progress: 'build'
  }
];

const UNDER_THE_HOOD_FEATURES = [
  'Multi-pass scoring v2 (recency/presence/integrity/heat/verification)',
  'Pattern-aware combos (co-occurrence without overfitting)',
  'Adaptive heat model (per-state decay, cold-start smoothing)',
  'Backtest harness (fixed-seed replays; diagnostics)',
  'Explainability (rationale, factor breakdown, lineage)',
  'Risk tiers (conservative/standard/aggressive probability ranges)'
];

function getTimeUntilLaunch(launchDate: Date): string {
  const now = new Date();
  const diff = launchDate.getTime() - now.getTime();
  
  if (diff <= 0) return 'Available Now!';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'}`;
  } else {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
}

function getProgressIcon(progress: ComingSoonFeature['progress']) {
  switch (progress) {
    case 'build':
      return <Zap size={16} color={theme.colors.warning} />;
    case 'qa':
      return <Shield size={16} color={theme.colors.primary} />;
    case 'launch':
      return <Target size={16} color={theme.colors.success} />;
  }
}

function getProgressText(progress: ComingSoonFeature['progress']) {
  switch (progress) {
    case 'build':
      return 'In Build';
    case 'qa':
      return 'QA Testing';
    case 'launch':
      return 'Ready to Launch';
  }
}

export default function ComingSoonScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [notifyEmails, setNotifyEmails] = useState<Set<string>>(new Set());
  const [countdowns, setCountdowns] = useState<Record<string, string>>({});

  const isPlus = user?.role === 'admin';

  useEffect(() => {
    const updateCountdowns = () => {
      const newCountdowns: Record<string, string> = {};
      COMING_SOON_FEATURES.forEach(feature => {
        newCountdowns[feature.id] = getTimeUntilLaunch(feature.launchDate);
      });
      setCountdowns(newCountdowns);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const handleNotifyMe = (featureId: string) => {
    setNotifyEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Coming Soon</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <Clock size={48} color={theme.colors.primary} />
          <Text style={styles.heroTitle}>The Future of HitMaster</Text>
          <Text style={styles.heroSubtitle}>
            Exciting new features are in development. Be the first to know when they launch!
          </Text>
        </View>

        {/* Coming Soon Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Upcoming Features</Text>
          {COMING_SOON_FEATURES.map((feature) => (
            <View key={feature.id} style={styles.featureCard}>
              <View style={styles.featureHeader}>
                <View style={styles.featureInfo}>
                  <Text style={styles.featureName}>{feature.name}</Text>
                  <View style={styles.featureProgress}>
                    {getProgressIcon(feature.progress)}
                    <Text style={styles.featureProgressText}>
                      {getProgressText(feature.progress)}
                    </Text>
                  </View>
                </View>
                <View style={styles.featureCountdown}>
                  <Text style={styles.countdownText}>
                    {countdowns[feature.id] || 'Loading...'}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.featureDescription}>{feature.description}</Text>
              
              {feature.earlyAccess && isPlus && (
                <View style={styles.earlyAccessBadge}>
                  <Text style={styles.earlyAccessText}>Early Access Available</Text>
                </View>
              )}
              
              <TouchableOpacity
                style={[
                  styles.notifyButton,
                  notifyEmails.has(feature.id) && styles.notifyButtonActive
                ]}
                onPress={() => handleNotifyMe(feature.id)}
              >
                <Bell size={16} color={
                  notifyEmails.has(feature.id) ? theme.colors.text : theme.colors.primary
                } />
                <Text style={[
                  styles.notifyButtonText,
                  notifyEmails.has(feature.id) && styles.notifyButtonTextActive
                ]}>
                  {notifyEmails.has(feature.id) ? 'Notifications On' : 'Notify Me'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Under the Hood */}
        <View style={styles.underTheHoodSection}>
          <Text style={styles.sectionTitle}>Under the Hood</Text>
          <Text style={styles.underTheHoodSubtitle}>
            Our internal enhancements in flight to make HitMaster even more powerful:
          </Text>
          <View style={styles.underTheHoodList}>
            {UNDER_THE_HOOD_FEATURES.map((feature) => (
              <View key={feature} style={styles.underTheHoodItem}>
                <View style={styles.underTheHoodBullet} />
                <Text style={styles.underTheHoodText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Stats Section */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Development Progress</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <BarChart3 size={24} color={theme.colors.primary} />
              <Text style={styles.statNumber}>3</Text>
              <Text style={styles.statLabel}>Features in Build</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={24} color={theme.colors.success} />
              <Text style={styles.statNumber}>85%</Text>
              <Text style={styles.statLabel}>Overall Progress</Text>
            </View>
            <View style={styles.statCard}>
              <Users size={24} color={theme.colors.warning} />
              <Text style={styles.statNumber}>1.2K+</Text>
              <Text style={styles.statLabel}>Beta Testers</Text>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>Stay in the Loop</Text>
          <Text style={styles.ctaSubtitle}>
            Get notified when new features launch and be among the first to try them.
          </Text>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.ctaButtonText}>Upgrade to Premium</Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  backButton: {
    padding: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  heroTitle: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  heroSubtitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  featuresSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  featureCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.soft,
  },
  featureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  featureInfo: {
    flex: 1,
  },
  featureName: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  featureProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  featureProgressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  featureCountdown: {
    alignItems: 'flex-end',
  },
  countdownText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  featureDescription: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  earlyAccessBadge: {
    backgroundColor: theme.colors.premium + '20',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  earlyAccessText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: 'bold',
    color: theme.colors.premium,
  },
  notifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  notifyButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  notifyButtonText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  notifyButtonTextActive: {
    color: theme.colors.text,
  },
  underTheHoodSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  underTheHoodSubtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  underTheHoodList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  underTheHoodItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  underTheHoodBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
    marginTop: 6,
  },
  underTheHoodText: {
    flex: 1,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 18,
  },
  statsSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statNumber: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontFamily: theme.typography.fontFamily.tabular,
  },
  statLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  ctaSection: {
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  ctaSubtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  ctaButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  ctaButtonText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
});