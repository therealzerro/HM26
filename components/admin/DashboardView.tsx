import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getTomorrowET, getYesterdayET } from '@/lib/dateUtils';
import { runHitDetectionAllScopes, runHitDetectionAndRefresh, HitDetectionResult } from '@/lib/hitDetection';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';
import { computeZK30Slate } from '@/engines/zk30';
import { Pill, SectionTitle, Card, timeAgo, MOCK_IMPORTS, useImportTypes, PAIR_CLASSES, ImportRecord } from './AdminShared';
import { ProposalRegenBanner } from './ProposalRegenBanner';

export default function DashboardView({ setView, imports, healthMetrics, regenerateSlate, checkSlateLock, onOpenZK30Import }: {
  setView: (v: string) => void;
  imports: any[];
  healthMetrics: any;
  regenerateSlate: (scope: any, weightsKey?: any, force?: boolean) => Promise<any>;
  checkSlateLock: (scope: any, date?: string) => Promise<boolean>;
  onOpenZK30Import: (type: 'box_history' | 'pair_history') => void;
}) {
  const { colors } = useTheme();
  const IMPORT_TYPES = useImportTypes();
  const liveImports = (imports && imports.length > 0) ? imports : MOCK_IMPORTS;
  const completed = liveImports.filter(i => i.status === 'completed').length;
  const failed = liveImports.filter(i => i.status === 'failed').length;
  const totalAccepted = liveImports.reduce((s, i) => s + (i.accepted || 0), 0);

  const queryClient = useQueryClient();

  // Pipeline Status state
  const [regenProgress, setRegenProgress] = useState<string>('');
  const [isRegening, setIsRegening] = useState(false);
  const [regeningScopeMap, setRegeningScopeMap] = useState<Record<string, boolean>>({});
  const [targetDateOption, setTargetDateOption] = useState<'today' | 'tomorrow'>('today');

  // Hit Detection state
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState('');
  const [detectResult, setDetectResult] = useState<HitDetectionResult | null>(null);

  // Full Daily Workflow state
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState('');

  // Clear Top 30 state
  const [clearingIntel, setClearingIntel] = useState<string | null>(null);
  const [clearIntelResult, setClearIntelResult] = useState<string | null>(null);

  // Today's Import Checklist state
  const [todayImports, setTodayImports] = useState<any[]>([]);
  const [weeklyImports, setWeeklyImports] = useState<any[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // ZK30 Single State state
  const [zk30Jurisdiction, setZk30Jurisdiction] = useState<string>('TX');
  const [zk30BusyMap, setZk30BusyMap] = useState<Record<string, boolean>>({});
  const [zk30StatusMap, setZk30StatusMap] = useState<Record<string, string>>({});
  // ZK30 hit detection state (ARCH-06 step 7.4)
  const [zk30HitBusy, setZk30HitBusy] = useState<boolean>(false);
  const [zk30HitStatus, setZk30HitStatus] = useState<string>('');

  useEffect(() => {
    const todayStart = new Date(getTodayET() + 'T05:00:00.000Z').toISOString();
    Promise.all([
      fetchFromSupabase<any[]>({
        path: `/rest/v1/imports?created_at=gte.${encodeURIComponent(todayStart)}&status=eq.completed&deleted_at=is.null&select=type,scope,counts,created_at&order=created_at.desc`,
      }).catch(() => []),
      fetchFromSupabase<any[]>({
        path: '/rest/v1/imports?type=in.(box_history,pair_history)&status=eq.completed&deleted_at=is.null&select=type,scope,horizon_label,created_at&order=created_at.desc&limit=500',
      }).catch(() => []),
    ]).then(([daily, weekly]) => {
      setTodayImports(Array.isArray(daily) ? daily : []);
      setWeeklyImports(Array.isArray(weekly) ? weekly : []);
    }).finally(() => setChecklistLoading(false));
  }, []);

  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; scope: string; isLocked: boolean }>({ visible: false, scope: '', isLocked: false });

  const handleRegenAll = useCallback(async (force?: boolean) => {
    setRegenConfirm({ visible: false, scope: '', isLocked: false });
    setIsRegening(true);
    const date = targetDateOption === 'today' ? getTodayET() : getTomorrowET();
    setRegenProgress(`${force ? 'FORCE ' : ''}Regenerating all slates for ${date}…`);
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];

    try {
      const results = await Promise.all(
        scopes.map(async (sc) => {
          try {
            const res = await regenerateSlate(sc, 'balanced', force, date);
            return `${sc}: ${res.status === 'success' ? '✓' : res.status}`;
          } catch (e) {
            return `${sc}: error`;
          }
        })
      );
      setRegenProgress(results.join('  ·  '));
    } catch (globalErr) {
      setRegenProgress('Critical error during parallel regeneration');
    } finally {
      setIsRegening(false);
      // Invalidate snapshot cache so the slate page picks up the new data immediately
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    }
  }, [regenerateSlate, queryClient, targetDateOption]);

  const handleRegenScope = useCallback(async (sc: 'midday' | 'evening' | 'allday', force?: boolean) => {
    setRegenConfirm({ visible: false, scope: '', isLocked: false });
    setRegeningScopeMap(m => ({ ...m, [sc]: true }));
    const date = targetDateOption === 'today' ? getTodayET() : getTomorrowET();
    try {
      const res = await regenerateSlate(sc, 'balanced', force, date);
      if (res.status !== 'success') {
        Alert.alert('Regeneration Failed', res.message);
      }
    } catch {}
    setRegeningScopeMap(m => ({ ...m, [sc]: false }));
  }, [regenerateSlate, targetDateOption]);

  const requestRegen = async (sc: string) => {
    const isLocked = await checkSlateLock(sc as any);
    setRegenConfirm({ visible: true, scope: sc, isLocked });
  };

  const handleZK30Regen = useCallback(async (scope: 'midday' | 'evening' | 'allday') => {
    setZk30BusyMap(m => ({ ...m, [scope]: true }));
    setZk30StatusMap(m => ({ ...m, [scope]: '' }));
    try {
      await computeZK30Slate({ scope, jurisdiction: zk30Jurisdiction });
      setZk30StatusMap(m => ({ ...m, [scope]: '✓ Done' }));
    } catch (e) {
      setZk30StatusMap(m => ({ ...m, [scope]: '✗ Error' }));
    } finally {
      setZk30BusyMap(m => ({ ...m, [scope]: false }));
    }
  }, [zk30Jurisdiction]);

  // ARCH-06 step 7.4 — POST today's ET date to the ZK30 hit-detection edge fn.
  // lib/hitDetection.ts targets the ZK6 path; ZK30 needs its own invocation.
  // Kept inline (~25 lines) rather than splitting to lib/ until a second
  // consumer appears.
  const handleZK30HitDetection = useCallback(async () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setZk30HitStatus('✗ Supabase config missing');
      return;
    }
    setZk30HitBusy(true);
    setZk30HitStatus('');
    try {
      const res = await fetch(`${url}/functions/v1/run-hit-detection-zk30`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: getTodayET() }),
      });
      const text = await res.text();
      if (!res.ok) {
        setZk30HitStatus(`✗ ${res.status}: ${text.slice(0, 60)}`);
        return;
      }
      try {
        const json = JSON.parse(text);
        const hits = typeof json?.hitsFound === 'number' ? json.hitsFound : 0;
        const picks = typeof json?.picksMatched === 'number' ? json.picksMatched : 0;
        setZk30HitStatus(`✓ ${hits} hit${hits !== 1 ? 's' : ''} across ${picks} pick${picks !== 1 ? 's' : ''}`);
      } catch {
        setZk30HitStatus('✓ Done (response unparsable)');
      }
    } catch (e) {
      setZk30HitStatus(`✗ ${String(e instanceof Error ? e.message : e).slice(0, 60)}`);
    } finally {
      setZk30HitBusy(false);
    }
  }, []);

  const handleFullWorkflow = useCallback(async () => {
    setIsRunningWorkflow(true);
    setWorkflowProgress('Step 1/4: Rebuilding pair datasets…');
    try {
      // Step 1: Refresh datasets_pair.ds_raw from histories. Pair tables are
      // manual-rebuild only (no nightly cron); without this step PBURST + CO
      // pressure scores drift as days pass since the last rebuild. Runs first
      // so hit detection + slate regen below see fresh pair pressure values.
      let pairRebuildMsg = '';
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
          const res = await fetch(`${url}/functions/v1/rebuild-pair-datasets-zk6`, {
            method: 'POST',
            headers: {
              'apikey': key,
              'Authorization': 'Bearer ' + key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dryRun: false }),
          });
          const j = res.ok ? await res.json() : null;
          if (j && typeof j.totalUpdated === 'number') {
            pairRebuildMsg = `Pair rebuild: ${j.totalUpdated} updated (${j.totalFailed ?? 0} failed)`;
          } else {
            pairRebuildMsg = 'Pair rebuild: skipped (non-fatal)';
          }
        }
      } catch (e) {
        // Non-fatal — continue with the rest of the workflow even if pair
        // rebuild fails. The slate will still regenerate against whatever pair
        // state currently exists (which is no worse than the prior workflow's
        // behavior of skipping pair rebuild entirely).
        pairRebuildMsg = 'Pair rebuild: failed (non-fatal)';
      }

      // Step 2/4: refresh per-signal AUC for yesterday so the engine reads
      // fresh rolling-30d values during slate regen. Non-fatal — workflow
      // continues with stale AUC if the call fails. ENH-AFL-1 (2026-05-27).
      setWorkflowProgress(`${pairRebuildMsg} · Step 2/4: Refreshing signal AUC…`);
      let aucRefreshMsg = '';
      try {
        const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
        const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
        if (url && key) {
          const res = await fetch(`${url}/functions/v1/compute-daily-auc-zk6`, {
            method: 'POST',
            headers: {
              'apikey': key,
              'Authorization': 'Bearer ' + key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ dryRun: false }),
          });
          const j = res.ok ? await res.json() : null;
          if (j && typeof j.rowsWritten === 'number') {
            aucRefreshMsg = `AUC refresh: ${j.rowsWritten} rows for ${j.day}`;
          } else {
            aucRefreshMsg = 'AUC refresh: skipped (non-fatal)';
          }
        }
      } catch {
        aucRefreshMsg = 'AUC refresh: failed (non-fatal)';
      }

      setWorkflowProgress(`${pairRebuildMsg} · ${aucRefreshMsg} · Step 3/4: Running hit detection…`);
      const yesterday = getYesterdayET();
      const today = getTodayET();
      let totalHits = 0;
      for (const date of [yesterday, today]) {
        const res = await runHitDetectionAllScopes(date);
        totalHits += res.hitsFound;
      }
      setWorkflowProgress(`${pairRebuildMsg} · ${aucRefreshMsg} · Hit detection done (${totalHits} hit${totalHits !== 1 ? 's' : ''}) · Step 4/4: Regenerating all slates…`);
      const date = targetDateOption === 'today' ? getTodayET() : getTomorrowET();
      const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
      const results = await Promise.all(
        scopes.map(async (sc) => {
          try {
            const res = await regenerateSlate(sc, 'balanced', false, date);
            return res.status === 'success' ? '✓' : res.status;
          } catch { return 'error'; }
        })
      );
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      setWorkflowProgress(`Done · ${pairRebuildMsg} · ${aucRefreshMsg} · Hits detected · Slates: ${results.join(' / ')}`);
    } catch (e) {
      setWorkflowProgress('Workflow error — check logs');
    } finally {
      setIsRunningWorkflow(false);
    }
  }, [targetDateOption, regenerateSlate, queryClient]);

  const handleDetectHits = useCallback(async () => {
    setIsDetecting(true);
    setDetectResult(null);
    setDetectProgress('');
    let totalHits = 0;
    let totalScopes = 0;
    let totalSupplements = 0;
    try {
      const yesterday = getYesterdayET();
      const today = getTodayET();
      for (const date of [yesterday, today]) {
        setDetectProgress(`Running hit detection for all scopes (${date})…`);
        const res = await runHitDetectionAllScopes(date);
        totalHits += res.hitsFound;
        totalScopes += res.scopesChecked;
        totalSupplements += res.supplementsGenerated;
      }
      const combined: HitDetectionResult = { hitsFound: totalHits, scopesChecked: totalScopes, supplementsGenerated: totalSupplements };
      setDetectResult(combined);
      setDetectProgress('');
      if (totalHits > 0 || totalSupplements > 0) {
        queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      }
    } catch (e) {
      console.warn('[dashboard] hit detection error:', e);
      setDetectResult({ hitsFound: 0, scopesChecked: 0, supplementsGenerated: 0 });
      setDetectProgress('');
    } finally {
      setIsDetecting(false);
    }
  }, [queryClient]);

  const handleClearIntel = useCallback(async (date: string) => {
    setClearingIntel(date);
    setClearIntelResult(null);
    try {
      await fetchFromSupabase({
        path: `/rest/v1/daily_intelligence?slate_date=eq.${date}`,
        method: 'PATCH',
        body: { on_slate: false, hit_box: false, hit_straight: false },
      });
      setClearIntelResult(`Cleared Top 30 rows for ${date}`);
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_on_slate'] });
    } catch (e) {
      setClearIntelResult('Clear failed — check RLS policy');
    } finally {
      setClearingIntel(null);
    }
  }, [queryClient]);

  const ACTIONS = [
    { view:'wizard', icon:'📥', title:'Import Wizard', desc:'Box History · Pair History\nDaily Input · Results Ledger' },
    { view:'history', icon:'🗂', title:'Import History', desc:'Browse, review, soft-delete\nand undo past imports' },
    { view:'matrix', icon:'📊', title:'Coverage Matrix', desc:'H01Y–H10Y presence per class\nClick gaps to import' },
    { view:'health', icon:'⚡', title:'Health Tests', desc:'Connection · Snapshots\nDeterminism · Import status' },
    { view:'engine', icon:'⚙️', title:'Engine Config', desc:'Signal weights · Rail controls\nDrawing confidence · Defaults' },
    { view:'adaptive', icon:'🧠', title:'Adaptive Learning', desc:'Track hit rates · Bayesian\nweight suggestions' },
    { view:'performance', icon:'🎯', title:'Performance', desc:'Slate vs ledger hit rates\nAll-time stats · Hit streaks' },
    { view:'nationwide', icon:'🌎', title:'Nationwide Play', desc:'Configure Pro feature URL\nfor multi-state play guide' },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32 }}>
      <ProposalRegenBanner onOpenProposals={() => setView('proposals')} />
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 4 }}>🔐 Creator Dashboard</Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 20 }}>Data pipeline · ZK6 engine management · System health</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {[
          { i:'📥', v: liveImports.length, l:'Total Imports', c: colors.primary },
          { i:'✅', v: completed, l:'Completed', c: colors.success },
          { i:'❌', v: failed, l:'Failed', c: colors.error },
          { i:'📊', v: totalAccepted.toLocaleString(), l:'Rows Accepted', c: colors.teal },
        ].map(stat => (
          <Card key={stat.l} style={{ flex: 1, minWidth: 120, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>{stat.i}</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: stat.c, fontFamily: theme.typography.fontFamily.monoBold, lineHeight: 20, marginBottom: 2 }}>{stat.v}</Text>
            <Text style={{ fontSize: 9, color: colors.textTertiary, fontWeight: '700', textAlign: 'center' }}>{stat.l}</Text>
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {ACTIONS.map(a => (
          <TouchableOpacity key={a.view} style={{ width: '47%' }} onPress={() => setView(a.view)} activeOpacity={0.8}>
            <Card style={{ padding: 16 }}>
              <Text style={{ fontSize: 24, marginBottom: 8 }}>{a.icon}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{a.title}</Text>
              <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 16 }}>{a.desc}</Text>
              <View style={{ marginTop: 8 }}>
                <Pill label="Creator Only" color={colors.primary} />
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      <SectionTitle>PIPELINE STATUS</SectionTitle>
      {/* Today's import health indicators */}
      {!checklistLoading && (() => {
        const hasLedger  = todayImports.some((i: any) => i.type === 'ledger');
        const hasMidday  = todayImports.some((i: any) => i.type === 'daily_input' && i.scope === 'midday');
        const hasEvening = todayImports.some((i: any) => i.type === 'daily_input' && i.scope === 'evening');
        const hasAllday  = todayImports.some((i: any) => i.type === 'daily_input' && i.scope === 'allday');
        const items = [
          { label: 'Ledger',  ok: hasLedger },
          { label: 'Midday',  ok: hasMidday },
          { label: 'Evening', ok: hasEvening },
          { label: 'All-Day', ok: hasAllday },
        ];
        return (
          <Card style={{ padding: 12, marginBottom: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>TODAY'S IMPORTS</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {items.map(({ label, ok }) => (
                <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ok ? colors.successLight : colors.errorLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 14 }}>{ok ? '✅' : '⚠️'}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: ok ? colors.success : colors.error, flex: 1, lineHeight: 12 }}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })()}
      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, backgroundColor: colors.background, padding: 2, borderRadius: 10 }}>
          {(['today', 'tomorrow'] as const).map(d => (
            <TouchableOpacity
              key={d}
              onPress={() => setTargetDateOption(d)}
              style={{
                flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                backgroundColor: targetDateOption === d ? colors.bgElevated : 'transparent',
                borderWidth: 1, borderColor: targetDateOption === d ? colors.primary + '88' : 'transparent'
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: targetDateOption === d ? colors.primary : colors.textTertiary }}>
                {d.toUpperCase()} ({d === 'today' ? getTodayET().slice(5) : getTomorrowET().slice(5)})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>ZK6 Slates</Text>
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Regenerate Midday · Evening · All-Day</Text>
          </View>
          <TouchableOpacity
            onPress={() => requestRegen('all')}
            disabled={isRegening}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isRegening ? colors.surfaceLight : colors.primary,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
            }}
          >
            {isRegening && <ActivityIndicator size="small" color={colors.textSecondary} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isRegening ? colors.textSecondary : '#fff' }}>
              {isRegening ? 'Regenerating…' : '↻ Regen All Slates'}
            </Text>
          </TouchableOpacity>
        </View>
        {regenProgress ? (
          <View style={{ backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono }}>{regenProgress}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {[
            { s: 'midday', label: '☀️ Midday', c: colors.gold },
            { s: 'evening', label: '🌙 Evening', c: colors.primary },
            { s: 'allday', label: '◈ All-Day', c: colors.teal },
          ].map(({ s, label, c }) => {
            const busy = !!regeningScopeMap[s];
            return (
              <TouchableOpacity
                key={s}
                disabled={busy || isRegening}
                onPress={() => requestRegen(s)}
                style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: c + '44', backgroundColor: c + '10', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
              >
                {busy && <ActivityIndicator size="small" color={c} />}
                <Text style={{ fontSize: 10, fontWeight: '700', color: busy ? colors.textTertiary : c }}>{busy ? '…' : label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <RegenConfirmationModal
          visible={regenConfirm.visible}
          scope={regenConfirm.scope}
          isLocked={regenConfirm.isLocked}
          onClose={() => setRegenConfirm({ visible: false, scope: '', isLocked: false })}
          onConfirm={(force) => {
            if (regenConfirm.scope === 'all') handleRegenAll(force);
            else handleRegenScope(regenConfirm.scope as any, force);
          }}
        />

        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          <TouchableOpacity
            onPress={handleFullWorkflow}
            disabled={isRunningWorkflow || isDetecting || isRegening}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: isRunningWorkflow ? colors.surfaceLight : colors.primary + '18',
              borderWidth: 1.5, borderColor: colors.primary + '55',
              paddingVertical: 11, borderRadius: 10, marginBottom: 8,
            }}
          >
            {isRunningWorkflow && <ActivityIndicator size="small" color={colors.primary} />}
            <Text style={{ fontSize: 12, fontWeight: '800', color: isRunningWorkflow ? colors.textSecondary : colors.primary }}>
              {isRunningWorkflow ? workflowProgress : '⚡ Full Daily Workflow'}
            </Text>
          </TouchableOpacity>
          {!isRunningWorkflow && workflowProgress ? (
            <View style={{ backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 10, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'center' }}>{workflowProgress}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={handleDetectHits}
            disabled={isDetecting}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: isDetecting ? colors.surfaceLight : colors.gold + '18',
              borderWidth: 1, borderColor: colors.gold + '44',
              paddingVertical: 10, borderRadius: 10,
            }}
          >
            {isDetecting && <ActivityIndicator size="small" color={colors.gold} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDetecting ? colors.textSecondary : colors.gold }}>
              {detectProgress || (isDetecting ? 'Running hit detection…' : '🎯 Run Hit Detection Now')}
            </Text>
          </TouchableOpacity>
          {detectResult && (
            <View style={{ marginTop: 8, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 11, color: detectResult.hitsFound > 0 ? colors.gold : colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'center' }}>
                {detectResult.hitsFound > 0
                  ? `Found ${detectResult.hitsFound} hit${detectResult.hitsFound !== 1 ? 's' : ''} across ${detectResult.scopesChecked} scope${detectResult.scopesChecked !== 1 ? 's' : ''}`
                  : 'No hits found for today\'s slate'}
                {detectResult.supplementsGenerated > 0 ? ` · ${detectResult.supplementsGenerated} supplement${detectResult.supplementsGenerated !== 1 ? 's' : ''} generated` : ''}
              </Text>
            </View>
          )}
        </View>
      </Card>

      <SectionTitle>DATA CLEANUP</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 4 }}>Clear Top 30 Picks</Text>
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 12 }}>
          Sets on_slate=false for all daily_intelligence rows on a date. Use to remove stale test slates before regenerating.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'Clear Today',     date: getTodayET(),      color: colors.amber },
            { label: 'Clear Yesterday', date: getYesterdayET(),  color: colors.rose  },
          ].map(({ label, date, color }) => {
            const busy = clearingIntel === date;
            return (
              <TouchableOpacity
                key={date}
                disabled={!!clearingIntel}
                onPress={() => {
                  Alert.alert('Clear Top 30', `Remove on_slate rows for ${date}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: () => handleClearIntel(date) },
                  ]);
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 10, borderRadius: 10, borderWidth: 1,
                  borderColor: color + '55', backgroundColor: color + '12' }}
              >
                {busy && <ActivityIndicator size="small" color={color} />}
                <Text style={{ fontSize: 11, fontWeight: '700', color: busy ? colors.textSecondary : color }}>
                  {busy ? 'Clearing…' : label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {clearIntelResult && (
          <Text style={{ marginTop: 8, fontSize: 11, color: colors.textSecondary,
            fontFamily: theme.typography.fontFamily.mono, textAlign: 'center' }}>
            {clearIntelResult}
          </Text>
        )}
      </Card>

      <SectionTitle>ZK30 — SINGLE STATE MODE</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/zk30')}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: '#0ea5e9',
            backgroundColor: '#0ea5e9' + '12',
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0ea5e9', letterSpacing: 0.3 }}>
            Open ZK30 Slate  →
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/zk30-import')}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1.5,
            borderColor: colors.gold,
            backgroundColor: colors.gold + '12',
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold, letterSpacing: 0.3 }}>
            Import TX Results  ↥
          </Text>
        </TouchableOpacity>
      </View>
      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>ZK30 Slates</Text>
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Single-state · jurisdiction-filtered histories</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '600' }}>State:</Text>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                           borderColor: colors.teal + '55', backgroundColor: colors.teal + '12' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.teal }}>{zk30Jurisdiction}</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {['TX', 'FL', 'CA', 'NY', 'OH', 'PA', 'GA', 'MI'].map(st => (
            <TouchableOpacity
              key={st}
              onPress={() => setZk30Jurisdiction(st)}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1,
                       borderColor: zk30Jurisdiction === st ? colors.teal + '88' : colors.border,
                       backgroundColor: zk30Jurisdiction === st ? colors.teal + '18' : colors.surfaceLight }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: zk30Jurisdiction === st ? colors.teal : colors.textSecondary }}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { s: 'midday'  as const, label: '☀️ Midday',  c: colors.gold },
            { s: 'evening' as const, label: '🌙 Evening', c: colors.primary },
            { s: 'allday'  as const, label: '◈ All-Day',  c: colors.teal },
          ]).map(({ s, label, c }) => {
            const busy   = !!zk30BusyMap[s];
            const status = zk30StatusMap[s];
            return (
              <TouchableOpacity
                key={s}
                disabled={busy}
                onPress={() => handleZK30Regen(s)}
                style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1,
                         borderColor: c + '44', backgroundColor: c + '10',
                         alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}
              >
                {busy && <ActivityIndicator size="small" color={c} />}
                <Text style={{ fontSize: 10, fontWeight: '700', color: busy ? colors.textTertiary : c }}>
                  {busy ? '…' : status || label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ARCH-06 step 7.4 — ZK30 hit detection trigger */}
      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>ZK30 Hit Detection</Text>
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
              POST to run-hit-detection-zk30 · cron runs nightly 23:30 ET
            </Text>
          </View>
        </View>
        <TouchableOpacity
          disabled={zk30HitBusy}
          onPress={handleZK30HitDetection}
          style={{
            padding: 10, borderRadius: 8, borderWidth: 1,
            borderColor: colors.teal + '44', backgroundColor: colors.teal + '10',
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
          }}
        >
          {zk30HitBusy && <ActivityIndicator size="small" color={colors.teal} />}
          <Text style={{ fontSize: 11, fontWeight: '700', color: zk30HitBusy ? colors.textTertiary : colors.teal }}>
            {zk30HitBusy ? 'Running…' : 'Run ZK30 Hit Detection (Today)'}
          </Text>
        </TouchableOpacity>
        {zk30HitStatus && (
          <Text style={{
            marginTop: 8, fontSize: 11, color: colors.textSecondary,
            fontFamily: theme.typography.fontFamily.mono, textAlign: 'center',
          }}>
            {zk30HitStatus}
          </Text>
        )}
      </Card>

      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>ZK30 Data Import</Text>
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Box & pair history · jurisdiction-scoped</Text>
          </View>
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                         borderColor: colors.teal + '55', backgroundColor: colors.teal + '12' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.teal }}>{zk30Jurisdiction}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1,
                     borderColor: colors.teal + '44', backgroundColor: colors.teal + '10',
                     alignItems: 'center', justifyContent: 'center' }}
            onPress={() => onOpenZK30Import('box_history')}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal }}>📦 Import {zk30Jurisdiction} Box History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1,
                     borderColor: colors.teal + '44', backgroundColor: colors.teal + '10',
                     alignItems: 'center', justifyContent: 'center' }}
            onPress={() => onOpenZK30Import('pair_history')}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.teal }}>🔗 Import {zk30Jurisdiction} Pair History</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <SectionTitle>TODAY'S IMPORT CHECKLIST</SectionTitle>
      <Card style={{ padding: 0, marginBottom: 4 }}>
        {checklistLoading ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (() => {
          const etHour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }), 10);
          const isLateEvening = etHour >= 20;
          const checkItems = [
            { label: 'Results Ledger', type: 'ledger', scope: null, icon: '📋' },
            { label: 'Daily Input — Midday', type: 'daily_input', scope: 'midday', icon: '☀️' },
            { label: 'Daily Input — Evening', type: 'daily_input', scope: 'evening', icon: '🌙' },
            { label: 'Daily Input — All Day', type: 'daily_input', scope: 'allday', icon: '◈' },
          ];
          return checkItems.map((item, i) => {
            const match = todayImports.find(r =>
              r.type === item.type && (item.scope == null || r.scope === item.scope)
            );
            const isLate = item.scope === 'evening' && isLateEvening && !match;
            const statusIcon = match ? '✅' : isLate ? '🔴' : '⚠️';
            const statusColor = match ? colors.success : isLate ? colors.error : colors.orange;
            return (
              <TouchableOpacity
                key={item.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: colors.border }}
                onPress={() => { if (!match) setView('wizard'); }}
                activeOpacity={match ? 1 : 0.7}
              >
                <Text style={{ fontSize: 14 }}>{statusIcon}</Text>
                <Text style={{ fontSize: 12 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{item.label}</Text>
                  <Text style={{ fontSize: 10, color: statusColor }}>
                    {match
                      ? `${timeAgo(match.created_at)}${match.counts ? ` · ${match.counts} rows` : ''}`
                      : isLate ? 'OVERDUE — tap to import' : 'Not imported yet — tap to import'}
                  </Text>
                </View>
                {!match && (
                  <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: colors.primary + '33' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary }}>IMPORT →</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          });
        })()}
      </Card>

      <SectionTitle>WEEKLY IMPORTS</SectionTitle>
      <Card style={{ padding: 0, marginBottom: 4 }}>
        {[
          { type: 'box_history',  label: 'Box History H01Y',  icon: '📦' },
          { type: 'pair_history', label: 'Pair History H01Y', icon: '🔗' },
        ].map((item, i) => {
          const last = weeklyImports.find(r => r.type === item.type && (r.horizon_label === 'H01Y' || !r.horizon_label));
          const daysAgo = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : null;
          const isStale = daysAgo != null && daysAgo >= 14;
          const isAging = !isStale && daysAgo != null && daysAgo >= 7;
          const alertColor = isStale ? colors.error : isAging ? colors.orange : colors.success;
          return (
            <View key={item.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 14 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{item.label}</Text>
                <Text style={{ fontSize: 10, color: (isStale || isAging) ? alertColor : last ? colors.success : colors.textTertiary }}>
                  {last
                    ? (daysAgo === 0 ? 'Imported today' : daysAgo === 1 ? 'Imported yesterday' : `Imported ${daysAgo} days ago`) + (isStale ? ' — refresh recommended' : isAging ? ' — consider refreshing' : '')
                    : 'Never imported'}
                </Text>
              </View>
              {(isStale || isAging) && (
                <View style={{ backgroundColor: alertColor + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: alertColor + '33' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: alertColor }}>{isStale ? 'STALE' : 'AGING'}</Text>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <SectionTitle>DAILY IMPORT GUIDE</SectionTitle>
      <Card style={{ padding: 0, marginBottom: 4 }}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}
          onPress={() => setGuideOpen(g => !g)}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>What to import and when</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary }}>{guideOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {guideOpen && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            {[
              { icon: '☀️', when: 'After Midday draws (~3pm ET)', what: 'Import Daily Input (Midday) + Results Ledger (Midday)' },
              { icon: '🌙', when: 'After Evening draws (~11pm ET)', what: 'Import Daily Input (Evening) + Results Ledger (All Day)' },
              { icon: '📦', when: 'Weekly', what: 'Re-import Box History H01Y to refresh frequency data' },
              { icon: '🗃️', when: 'Monthly', what: 'Import H02Y–H10Y for deep pattern analysis' },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontSize: 16 }}>{row.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, marginBottom: 2 }}>{row.when}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{row.what}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <SectionTitle>RECENT IMPORTS</SectionTitle>
      <Card style={{ padding: 0 }}>
        {liveImports.slice(0, 5).map((imp, i) => {
          const typeInfo = IMPORT_TYPES.find(t => t.id === imp.type);
          const sc = imp.status === 'completed' ? colors.success : imp.status === 'failed' ? colors.error : colors.textTertiary;
          return (
            <View key={imp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 16 }}>{typeInfo?.icon ?? '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{imp.type}{imp.horizon_label ? ' · ' + imp.horizon_label : ''}{imp.class_id ? ' · Class ' + imp.class_id : ''}</Text>
                <Text style={{ fontSize: 10, color: colors.textTertiary }}>{imp.scope} · {new Date(imp.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</Text>
              </View>
              <Pill label={imp.status} color={sc} />
              <Text style={{ fontSize: 12, color: colors.success, fontFamily: theme.typography.fontFamily.mono }}>+{imp.accepted}</Text>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
