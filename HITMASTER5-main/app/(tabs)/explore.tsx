import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { SCOPES } from '@/constants/pairClasses';
import { EmptyState } from '@/components/EmptyState';
import { StatusRibbon } from '@/components/StatusRibbon';
import { SlateCard } from '@/components/SlateCard';
import { ScopeSwitcher } from '@/components/ScopeSwitcher';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useScope } from '@/hooks/useScope';
import { useDataIngestion } from '@/hooks/useDataIngestion';

function toComboSet(combo: string): string {
  const arr = combo.split('');
  arr.sort();
  return `{${arr.join(',')}}`;
}

export default function ExploreScreen() {
  const { snapshot, refreshSnapshot } = useSnapshot();
  const { scope } = useScope();
  const { regenerateSlate } = useDataIngestion();
  const [regenOpen, setRegenOpen] = useState<boolean>(false);
  const [regenState, setRegenState] = useState<{ status: 'idle' | 'busy' | 'missing' | 'noop' | 'success' | 'error'; message: string } | null>(null);
  const [isRegenLoading, setIsRegenLoading] = useState<boolean>(false);

  const handleGenerate = useCallback(async () => {
    try {
      setIsRegenLoading(true);
      const res = await regenerateSlate(scope);
      setRegenState({ status: res.status, message: res.message });
      setRegenOpen(true);
      // Add a longer delay to ensure database consistency
      setTimeout(async () => {
        await refreshSnapshot();
      }, 3000);
    } catch (error) {
      console.log('[Explore] Regeneration error:', error);
      setRegenState({ status: 'error', message: 'Failed to trigger regeneration' });
      setRegenOpen(true);
    } finally {
      setIsRegenLoading(false);
    }
  }, [regenerateSlate, scope, refreshSnapshot]);

  const items = useMemo(() => {
    const list = snapshot?.top_k_straights_json ?? [];
    const components = snapshot?.components_json ?? [];
    
    console.log('[Explore] Rendering items with snapshot:', {
      hasSnapshot: !!snapshot,
      snapshotId: snapshot?.id,
      snapshotScope: snapshot?.scope,
      snapshotHash: snapshot?.hash?.slice(0, 8),
      listLength: Array.isArray(list) ? list.length : 0,
      componentsLength: components?.length ?? 0,
      currentScope: scope
    });
    
    if (!Array.isArray(list) || list.length === 0) {
      console.log('[Explore] No slate data - showing placeholders');
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
      if (typeof row === 'string') {
        const combo = row as string;
        const componentData = components.find(c => c.combo === combo);
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
      // Handle TopKStraightRow objects
      const r = row as any; // TopKStraightRow
      const combo = r.combo ?? '---';
      const temperature = typeof r.indicator === 'number' ? r.indicator * 100 : undefined;
      return {
        rank: idx + 1,
        combo,
        comboSet: toComboSet(combo),
        placeholder: false,
        temperature,
        components: { BOX: Number(r.box ?? 0), PBURST: Number(r.pburst ?? 0), CO: Number(r.co ?? 0) },
        multiplicity: undefined,
        topPair: undefined,
      };
    });
    
    console.log('[Explore] Rendered items sample:', renderedItems.slice(0, 3));
    return renderedItems;
  }, [snapshot, scope]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <StatusRibbon />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>K6 Slates</Text>
          <Text style={styles.scopePill}>Scope: {SCOPES[scope as keyof typeof SCOPES]?.label || scope}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.generateBtn}
            onPress={handleGenerate}
            disabled={isRegenLoading}
            testID="generate-slate-slates"
          >
            <RefreshCw size={16} color={theme.colors.text} />
            <Text style={styles.generateBtnText}>{isRegenLoading ? 'Generating…' : 'Generate Slate'}</Text>
          </TouchableOpacity>
          <ScopeSwitcher />
        </View>
      </View>

      <ScrollView style={styles.content}>
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
        
        {(!snapshot || !Array.isArray(snapshot.top_k_straights_json) || snapshot.top_k_straights_json.length === 0) && (
          <View style={styles.emptyContainer}>
            <EmptyState
              icon={RefreshCw}
              title="No snapshot yet"
              message="Press Generate Slate to create a live snapshot from imports."
            />
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="regen-outcome-sheet-slates">
            <Text style={styles.modalTitle}>Regenerate Slate</Text>
            <Text style={styles.modalBody}>{regenState?.message ?? '—'}</Text>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setRegenOpen(false)} testID="regen-close-slates">
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  content: {
    flex: 1,
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
  slateContainer: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  modalBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  modalTitle: { color: theme.colors.text, fontSize: theme.typography.fontSize.lg, fontWeight: '700' as const },
  modalBody: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.md, marginTop: theme.spacing.xs },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  modalBtn: { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.borderRadius.sm },
  modalBtnText: { color: theme.colors.text, fontWeight: '600' as const },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyContainer: {
    padding: theme.spacing.lg,
  },
});