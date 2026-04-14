import React, { useMemo, useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Crown, Thermometer, DollarSign, BookOpen, Zap, TrendingUp, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { SCOPES } from '@/constants/pairClasses';
import { StatusRibbon } from '@/components/StatusRibbon';
import { ScopeSwitcher } from '@/components/ScopeSwitcher';
import { SlateCard } from '@/components/SlateCard';
import { PremiumGate } from '@/components/PremiumGate';
import { TierBadge } from '@/components/TierBadge';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';

import { useAuth } from '@/hooks/useAuth';
import { TopKStraightRow } from '@/types/core';

function toComboSet(combo: string): string {
  const arr = combo.split('').map((c) => c as string).sort();
  return `{${arr.join(',')}}`;
}

export default function HomeScreen() {
  const { snapshot, refreshSnapshot, isLoading: snapshotLoading } = useSnapshot();
  const { user } = useAuth();
  const { scope } = useScope();
  const { regenerateSlate } = useDataIngestion();
  const insets = useSafeAreaInsets();
  const [regenOpen, setRegenOpen] = useState<boolean>(false);
  const [regenState, setRegenState] = useState<{ status: 'idle' | 'busy' | 'missing' | 'noop' | 'success' | 'error'; message: string } | null>(null);
  const [isRegenLoading, setIsRegenLoading] = useState<boolean>(false);
  
  const getUserTier = () => {
    if (user?.role === 'admin') return 'PLUS';
    if (user?.role === 'premium') return 'PRO';
    return 'FREE';
  };
  
  const currentTier = getUserTier();
  const isFree = currentTier === 'FREE';

  const handleGenerate = useCallback(async () => {
    if (user?.role !== 'admin') {
      router.push('/(tabs)/admin');
      return;
    }
    try {
      setIsRegenLoading(true);
      console.log('[Home] Starting slate regeneration for scope:', scope);
      
      const res = await regenerateSlate(scope);
      console.log('[Home] Regeneration result:', res);
      
      setRegenState({ status: res.status, message: res.message });
      setRegenOpen(true);
      
      // Refresh snapshot deterministically
      if (res.status === 'success') {
        console.log('[Home] Regeneration successful, refreshing snapshot');
        await refreshSnapshot();
      }
    } catch (error) {
      console.log('[Home] Regeneration error:', error);
      setRegenState({ status: 'error', message: 'Failed to trigger regeneration' });
      setRegenOpen(true);
    } finally {
      setIsRegenLoading(false);
    }
  }, [user?.role, regenerateSlate, scope, refreshSnapshot]);

  // Check if we have valid slate data for current scope
  const hasValidSlateData = useMemo(() => {
    if (!snapshot) {
      console.log('[Home] No snapshot available');
      return false;
    }
    const topK = snapshot.top_k_straights_json;
    const isValid = Array.isArray(topK) && topK.length > 0;
    console.log('[Home] Slate data validation:', {
      hasSnapshot: !!snapshot,
      topKType: typeof topK,
      topKIsArray: Array.isArray(topK),
      topKLength: Array.isArray(topK) ? topK.length : 0,
      isValid
    });
    return isValid;
  }, [snapshot]);

  const items = useMemo(() => {
    const list = snapshot?.top_k_straights_json ?? [];
    const components = snapshot?.components_json ?? [];
    
    console.log('[Home] Rendering items with snapshot:', {
      hasSnapshot: !!snapshot,
      snapshotId: snapshot?.id,
      snapshotScope: snapshot?.scope,
      snapshotHash: snapshot?.hash?.slice(0, 8),
      listLength: Array.isArray(list) ? list.length : 0,
      componentsLength: components?.length ?? 0,
      currentScope: scope,
      hasValidSlateData,
      isLoading: snapshotLoading,
      snapshotUpdatedAt: snapshot?.updated_at_et,
      listSample: Array.isArray(list) ? list.slice(0, 3) : [],
      componentsSample: Array.isArray(components) ? components.slice(0, 3) : []
    });
    
    if (!Array.isArray(list) || list.length === 0) {
      console.log('[Home] No slate data - showing placeholders');
      // Create more realistic placeholder data
      const placeholderCombos = ['123', '456', '789', '012', '345', '678', '901', '234', '567', '890'];
      return Array.from({ length: 10 }).map((_, i) => ({ 
        rank: i + 1, 
        combo: placeholderCombos[i] || '---', 
        comboSet: placeholderCombos[i] ? `{${placeholderCombos[i].split('').sort().join(',')}}` : '{-, -, -}', 
        placeholder: true,
        temperature: undefined,
        components: undefined,
        multiplicity: undefined,
        topPair: undefined,
      }));
    }
    
    const renderedItems = list.slice(0, 10).map((row, idx) => {
      // Handle string array format (simple combo list)
      if (typeof row === 'string') {
        const combo = row as string;
        const componentData = Array.isArray(components) ? components.find((c: any) => c?.combo === combo) : null;
        
        console.log(`[Home] Processing string combo ${combo}:`, {
          componentData,
          hasComponents: !!componentData,
          componentsType: typeof componentData
        });
        
        return {
          rank: idx + 1,
          combo,
          comboSet: toComboSet(combo),
          placeholder: false,
          temperature: componentData?.temperature,
          components: componentData?.components,
          multiplicity: componentData?.multiplicity,
          topPair: componentData?.topPair,
        };
      }
      
      // Handle object format (TopKStraightRow)
      const r = row as TopKStraightRow;
      const combo = r.combo ?? '---';
      const temperature = typeof r.indicator === 'number' ? r.indicator * 100 : undefined;
      
      console.log(`[Home] Processing object combo ${combo}:`, {
        row: r,
        temperature,
        hasBox: 'box' in r,
        hasPburst: 'pburst' in r,
        hasCo: 'co' in r
      });
      
      return {
        rank: idx + 1,
        combo,
        comboSet: toComboSet(combo),
        placeholder: false,
        temperature,
        components: { 
          BOX: Number(r.box ?? 0), 
          PBURST: Number(r.pburst ?? 0), 
          CO: Number(r.co ?? 0) 
        },
        multiplicity: r.multiplicity as 'singles' | 'doubles' | 'triples' | undefined,
        topPair: r.topPair,
      };
    });
    
    console.log('[Home] Rendered items sample:', renderedItems.slice(0, 3));
    return renderedItems;
  }, [snapshot, scope, snapshotLoading, hasValidSlateData]);



  console.log('Home screen rendered with tier:', currentTier, 'isFree:', isFree);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusRibbon />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        // Custom pull-to-refresh would go here
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <Crown size={48} color={theme.colors.crownGold} />
            <Text style={styles.heroTitle}>Today&apos;s Heat</Text>
            <Text style={styles.heroSubtitle}>Turn today&apos;s heat into smart picks</Text>
            <View style={styles.tierBadgeContainer}>
              <TierBadge tier={currentTier} size="large" />
            </View>
          </View>
          
          {/* Heat Meter */}
          <View style={styles.heatMeter}>
            <View style={styles.heatMeterTrack}>
              <View style={[styles.heatMeterFill, { width: '75%' }]} />
            </View>
            <Text style={styles.heatMeterText}>Heat Level: High 🔥</Text>
          </View>
        </View>

        {/* Action Cards */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => console.log('Heat Checker - Coming Soon')}
            >
              <Thermometer size={24} color={theme.colors.primary} />
              <Text style={styles.actionTitle}>Heat Checker</Text>
              <Text style={styles.actionSubtitle}>{isFree ? '1/day' : 'Unlimited'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => console.log('Pick by Budget - Coming Soon')}
            >
              <DollarSign size={24} color={theme.colors.success} />
              <Text style={styles.actionTitle}>Pick by Budget</Text>
              <Text style={styles.actionSubtitle}>Smart allocation</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => console.log('Learn - Coming Soon')}
            >
              <BookOpen size={24} color={theme.colors.warning} />
              <Text style={styles.actionTitle}>Learn</Text>
              <Text style={styles.actionSubtitle}>Strategies & tips</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => router.push('/paywall')}
            >
              <Zap size={24} color={theme.colors.crownGold} />
              <Text style={styles.actionTitle}>Go Premium</Text>
              <Text style={styles.actionSubtitle}>Unlock all features</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Trial Banner for Free Users */}
        {isFree && (
          <View style={styles.trialBanner}>
            <Crown size={20} color={theme.colors.crownGold} />
            <View style={styles.trialContent}>
              <Text style={styles.trialTitle}>Try Premium 5 Days — $4.99</Text>
              <Text style={styles.trialSubtitle}>See the full slate, not just the sample</Text>
            </View>
            <TouchableOpacity 
              style={styles.trialButton}
              onPress={() => router.push('/paywall')}
            >
              <Text style={styles.trialButtonText}>Try Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Slate Section */}
        <View style={styles.slateSection}>
          <View style={styles.slateSectionHeader}>
            <View style={styles.slateSectionHeaderLeft}>
              <Text style={styles.sectionTitle}>
                {isFree ? 'K6 Slate' : 'K6 Slate'}
              </Text>
              <Text style={styles.scopePill}>Scope: {SCOPES[scope as keyof typeof SCOPES]?.label || scope}</Text>
            </View>
            <View style={styles.slateSectionHeaderRight}>
              {(!hasValidSlateData || snapshotLoading) && (
                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={handleGenerate}
                  disabled={isRegenLoading}
                  testID="generate-slate-home"
                >
                  <RefreshCw size={16} color={theme.colors.text} />
                  <Text style={styles.generateBtnText}>
                    {isRegenLoading ? 'Generating…' : user?.role === 'admin' ? 'Generate Slate' : 'Ask Admin'}
                  </Text>
                </TouchableOpacity>
              )}
              <ScopeSwitcher />
            </View>
          </View>
          
          {isFree ? (
            <PremiumGate 
              requiredTier="PRO" 
              feature="Full K-Slate" 
              description="See the complete ranked list with detailed analysis"
            >
              <View style={styles.slateContainer}>
                {items.slice(0, 3).map((item) => (
                  <SlateCard
                    key={`slate-${item.rank}`}
                    rank={item.rank}
                    combo={item.combo}
                    comboSet={item.comboSet}
                    placeholder={item.placeholder}
                    temperature={item.temperature}
                    components={item.components}
                    multiplicity={item.multiplicity}
                    topPair={item.topPair}
                  />
                ))}
              </View>
            </PremiumGate>
          ) : (
            <View style={styles.slateContainer}>
              {items.map((item) => (
                <SlateCard
                  key={`slate-${item.rank}`}
                  rank={item.rank}
                  combo={item.combo}
                  comboSet={item.comboSet}
                  placeholder={item.placeholder}
                  temperature={item.temperature}
                  components={item.components}
                  multiplicity={item.multiplicity}
                  topPair={item.topPair}
                />
              ))}
            </View>
          )}
          {/* Regen Outcome Modal */}
          <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard} testID="regen-outcome-sheet">
                <View style={styles.modalHeader}>
                  {regenState?.status === 'success' ? (
                    <CheckCircle2 size={18} color={theme.colors.success} />
                  ) : regenState?.status === 'noop' ? (
                    <AlertCircle size={18} color={theme.colors.warning} />
                  ) : regenState?.status === 'busy' || regenState?.status === 'missing' || regenState?.status === 'error' ? (
                    <AlertCircle size={18} color={theme.colors.error} />
                  ) : (
                    <RefreshCw size={18} color={theme.colors.text} />
                  )}
                  <Text style={styles.modalTitle}>Regenerate Slate</Text>
                </View>
                <Text style={styles.modalBody}>{regenState?.message ?? '—'}</Text>
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity style={styles.modalBtn} onPress={() => setRegenOpen(false)} testID="regen-close">
                    <Text style={styles.modalBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => { setRegenOpen(false); router.push('/(tabs)/admin'); }} testID="regen-open-admin">
                    <Text style={styles.modalBtnText}>Open Admin</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>

        {/* Recent Winners */}
        <View style={styles.winnersSection}>
          <Text style={styles.sectionTitle}>Recent Winners</Text>
          <View style={styles.winnersGrid}>
            <View style={styles.winnerCard}>
              <Text style={styles.winnerCombo}>123</Text>
              <Text style={styles.winnerBadge}>✅ Hit Yesterday</Text>
            </View>
            <View style={styles.winnerCard}>
              <Text style={styles.winnerCombo}>456</Text>
              <Text style={styles.winnerBadge}>✅ Hit 2 days ago</Text>
            </View>
            <View style={styles.winnerCard}>
              <Text style={styles.winnerCombo}>789</Text>
              <Text style={styles.winnerBadge}>✅ Hit 3 days ago</Text>
            </View>
          </View>
        </View>

        {/* Engine Status */}
        <View style={styles.engineSection}>
          <Text style={styles.sectionTitle}>Engine Status</Text>
          <View style={styles.engineCard}>
            <TrendingUp size={20} color={snapshot ? theme.colors.success : theme.colors.warning} />
            <View style={styles.engineContent}>
              <Text style={styles.engineTitle}>ZK6 Analytics Engine</Text>
              <Text style={styles.engineSubtitle}>
                {hasValidSlateData 
                  ? `Live Data Connected • Hash: ${snapshot?.hash?.slice(0, 8) || 'N/A'}` 
                  : 'No Slate Available for scope'}
              </Text>
            </View>
            <View style={styles.engineStatus}>
              <View style={[styles.statusDot, { 
                backgroundColor: hasValidSlateData 
                  ? theme.colors.success 
                  : theme.colors.warning 
              }]} />
            </View>
          </View>
        </View>

        {/* Responsible Play Footer */}
        <View style={styles.responsiblePlay}>
          <Text style={styles.responsiblePlayText}>
            Play responsibly. Gambling can be addictive. Set limits and know when to stop.
          </Text>
          <TouchableOpacity>
            <Text style={styles.responsiblePlayLink}>Learn More</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  hero: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  heroContent: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  heroTitle: {
    fontSize: theme.typography.fontSize.xxxl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  heroSubtitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  tierBadgeContainer: {
    marginTop: theme.spacing.sm,
  },
  heatMeter: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  heatMeterTrack: {
    width: '80%',
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    overflow: 'hidden',
  },
  heatMeterFill: {
    height: '100%',
    backgroundColor: theme.colors.hotGlow,
    borderRadius: theme.borderRadius.full,
  },
  heatMeterText: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.text,
    fontWeight: '600',
  },
  actionsSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  actionCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  actionTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  actionSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.premium + '20',
    borderRadius: theme.borderRadius.xxl,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.premium + '40',
  },
  trialContent: {
    flex: 1,
  },
  trialTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  trialSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  trialButton: {
    backgroundColor: theme.colors.premium,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
  },
  trialButtonText: {
    color: theme.colors.text,
    fontWeight: 'bold',
    fontSize: theme.typography.fontSize.md,
  },
  slateSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  slateSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  slateContainer: {
    gap: theme.spacing.sm,
  },
  scopePill: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  generateBtnText: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  modalBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  modalTitle: { color: theme.colors.text, fontSize: theme.typography.fontSize.lg, fontWeight: '700' as const },
  modalBody: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.md, marginTop: theme.spacing.xs },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  modalBtn: { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.borderRadius.sm },
  modalBtnSecondary: { backgroundColor: theme.colors.primary + '20', borderWidth: 1, borderColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.borderRadius.sm },
  modalBtnText: { color: theme.colors.text, fontWeight: '600' as const },
  winnersSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  winnersGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  winnerCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  winnerCombo: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.success,
    fontFamily: theme.typography.fontFamily.tabular,
  },
  winnerBadge: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.success,
    fontWeight: '600',
  },
  engineSection: {
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  engineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  engineContent: {
    flex: 1,
  },
  engineTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  engineSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  engineStatus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  responsiblePlay: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  responsiblePlayText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
  responsiblePlayLink: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  slateSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  slateSectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});