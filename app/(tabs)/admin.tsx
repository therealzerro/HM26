import React, { useState, useCallback, useMemo, useEffect, Component } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { fetchFromSupabase } from '@/lib/supabase';
import { parseRawLedgerData } from '@/lib/parseLedger';
import { runHitDetectionAllScopes, runHitDetectionAndRefresh, HitDetectionResult } from '@/lib/hitDetection';
import { getTodayET, getTomorrowET } from '@/lib/dateUtils';
import { computeZK30Slate } from '@/engines/zk30';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: string },
  { error: Error | null }
> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 28, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#ef4444', marginBottom: 8, textAlign: 'center' }}>
            {this.props.fallback ?? 'Something went wrong'}
          </Text>
          <Text style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', fontFamily: 'Courier' }}>
            {this.state.error.message}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#3b82f6', borderRadius: 10 }}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>↺ Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportRecord {
  id: string; type: string; class_id: number | null; horizon_label: string | null;
  scope: string; status: string; accepted: number; rejected: number; fixed: number;
  warnings: string[]; created_at: string; p99: number | null;
  first_seen: string | null; last_seen: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HORIZONS = ['H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y'];

const MOCK_IMPORTS: ImportRecord[] = [
  { id:'i1', type:'box_history', class_id:1, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:847, rejected:3, fixed:12, warnings:['3 rows had DS<0, auto-set to 0'], created_at:'2026-04-12T10:31:00', p99:287, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i2', type:'pair_history', class_id:2, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:612, rejected:0, fixed:4, warnings:[], created_at:'2026-04-12T10:35:00', p99:198, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i3', type:'pair_history', class_id:3, horizon_label:'H01Y', scope:'midday', status:'completed', accepted:608, rejected:1, fixed:2, warnings:['1 pair key zero-padded'], created_at:'2026-04-12T10:38:00', p99:201, first_seen:'2025-01-01', last_seen:'2026-04-12' },
  { id:'i4', type:'box_history', class_id:1, horizon_label:'H01Y', scope:'evening', status:'completed', accepted:831, rejected:5, fixed:9, warnings:['5 rows rejected: invalid date format'], created_at:'2026-04-11T18:20:00', p99:312, first_seen:'2025-01-02', last_seen:'2026-04-11' },
  { id:'i5', type:'ledger', class_id:null, horizon_label:null, scope:'allday', status:'completed', accepted:1240, rejected:0, fixed:0, warnings:[], created_at:'2026-04-11T09:00:00', p99:null, first_seen:'2024-01-01', last_seen:'2026-04-11' },
  { id:'i6', type:'daily_input', class_id:null, horizon_label:null, scope:'midday', status:'completed', accepted:22, rejected:0, fixed:0, warnings:[], created_at:'2026-04-13T14:00:00', p99:null, first_seen:null, last_seen:null },
  { id:'i7', type:'box_history', class_id:1, horizon_label:'H02Y', scope:'allday', status:'failed', accepted:0, rejected:0, fixed:0, warnings:['Schema error: missing DrawsSince column'], created_at:'2026-04-10T11:00:00', p99:null, first_seen:null, last_seen:null },
];

const IMPORT_TYPES = [
  { id:'box_history', icon:'📦', label:'Box History', desc:'Unordered combo frequency data.\nOne file per scope × horizon (H01Y–H10Y).', color:theme.colors.primary, headers:['Combo','Times Drawn','Expected','Last Seen','Draws Since'] },
  { id:'pair_history', icon:'🔗', label:'Pair History', desc:'Pair class frequency data.\nClasses 2–11, one file per class × scope × horizon.', color:theme.colors.primary, headers:['Pair','TimesDrawn','LastSeen','DrawsSince'] },
  { id:'daily_input', icon:'📅', label:'Daily Input', desc:'Today\'s draw results for DrawsSince rescoring.\nSame shape as Box History.', color:theme.colors.gold, headers:['Combo','ComboSet','TimesDrawn','LastSeen','DrawsSince'] },
  { id:'ledger', icon:'📋', label:'Results Ledger', desc:'Paste raw results from lotterypost.com.\nAuto-parses state names, dates, and digits.', color:theme.colors.success, headers:['State Name (header)', 'Game\tDate\tResult (rows)'] },
];

const PAIR_CLASSES = [
  {id:2, label:'Front Pair Straight (AB)'}, {id:3, label:'Back Pair Straight (BC)'}, {id:4, label:'Split Pair Straight (AC)'},
  {id:5, label:'Front Pair Box {A,B}'}, {id:6, label:'Back Pair Box {B,C}'}, {id:7, label:'Split Pair Box {A,C}'},
  {id:8, label:'Front from Box Sort'}, {id:9, label:'Back from Box Sort'}, {id:10, label:'Split from Box Sort'},
  {id:11, label:'Any Position Box'},
];

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV = [
  { id:'dashboard', icon:'🏠', label:'Dashboard' },
  { id:'wizard', icon:'📥', label:'Import' },
  { id:'history', icon:'🗂', label:'History' },
  { id:'matrix', icon:'📊', label:'Coverage' },
  { id:'health', icon:'⚡', label:'Health' },
  { id:'engine', icon:'⚙️', label:'Engine' },
  { id:'performance', icon:'🎯', label:'Performance' },
  { id:'nationwide', icon:'🌎', label:'Nationwide' },
  { id:'adaptive', icon:'🧠', label:'Learning' },
  { id:'intelligence', icon:'🔬', label:'Intelligence' },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '30' }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color }}>{label}</Text>
    </View>
  );
}
function SectionTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginTop: 20 }}>{children}</Text>;
}
function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.soft }, style]}>{children}</View>;
}
function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function DashboardView({ setView, imports, healthMetrics, regenerateSlate, checkSlateLock, onOpenZK30Import }: {
  setView: (v: string) => void;
  imports: any[];
  healthMetrics: any;
  regenerateSlate: (scope: any, weightsKey?: any, force?: boolean) => Promise<any>;
  checkSlateLock: (scope: any, date?: string) => Promise<boolean>;
  onOpenZK30Import: (type: 'box_history' | 'pair_history') => void;
}) {
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

  // Today's Import Checklist state
  const [todayImports, setTodayImports] = useState<any[]>([]);
  const [weeklyImports, setWeeklyImports] = useState<any[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // ZK30 Single State state
  const [zk30Jurisdiction] = useState<string>('TX');
  const [zk30BusyMap, setZk30BusyMap] = useState<Record<string, boolean>>({});
  const [zk30StatusMap, setZk30StatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const todayStart = getTodayET() + 'T00:00:00.000Z';
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

  const handleDetectHits = useCallback(async () => {
    setIsDetecting(true);
    setDetectResult(null);
    setDetectProgress('');
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
    let totalHits = 0;
    let totalScopes = 0;
    let totalSupplements = 0;
    try {
      const today = getTodayET();
      for (const sc of scopes) {
        setDetectProgress(`Running hit detection for ${sc}…`);
        const res = await runHitDetectionAndRefresh(sc, today);
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
      <Text style={{ fontSize: 20, fontWeight: '900', color: theme.colors.text, marginBottom: 4 }}>🔐 Creator Dashboard</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 20 }}>Data pipeline · ZK6 engine management · System health</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {[
          { i:'📥', v: liveImports.length, l:'Total Imports', c: theme.colors.primary },
          { i:'✅', v: completed, l:'Completed', c: theme.colors.success },
          { i:'❌', v: failed, l:'Failed', c: theme.colors.error },
          { i:'📊', v: totalAccepted.toLocaleString(), l:'Rows Accepted', c: theme.colors.teal },
        ].map(stat => (
          <Card key={stat.l} style={{ flex: 1, minWidth: 120, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 20, marginBottom: 4 }}>{stat.i}</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: stat.c, fontFamily: 'Courier', lineHeight: 20, marginBottom: 2 }}>{stat.v}</Text>
            <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', textAlign: 'center' }}>{stat.l}</Text>
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {ACTIONS.map(a => (
          <TouchableOpacity key={a.view} style={{ width: '47%' }} onPress={() => setView(a.view)} activeOpacity={0.8}>
            <Card style={{ padding: 16 }}>
              <Text style={{ fontSize: 24, marginBottom: 8 }}>{a.icon}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>{a.title}</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textSecondary, lineHeight: 16 }}>{a.desc}</Text>
              <View style={{ marginTop: 8 }}>
                <Pill label="Creator Only" color={theme.colors.primary} />
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
            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 8 }}>TODAY'S IMPORTS</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {items.map(({ label, ok }) => (
                <View key={label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ok ? theme.colors.successLight : theme.colors.errorLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 14 }}>{ok ? '✅' : '⚠️'}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: ok ? theme.colors.success : theme.colors.error, flex: 1, lineHeight: 12 }}>{label}</Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })()}
      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, backgroundColor: theme.colors.background, padding: 2, borderRadius: 10 }}>
          {(['today', 'tomorrow'] as const).map(d => (
            <TouchableOpacity 
              key={d} 
              onPress={() => setTargetDateOption(d)}
              style={{ 
                flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                backgroundColor: targetDateOption === d ? theme.colors.bgElevated : 'transparent',
                borderWidth: 1, borderColor: targetDateOption === d ? theme.colors.primary + '88' : 'transparent'
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: targetDateOption === d ? theme.colors.primary : theme.colors.textTertiary }}>
                {d.toUpperCase()} ({d === 'today' ? getTodayET().slice(5) : getTomorrowET().slice(5)})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>ZK6 Slates</Text>
            <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Regenerate Midday · Evening · All-Day</Text>
          </View>
          <TouchableOpacity
            onPress={() => requestRegen('all')}
            disabled={isRegening}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isRegening ? theme.colors.surfaceLight : theme.colors.primary,
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
            }}
          >
            {isRegening && <ActivityIndicator size="small" color={theme.colors.textSecondary} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isRegening ? theme.colors.textSecondary : '#fff' }}>
              {isRegening ? 'Regenerating…' : '↻ Regen All Slates'}
            </Text>
          </TouchableOpacity>
        </View>
        {regenProgress ? (
          <View style={{ backgroundColor: theme.colors.surfaceLight, borderRadius: 8, padding: 10, borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{regenProgress}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {[
            { s: 'midday', label: '☀️ Midday', c: theme.colors.gold },
            { s: 'evening', label: '🌙 Evening', c: theme.colors.primary },
            { s: 'allday', label: '◈ All-Day', c: theme.colors.teal },
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
                <Text style={{ fontSize: 10, fontWeight: '700', color: busy ? theme.colors.textTertiary : c }}>{busy ? '…' : label}</Text>
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

        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 12 }}>
          <TouchableOpacity
            onPress={handleDetectHits}
            disabled={isDetecting}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: isDetecting ? theme.colors.surfaceLight : theme.colors.gold + '18',
              borderWidth: 1, borderColor: theme.colors.gold + '44',
              paddingVertical: 10, borderRadius: 10,
            }}
          >
            {isDetecting && <ActivityIndicator size="small" color={theme.colors.gold} />}
            <Text style={{ fontSize: 12, fontWeight: '700', color: isDetecting ? theme.colors.textSecondary : theme.colors.gold }}>
              {detectProgress || (isDetecting ? 'Running hit detection…' : '🎯 Run Hit Detection Now')}
            </Text>
          </TouchableOpacity>
          {detectResult && (
            <View style={{ marginTop: 8, backgroundColor: theme.colors.surfaceLight, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 11, color: detectResult.hitsFound > 0 ? theme.colors.gold : theme.colors.textSecondary, fontFamily: 'Courier', textAlign: 'center' }}>
                {detectResult.hitsFound > 0
                  ? `Found ${detectResult.hitsFound} hit${detectResult.hitsFound !== 1 ? 's' : ''} across ${detectResult.scopesChecked} scope${detectResult.scopesChecked !== 1 ? 's' : ''}`
                  : 'No hits found for today\'s slate'}
                {detectResult.supplementsGenerated > 0 ? ` · ${detectResult.supplementsGenerated} supplement${detectResult.supplementsGenerated !== 1 ? 's' : ''} generated` : ''}
              </Text>
            </View>
          )}
        </View>
      </Card>

      <SectionTitle>ZK30 — SINGLE STATE MODE</SectionTitle>
      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>ZK30 Slates</Text>
            <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Single-state · jurisdiction-filtered histories</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: theme.colors.textTertiary, fontWeight: '600' }}>State:</Text>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                           borderColor: theme.colors.teal + '55', backgroundColor: theme.colors.teal + '12' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.teal }}>TX</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { s: 'midday'  as const, label: '☀️ Midday',  c: theme.colors.gold },
            { s: 'evening' as const, label: '🌙 Evening', c: theme.colors.primary },
            { s: 'allday'  as const, label: '◈ All-Day',  c: theme.colors.teal },
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
                <Text style={{ fontSize: 10, fontWeight: '700', color: busy ? theme.colors.textTertiary : c }}>
                  {busy ? '…' : status || label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Card style={{ padding: 16, marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>ZK30 Data Import</Text>
            <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Box & pair history · jurisdiction-scoped</Text>
          </View>
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                         borderColor: theme.colors.teal + '55', backgroundColor: theme.colors.teal + '12' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: theme.colors.teal }}>TX</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1,
                     borderColor: theme.colors.teal + '44', backgroundColor: theme.colors.teal + '10',
                     alignItems: 'center', justifyContent: 'center' }}
            onPress={() => onOpenZK30Import('box_history')}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.teal }}>📦 Import TX Box History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1,
                     borderColor: theme.colors.teal + '44', backgroundColor: theme.colors.teal + '10',
                     alignItems: 'center', justifyContent: 'center' }}
            onPress={() => onOpenZK30Import('pair_history')}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.teal }}>🔗 Import TX Pair History</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <SectionTitle>TODAY'S IMPORT CHECKLIST</SectionTitle>
      <Card style={{ padding: 0, marginBottom: 4 }}>
        {checklistLoading ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
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
            const statusColor = match ? theme.colors.success : isLate ? theme.colors.error : theme.colors.orange;
            return (
              <TouchableOpacity
                key={item.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: theme.colors.border }}
                onPress={() => { if (!match) setView('wizard'); }}
                activeOpacity={match ? 1 : 0.7}
              >
                <Text style={{ fontSize: 14 }}>{statusIcon}</Text>
                <Text style={{ fontSize: 12 }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>{item.label}</Text>
                  <Text style={{ fontSize: 10, color: statusColor }}>
                    {match
                      ? `${timeAgo(match.created_at)}${match.counts ? ` · ${match.counts} rows` : ''}`
                      : isLate ? 'OVERDUE — tap to import' : 'Not imported yet — tap to import'}
                  </Text>
                </View>
                {!match && (
                  <View style={{ backgroundColor: theme.colors.primary + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: theme.colors.primary + '33' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.primary }}>IMPORT →</Text>
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
          const alertColor = isStale ? theme.colors.error : isAging ? theme.colors.orange : theme.colors.success;
          return (
            <View key={item.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: 14 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>{item.label}</Text>
                <Text style={{ fontSize: 10, color: (isStale || isAging) ? alertColor : last ? theme.colors.success : theme.colors.textTertiary }}>
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
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>What to import and when</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textTertiary }}>{guideOpen ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {guideOpen && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            {[
              { icon: '☀️', when: 'After Midday draws (~3pm ET)', what: 'Import Daily Input (Midday) + Results Ledger (Midday)' },
              { icon: '🌙', when: 'After Evening draws (~11pm ET)', what: 'Import Daily Input (Evening) + Results Ledger (All Day)' },
              { icon: '📦', when: 'Weekly', what: 'Re-import Box History H01Y to refresh frequency data' },
              { icon: '🗃️', when: 'Monthly', what: 'Import H02Y–H10Y for deep pattern analysis' },
            ].map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Text style={{ fontSize: 16 }}>{row.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 2 }}>{row.when}</Text>
                  <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{row.what}</Text>
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
          const sc = imp.status === 'completed' ? theme.colors.success : imp.status === 'failed' ? theme.colors.error : theme.colors.textTertiary;
          return (
            <View key={imp.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: 16 }}>{typeInfo?.icon ?? '📦'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>{imp.type}{imp.horizon_label ? ' · ' + imp.horizon_label : ''}{imp.class_id ? ' · Class ' + imp.class_id : ''}</Text>
                <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{imp.scope} · {new Date(imp.created_at).toLocaleDateString()}</Text>
              </View>
              <Pill label={imp.status} color={sc} />
              <Text style={{ fontSize: 12, color: theme.colors.success, fontFamily: 'Courier' }}>+{imp.accepted}</Text>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

// ─── Box History helpers ──────────────────────────────────────────────────────

/** Convert "Mar 23, 2026" → "2026-03-23". Also passes through YYYY-MM-DD. */
function parseDisplayDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const MONTH_MAP: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  try {
    // 1. Handle "Fri, Sep 26, 2025" or "Sep 26, 2025"
    const alphaMatch = s.match(/(?:[A-Za-z]{3,},?\s+)?([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
    if (alphaMatch) {
      const month = MONTH_MAP[alphaMatch[1].toLowerCase().slice(0, 3)];
      if (month) return `${alphaMatch[3]}-${month}-${alphaMatch[2].padStart(2, '0')}`;
    }

    // 2. Handle "YYYY-MM-DD" or "YYYY/MM/DD"
    const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;

    // 3. Handle "MM/DD/YYYY" or "MM-DD-YYYY"
    const usMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;

    // 4. Fallback to native Date but use local components to avoid UTC shifts
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Split a single box-history line into exactly 5 fields:
 *   [Combo, Times Drawn, Expected, Last Seen, Draws Since]
 *
 * Handles both tab-separated (spreadsheet paste) and comma-separated.
 * Accounts for a comma inside the date ("Mar 23, 2026") and thousands
 * commas in Draws Since ("1,649").
 */
function parseBoxLine(line: string): [string, string, string, string, string] | null {
  if (line.includes('\t')) {
    const p = line.split('\t').map(x => x.trim());
    if (p.length < 5) return null;
    return [p[0], p[1], p[2], p[3], p[4].replace(/,/g, '')];
  }
  // Comma split
  const p = line.split(',').map(x => x.trim());
  if (p.length < 5) return null;
  const combo = p[0];
  const times = p[1];
  const exp   = p[2];
  // Everything after Expected is [ ...Last Seen parts..., ...Draws Since parts ]
  // Last Seen can be "Mar 23, 2026" (2 parts) or already "2026-03-23" (1 part)
  // Draws Since can be "1649" (1 part) or "1,649" (2 parts: "1" + "649")
  const rest = p.slice(3);
  if (rest.length === 0) return null;

  // Detect if rest[0] starts with a month abbreviation → date occupies first 2 rest parts
  const startsWithMonth = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(rest[0]);
  let lastSeen: string;
  let dsParts: string[];

  if (startsWithMonth && rest.length >= 3) {
    // "Mar 23" + "2026" + drawsSince parts
    lastSeen = rest[0] + ', ' + rest[1];
    dsParts = rest.slice(2);
  } else if (startsWithMonth && rest.length === 2) {
    // "Mar 23" + "2026" — no room for DS; still try
    lastSeen = rest[0] + ', ' + rest[1];
    dsParts = [];
  } else {
    // Date is a single field (ISO or plain year)
    lastSeen = rest[0];
    dsParts = rest.slice(1);
  }

  const drawsSince = dsParts.join('').replace(/,/g, '');
  return [combo, times, exp, lastSeen, drawsSince];
}

/** Sort the 3 digits of a combo and build PostgreSQL array literal: "742" → "{2,4,7}" */
function comboToSet(combo: string): string {
  const digits = combo.replace(/\D/g, '').split('').sort();
  return '{' + digits.join(',') + '}';
}

// ─── Import Wizard View ───────────────────────────────────────────────────────
function ImportWizardView({ setView, importHistory, importLedger, importDailyInput, regenerateSlate, preset, onClearPreset }: {
  setView: (v: string) => void;
  importHistory: (data: any) => Promise<any>;
  importLedger: (data: any) => Promise<any>;
  importDailyInput: (data: any) => Promise<any>;
  regenerateSlate: (scope: any) => Promise<any>;
  preset?: { type: 'box_history' | 'pair_history'; jurisdiction: string } | null;
  onClearPreset?: () => void;
}) {
  const [step, setStep] = useState(preset ? 1 : 0);
  const [importType, setImportType] = useState<string | null>(preset?.type ?? null);
  const todayDefault = useMemo(() => getTodayET(), []);
  const yesterdayDefault = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);
  const [config, setConfig] = useState({ scope: 'midday', horizon: 'H01Y', class_id: 2, import_date: todayDefault });
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  // parsedData holds the structured rows/entries ready to send to Supabase
  const [parsedData, setParsedData] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const typeInfo = IMPORT_TYPES.find(t => t.id === importType);

  const generateSample = useCallback(() => {
    if (!typeInfo) return '';
    if (importType === 'box_history') {
      // Tab-separated to match spreadsheet paste format
      const h = typeInfo.headers.join('\t');
      const rows = [
        '742\t48\t1.23\tApr 13, 2026\t3',
        '319\t31\t0.87\tApr 10, 2026\t1,649',
        '000\t12\t0.33\tMar 23, 2026\t22',
      ];
      return h + '\n' + rows.join('\n');
    }
    if (importType === 'ledger') {
      return 'New York\nPick 3 Midday\tTue, Apr 14, 2026\t7-4-2\nPick 3 Evening\tTue, Apr 14, 2026\t3-1-9\nFlorida\nPick 3 Midday\tTue, Apr 14, 2026\t6-4-1\nPick 3 Evening\tTue, Apr 14, 2026\t0-5-8';
    }
    const h = typeInfo.headers.join(',');
    const rows = importType === 'pair_history' ? ['42,18,2026-04-10,3','13,22,2026-04-08,5']
      : ['742,{2,4,7},48,2026-04-13,0'];
    return h + '\n' + rows.join('\n');
  }, [importType, typeInfo]);

  // Real CSV parsing — produces structured data for the import mutations
  const handleValidate = useCallback(() => {
    setValidating(true);
    setParsedData(null);

    // Run synchronously after a tick so "Validating…" renders
    setTimeout(() => {
      try {
        const text = (csvText || generateSample()).trim();
        const lines = text.split('\n').filter(l => l.trim());

        if (lines.length < 2) {
          setParsed({ headers: [], totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['No data rows found — paste CSV with header row and at least one data row'], errors: [], fixes: [], sampleRows: [] });
          setValidating(false);
          setStep(3);
          return;
        }

        // Header split: prefer tabs (spreadsheet paste), fall back to commas
        const firstLine = lines[0];
        const useTab = firstLine.includes('\t');
        const rawHeaders = (useTab ? firstLine.split('\t') : firstLine.split(',')).map(h => h.trim());
        // Normalise header names for matching (lowercase, collapse spaces)
        const normH = rawHeaders.map(h => h.toLowerCase().replace(/\s+/g, ''));
        const idx = (name: string) => normH.findIndex(h => h === name.toLowerCase().replace(/\s+/g, ''));
        const dataLines = lines.slice(1);
        let accepted = 0, rejected = 0, fixed = 0;
        const warnings: string[] = [];

        if (importType === 'box_history') {
          // New format: Combo | Times Drawn | Expected | Last Seen | Draws Since
          // Uses parseBoxLine() which handles tab/comma and comma-in-date/DS
          const boxRows: { key: string; timesDrawn: number; expected: number; lastSeen: string; drawsSince: number }[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const fields = parseBoxLine(line);
            if (!fields) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: could not split into 5 fields`);
              return;
            }
            const [comboRaw, timesRaw, expectedRaw, lastSeenRaw, dsRaw] = fields;
            const combo = comboRaw.trim();
            const timesDrawn = parseInt(timesRaw.replace(/,/g, ''), 10);
            const expected = parseFloat(expectedRaw.replace(/,/g, ''));
            const lastSeen = parseDisplayDate(lastSeenRaw);
            const drawsSince = parseInt(dsRaw.replace(/,/g, ''), 10);

            if (!combo || !/^\d{3}$/.test(combo)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Combo "${combo}" is not a 3-digit string`);
              return;
            }
            if (isNaN(timesDrawn)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Times Drawn "${timesRaw}" is not a number`);
              return;
            }
            if (!lastSeen) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Last Seen "${lastSeenRaw}" — expected "Mon DD, YYYY"`);
              return;
            }
            if (isNaN(drawsSince)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: Draws Since "${dsRaw}" is not a number`);
              return;
            }
            let ds = drawsSince;
            if (ds < 0) { fixed++; ds = 0; if (warnings.length < 5) warnings.push(`Row ${i + 2}: Draws Since < 0 clamped to 0`); }
            accepted++;
            boxRows.push({ key: combo, timesDrawn, expected: isNaN(expected) ? 0 : expected, lastSeen, drawsSince: ds });
          });
          setParsedData({ boxRows });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: boxRows.slice(0, 5).map(r => ({ Combo: r.key, 'Times Drawn': r.timesDrawn, Expected: r.expected, 'Last Seen': r.lastSeen, 'Draws Since': r.drawsSince })) });

        } else if (importType === 'daily_input') {
          const iCombo = idx('Combo'), iTimes = idx('TimesDrawn'), iLast = idx('LastSeen'), iDs = idx('DrawsSince');
          if ([iCombo, iTimes, iLast, iDs].some(i => i < 0)) {
            setParsed({ headers: rawHeaders, totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['Missing required columns: Combo, TimesDrawn, LastSeen, DrawsSince'], errors: [], fixes: [], sampleRows: [] });
            setValidating(false); setStep(3); return;
          }
          const combos: string[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const c = (useTab ? line.split('\t') : line.split(',')).map(x => x.trim());
            const combo = c[iCombo], timesDrawn = parseInt(c[iTimes], 10), lastSeen = c[iLast], rawDs = parseInt(c[iDs], 10);
            if (!combo || isNaN(timesDrawn) || !lastSeen || isNaN(rawDs)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: invalid or missing data`);
              return;
            }
            accepted++;
            combos.push(combo);
          });
          setParsedData({ combos });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: combos.slice(0, 5).map(c => ({ Combo: c })) });

        } else if (importType === 'pair_history') {
          const iPair = idx('Pair'), iTimes = idx('TimesDrawn'), iLast = idx('LastSeen'), iDs = idx('DrawsSince');
          if ([iPair, iTimes, iLast, iDs].some(i => i < 0)) {
            setParsed({ headers: rawHeaders, totalRows: 0, accepted: 0, rejected: 0, fixed: 0, warnings: ['Missing required columns: Pair, TimesDrawn, LastSeen, DrawsSince'], errors: [], fixes: [], sampleRows: [] });
            setValidating(false); setStep(3); return;
          }
          const rows: { key: string; timesDrawn: number; lastSeen: string; drawsSince: number }[] = [];
          dataLines.forEach((line, i) => {
            if (!line.trim()) return;
            const c = (useTab ? line.split('\t') : line.split(',')).map(x => x.trim());
            const pair = c[iPair], timesDrawn = parseInt(c[iTimes], 10), lastSeen = c[iLast], rawDs = parseInt(c[iDs], 10);
            if (!pair || isNaN(timesDrawn) || !lastSeen || isNaN(rawDs)) {
              rejected++;
              if (warnings.length < 5) warnings.push(`Row ${i + 2}: invalid or missing data`);
              return;
            }
            let drawsSince = rawDs;
            if (drawsSince < 0) { fixed++; drawsSince = 0; }
            accepted++;
            rows.push({ key: pair, timesDrawn, lastSeen, drawsSince });
          });
          setParsedData({ rows });
          setParsed({ headers: rawHeaders, totalRows: dataLines.filter(l => l.trim()).length, accepted, rejected, fixed, warnings, errors: [], fixes: [], sampleRows: rows.slice(0, 5).map(r => ({ Pair: r.key, TimesDrawn: r.timesDrawn, LastSeen: r.lastSeen, DrawsSince: r.drawsSince })) });

        } else if (importType === 'ledger') {
          // Use the lotterypost.com paste parser
          const { rows: ledgerRows, skipped } = parseRawLedgerData(text);
          const entries = ledgerRows.map(r => ({
            jurisdiction: r.jurisdiction,
            game: r.game,
            date_et: r.date_et,
            session: r.session,
            result_digits: r.result_digits,
            comboset_sorted: r.comboset_sorted,
          }));
          setParsedData({ entries });
          setParsed({
            headers: ['State', 'Game', 'Date', 'Session', 'Result', 'ComboSet'],
            totalRows: ledgerRows.length + skipped.length,
            accepted: ledgerRows.length,
            rejected: 0,
            fixed: 0,
            warnings: skipped.slice(0, 10),
            errors: [],
            fixes: [],
            sampleRows: entries.slice(0, 5),
          });
        }

        setValidating(false);
        setStep(3);
      } catch (e) {
        setValidating(false);
        Alert.alert('Parse Error', String(e instanceof Error ? e.message : e));
      }
    }, 80);
  }, [csvText, generateSample, importType]);

  // Real commit — box_history writes directly via fetchFromSupabase;
  // other types delegate to the useDataIngestion mutations.
  const handleCommit = useCallback(async () => {
    if (!parsedData) return;
    setImporting(true);
    setCommitError(null);
    try {
      let summary: any;

      if (importType === 'box_history') {
        const boxRows: { key: string; timesDrawn: number; expected: number; lastSeen: string; drawsSince: number }[] =
          parsedData.boxRows ?? [];

        // Build records for datasets_box
        const records = boxRows.map(r => ({
          class_id: 1,
          scope: config.scope,
          horizon_label: config.horizon,
          key: r.key,
          jurisdiction: preset?.jurisdiction ?? null,
          key_box: r.key,
          ds_raw: r.drawsSince,
          ds_normalized: 0,
          times_drawn: r.timesDrawn,
          last_seen: r.lastSeen,
          expected: r.expected,
          draws_since: r.drawsSince,
          deleted_at: null,
        }));

        // Chunk at 500 rows to stay within PostgREST payload limits
        const CHUNK = 500;
        let inserted = 0;
        for (let i = 0; i < records.length; i += CHUNK) {
          const batch = records.slice(i, i + CHUNK);
          await fetchFromSupabase({
            path: '/rest/v1/datasets_box?on_conflict=class_id,scope,horizon_label,key,jurisdiction',
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: batch,
          });
          inserted += batch.length;
        }

        // Log import record
        const importRec = await fetchFromSupabase<any>({
          path: '/rest/v1/imports',
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: {
            type: 'box_history',
            class_id: 1,
            horizon_label: config.horizon,
            scope: config.scope,
            counts: inserted,
            status: 'completed',
            file_meta: { rowCount: boxRows.length, rejected: (parsed?.rejected ?? 0), fixed: (parsed?.fixed ?? 0) },
          },
        });
        const importId = Array.isArray(importRec) ? importRec[0]?.id : importRec?.id;

        summary = {
          id: importId ?? ('box_' + Date.now()),
          type: 'box_history',
          accepted: inserted,
          rejected: parsed?.rejected ?? 0,
          fixed: parsed?.fixed ?? 0,
          warnings: parsed?.warnings ?? [],
        };

        // Task 5: Trigger slate regeneration for all 3 scopes after box history import
        const scopesToRegen: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
        for (const sc of scopesToRegen) {
          try {
            await regenerateSlate(sc);
          } catch (regenErr) {
            console.warn('[BoxImport] regenerateSlate warn for', sc, ':', regenErr);
            // Non-fatal — import already succeeded
          }
        }

      } else if (importType === 'pair_history') {
        summary = await importHistory({
          type: 'pair_history',
          classId: config.class_id,
          horizonLabel: config.horizon,
          scope: config.scope,
          jurisdiction: preset?.jurisdiction,
          rows: parsedData.rows ?? [],
        });
      } else if (importType === 'ledger') {
        const rawEntries: any[] = parsedData.entries ?? [];
        // Deduplicate within the full set before batching — Postgres throws if
        // the same conflict key appears twice in one ON CONFLICT DO UPDATE statement.
        const seenKeys = new Set<string>();
        const entries = rawEntries.filter((r: any) => {
          const k = `${r.jurisdiction}|${r.game}|${r.date_et}|${r.session}`;
          if (seenKeys.has(k)) return false;
          seenKeys.add(k);
          return true;
        });
        const BATCH = 50;
        let totalAccepted = 0;
        let lastError = '';
        for (let bi = 0; bi < entries.length; bi += BATCH) {
          const chunk = entries.slice(bi, bi + BATCH);
          try {
            await fetchFromSupabase({
              path: '/rest/v1/histories?on_conflict=jurisdiction,game,date_et,session',
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: chunk,
            });
            totalAccepted += chunk.length;
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
          }
        }
        const states = [...new Set(entries.map((r: any) => r.jurisdiction))];
        const dates = [...new Set(entries.map((r: any) => r.date_et))].sort() as string[];
        const dateRange = dates.length > 0
          ? (dates[0] + (dates.length > 1 ? ' – ' + dates[dates.length - 1] : ''))
          : '';
        // Warn if parsed dates don't include the expected import date
        const dateMismatchWarnings: string[] = [];
        if (config.import_date && dates.length > 0 && !dates.includes(config.import_date)) {
          dateMismatchWarnings.push(`⚠️ Date mismatch: selected ${config.import_date} but parsed dates are ${dates.join(', ')}`);
        }
        // Log import with date/scope in file_meta
        await fetchFromSupabase({
          path: '/rest/v1/imports',
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: {
            type: 'ledger',
            scope: config.scope,
            counts: totalAccepted,
            status: 'completed',
            file_meta: { import_date: config.import_date, scope: config.scope, dateRange, states: states.length },
          },
        }).catch(() => {/* non-fatal */});
        summary = {
          id: 'ledger_' + Date.now(),
          type: 'ledger',
          accepted: totalAccepted,
          rejected: entries.length - totalAccepted,
          fixed: 0,
          warnings: [...(lastError ? [lastError] : []), ...dateMismatchWarnings],
          states: states.length,
          dateRange,
        };
      } else if (importType === 'daily_input') {
        summary = await importDailyInput({
          scope: config.scope,
          combos: parsedData.combos ?? [],
          import_date: config.import_date,
          file_meta: { import_date: config.import_date, scope: config.scope },
        });
      }

      setResult(summary);
      setImporting(false);
      setStep(4);
    } catch (e) {
      setImporting(false);
      const msg = String(e instanceof Error ? e.message : e);
      setCommitError(msg);
      Alert.alert('Import Failed', msg);
    }
  }, [importType, config, parsedData, parsed, importHistory, importLedger, importDailyInput, regenerateSlate]);

  const steps = ['Type', 'Configure', 'Upload', 'Review', 'Done'];

  return (
    <View style={{ flex: 1 }}>
      {/* Steps header */}
      <View style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, padding: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
            {steps.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: step > i ? theme.colors.success : i === step ? theme.colors.primary : theme.colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: step > i ? theme.colors.success : i === step ? theme.colors.primary : theme.colors.border }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: step > i || i === step ? '#fff' : theme.colors.textTertiary }}>{step > i ? '✓' : i + 1}</Text>
                </View>
                <Text style={{ fontSize: 10, color: i === step ? theme.colors.primary : theme.colors.textTertiary, fontWeight: i === step ? '700' : '400' }}>{s}</Text>
                {i < steps.length - 1 && <View style={{ width: 16, height: 2, backgroundColor: step > i ? theme.colors.success : theme.colors.border }} />}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {/* Step 0: Select type */}
        {step === 0 && (
          <View>
            <Text style={st.title}>Select Import Type</Text>
            <Text style={st.sub}>What type of data are you importing?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              {IMPORT_TYPES.map(t => (
                <TouchableOpacity key={t.id} style={{ width: '47%' }} onPress={() => {
                  setImportType(t.id);
                  // Daily input defaults to yesterday — most common case is importing yesterday's draws
                  if (t.id === 'daily_input') setConfig(c => ({ ...c, import_date: yesterdayDefault }));
                  else setConfig(c => ({ ...c, import_date: todayDefault }));
                  setStep(1);
                }} activeOpacity={0.8}>
                  <Card style={{ padding: 16, borderWidth: importType === t.id ? 2 : 1, borderColor: importType === t.id ? t.color : theme.colors.border }}>
                    <Text style={{ fontSize: 26, marginBottom: 8 }}>{t.icon}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>{t.label}</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.textSecondary, lineHeight: 15, marginBottom: 8 }}>{t.desc}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                      {t.headers.map(h => <Pill key={h} label={h} color={t.color} />)}
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 1: Configure */}
        {step === 1 && (
          <View>
            <Text style={st.title}>Configure Import</Text>
            <Text style={st.sub}>Set scope, horizon, and class for this import.</Text>
            <Text style={st.fieldLabel}>SCOPE</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {[['midday', '☀️ Midday'], ['evening', '🌙 Evening'], ['allday', '◈ All Day']].map(([id, lbl]) => (
                <TouchableOpacity key={id} style={[st.optBtn, config.scope === id && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, scope: id }))}>
                  <Text style={[st.optBtnText, config.scope === id && st.optBtnTextOn]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(importType === 'box_history' || importType === 'pair_history') && (
              <>
                <Text style={st.fieldLabel}>HORIZON</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {HORIZONS.map(h => (
                      <TouchableOpacity key={h} style={[st.optBtn, config.horizon === h && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, horizon: h }))}>
                        <Text style={[st.optBtnText, config.horizon === h && st.optBtnTextOn]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            {importType === 'pair_history' && (
              <>
                <Text style={st.fieldLabel}>PAIR CLASS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {PAIR_CLASSES.map(pc => (
                      <TouchableOpacity key={pc.id} style={[st.optBtn, config.class_id === pc.id && st.optBtnOn]} onPress={() => setConfig(c => ({ ...c, class_id: pc.id }))}>
                        <Text style={[st.optBtnText, config.class_id === pc.id && st.optBtnTextOn]}>Cls {pc.id}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Date picker for daily_input and ledger */}
            {(importType === 'daily_input' || importType === 'ledger') && (
              <>
                <Text style={st.fieldLabel}>IMPORT DATE</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                  {[0, 1, 2, 3, 4, 5, 6].map(daysAgo => {
                    const todayET = getTodayET();
                    const d = new Date(todayET + 'T12:00:00'); d.setDate(d.getDate() - daysAgo);
                    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    const label = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yest.' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <TouchableOpacity
                        key={dateStr}
                        style={[st.optBtn, config.import_date === dateStr && st.optBtnOn, { paddingHorizontal: 8 }]}
                        onPress={() => setConfig(c => ({ ...c, import_date: dateStr }))}
                      >
                        <Text style={[st.optBtnText, config.import_date === dateStr && st.optBtnTextOn, { fontSize: 10 }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {importType === 'daily_input' && (
                  <Card style={{ padding: 10, marginBottom: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '28' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>
                      📅 This import will be tagged as date: {config.import_date} · scope: {config.scope}
                    </Text>
                  </Card>
                )}
                {importType === 'ledger' && (
                  <Card style={{ padding: 10, marginBottom: 14, backgroundColor: theme.colors.tealLight, borderColor: theme.colors.teal + '28' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.teal }}>
                      📋 Expected date: {config.import_date} · scope: {config.scope}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 2 }}>
                      A warning will appear if parsed results don't match this date.
                    </Text>
                  </Card>
                )}
              </>
            )}

            <Card style={{ padding: 12, marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>Import will create:</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>
                {importType === 'box_history' ? 'Box Class (1)' : importType === 'pair_history' ? 'Pair Class (' + config.class_id + ')' : ''}{config.horizon ? ' · ' + config.horizon : ''} · Scope: {config.scope}{(importType === 'daily_input' || importType === 'ledger') ? ' · Date: ' + config.import_date : ''}
              </Text>
            </Card>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={st.btnPrimary} onPress={() => setStep(2)}><Text style={st.btnPrimaryText}>Continue →</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setStep(0)}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2: Upload CSV */}
        {step === 2 && (
          <View>
            <Text style={st.title}>{importType === 'ledger' ? 'Paste Lotterypost Results' : 'Upload CSV'}</Text>
            <Text style={st.sub}>{importType === 'ledger' ? 'Copy the full results page from lotterypost.com and paste below.' : `Paste your CSV data. Required: ${typeInfo?.headers.join(', ')}`}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(typeInfo?.headers ?? []).map(h => <Pill key={h} label={h} color={theme.colors.primary} />)}
              </View>
            </ScrollView>
            <TextInput
              style={st.csvInput}
              value={csvText}
              onChangeText={setCsvText}
              placeholder={importType === 'ledger'
                ? 'Paste raw results from lotterypost.com.\n\nState Name\nGame\tDate\tResult\nGame\tDate\tResult\nNext State\n...'
                : "Paste CSV here, or tap 'Load Sample'..."}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: validating ? 0.6 : 1 }]} onPress={handleValidate} disabled={validating}>
                <Text style={st.btnPrimaryText}>{validating ? '⏳ Validating…' : 'Validate & Preview →'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setCsvText(generateSample())}><Text style={st.btnGhostText}>Sample</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setStep(1)}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Review */}
        {step === 3 && parsed && (
          <View>
            <Text style={st.title}>Review & Commit</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[{ l:'Accepted', v: parsed.accepted, c: theme.colors.success }, { l:'Rejected', v: parsed.rejected, c: theme.colors.error }, { l:'Fixed', v: parsed.fixed, c: theme.colors.gold }, { l:'Total', v: parsed.totalRows, c: theme.colors.primary }].map(s => (
                <Card key={s.l} style={{ flex: 1, minWidth: 70, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: 'Courier' }}>{s.v}</Text>
                  <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700' }}>{s.l}</Text>
                </Card>
              ))}
            </View>
            {parsed.warnings?.length > 0 && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.gold, marginBottom: 4 }}>⚠️ Warnings</Text>
                {parsed.warnings.map((w: string, i: number) => <Text key={i} style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{w}</Text>)}
              </Card>
            )}
            <Card style={{ padding: 12, marginBottom: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '28' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, marginBottom: 4 }}>Import Configuration</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>
                Type: {importType}{importType === 'pair_history' ? ' · Class ' + config.class_id : importType === 'box_history' ? ' · Class 1' : ''}{config.horizon && (importType === 'box_history' || importType === 'pair_history') ? ' · ' + config.horizon : ''} · Scope: {config.scope}
              </Text>
            </Card>
            {commitError && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.error, marginBottom: 4 }}>✗ Import Failed</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{commitError}</Text>
              </Card>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: importing || parsed.accepted === 0 ? 0.6 : 1 }]} onPress={handleCommit} disabled={importing || parsed.accepted === 0}>
                <Text style={st.btnPrimaryText}>{importing ? '⏳ Writing to Supabase…' : '✓ Commit Import'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => { setStep(2); setCommitError(null); }}><Text style={st.btnGhostText}>← Back</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Result — uses real ImportSummary from Supabase */}
        {step === 4 && result && (
          <View>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 48, marginBottom: 8 }}>✅</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.success, marginBottom: 4 }}>Import Committed</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textTertiary, fontFamily: 'Courier' }} numberOfLines={1}>ID: {result.id}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[{ l:'Accepted', v: result.accepted, c: theme.colors.success }, { l:'Rejected', v: result.rejected, c: theme.colors.error }, { l:'Fixed', v: result.fixed ?? 0, c: theme.colors.gold }].map(s => (
                <Card key={s.l} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: 'Courier' }}>{s.v}</Text>
                  <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700' }}>{s.l}</Text>
                </Card>
              ))}
            </View>
            {result.warnings?.length > 0 && (
              <Card style={{ padding: 12, marginBottom: 10, backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.gold, marginBottom: 4 }}>⚠️ Warnings</Text>
                {result.warnings.slice(0, 5).map((w: string, i: number) => <Text key={i} style={{ fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{w}</Text>)}
              </Card>
            )}
            <Card style={{ padding: 14, marginBottom: 14, backgroundColor: theme.colors.successLight, borderColor: theme.colors.success + '33' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.success, marginBottom: 6 }}>✓ Supabase write confirmed</Text>
              {(importType === 'box_history' || importType === 'pair_history') ? (
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 }}>
                  P99 cap computed · Percentile map saved · Horizon blend updated{result.p99_cap ? ` · P99 cap: ${result.p99_cap}` : ''}{result.first_seen ? `\nFirst seen: ${result.first_seen} · Last seen: ${result.last_seen}` : ''}
                </Text>
              ) : importType === 'ledger' ? (
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 }}>
                  {result.accepted} draw results inserted into histories · ON CONFLICT DO NOTHING applied for duplicates
                </Text>
              ) : (
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                  Daily input logged for scope: {config.scope}
                </Text>
              )}
            </Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={st.btnPrimary} onPress={() => { setStep(0); setImportType(null); setParsed(null); setParsedData(null); setCsvText(''); setResult(null); setCommitError(null); }}>
                <Text style={st.btnPrimaryText}>Import Another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setView('history')}><Text style={st.btnGhostText}>View History</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnGhost} onPress={() => setView('dashboard')}><Text style={st.btnGhostText}>← Dashboard</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Import History View ──────────────────────────────────────────────────────
function ImportHistoryView() {
  const { softDeleteImport, undoSoftDeleteImport, hardDeleteImport } = useDataIngestion();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/imports?order=created_at.desc&limit=100' });
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds(prev => { const s = new Set(prev); busy ? s.add(id) : s.delete(id); return s; });

  const handleSoftDelete = useCallback(async (id: string) => {
    setBusy(id, true);
    try { await softDeleteImport(id); await loadData(); }
    catch (e) { Alert.alert('Delete Failed', String(e instanceof Error ? e.message : e)); }
    finally { setBusy(id, false); }
  }, [softDeleteImport, loadData]);

  const handleUndo = useCallback(async (id: string) => {
    setBusy(id, true);
    try { await undoSoftDeleteImport(id); await loadData(); }
    catch (e) { Alert.alert('Restore Failed', String(e instanceof Error ? e.message : e)); }
    finally { setBusy(id, false); }
  }, [undoSoftDeleteImport, loadData]);

  const handleHardDelete = useCallback((id: string, importType?: string) => {
    const isDaily = importType === 'daily_input';
    const msg = isDaily
      ? 'Daily input data is embedded in draws_since values and cannot be individually reversed. The import record will be removed.\n\nContinue?'
      : 'This permanently removes the import and all its associated data rows. This cannot be undone.';
    Alert.alert('Permanently Delete?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Forever', style: 'destructive', onPress: async () => {
        setBusy(id, true);
        try {
          const result = await hardDeleteImport(id, importType);
          await loadData();
          setExpanded(null);
          if (result && result !== 'Deleted import and all associated dataset rows.') {
            Alert.alert('Deleted', result);
          }
        }
        catch (e) { Alert.alert('Hard Delete Failed', String(e instanceof Error ? e.message : e)); }
        finally { setBusy(id, false); }
      }},
    ]);
  }, [hardDeleteImport, loadData]);

  const filtered = data.filter(i => typeFilter === 'all' || i.type === typeFilter);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => setSelectedIds(new Set(filtered.map(i => i.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkSoftDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    Alert.alert(
      `Soft Delete ${ids.length} Import${ids.length > 1 ? 's' : ''}?`,
      'Dataset rows will be hidden but not permanently removed. You can undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Soft Delete', style: 'destructive', onPress: async () => {
          setBulkBusy(true);
          for (const id of ids) { try { await softDeleteImport(id); } catch {} }
          setSelectedIds(new Set());
          await loadData();
          setBulkBusy(false);
        }},
      ],
    );
  }, [selectedIds, softDeleteImport, loadData]);

  const handleBulkHardDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    Alert.alert(
      `Permanently Delete ${ids.length} Import${ids.length > 1 ? 's' : ''}?`,
      'All dataset rows for these imports will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Forever', style: 'destructive', onPress: async () => {
          setBulkBusy(true);
          setBulkProgress({ done: 0, total: ids.length });
          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const rec = data.find((d: any) => d.id === id);
            try { await hardDeleteImport(id, rec?.type); } catch {}
            setBulkProgress({ done: i + 1, total: ids.length });
          }
          setSelectedIds(new Set());
          setBulkProgress(null);
          await loadData();
          setBulkBusy(false);
          Alert.alert('Done', `Deleted ${ids.length} import${ids.length > 1 ? 's' : ''} and associated data rows.`);
        }},
      ],
    );
  }, [selectedIds, hardDeleteImport, loadData, data]);

  const statusColor = (s: string) =>
    s === 'completed' ? theme.colors.success
    : s === 'failed' ? theme.colors.error
    : s === 'deleted' ? theme.colors.textTertiary
    : theme.colors.gold;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Loading imports…</Text>
      </View>
    );
  }
  if (fetchError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 24, marginBottom: 8 }}>⚠️</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.error, marginBottom: 4, textAlign: 'center' }}>Failed to load imports</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>{fetchError}</Text>
        <TouchableOpacity style={st.btnPrimary} onPress={loadData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Filter bar ── */}
      <View style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, padding: 10, flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([['all','All'], ['box_history','Box'], ['pair_history','Pairs'], ['daily_input','Daily'], ['ledger','Ledger']] as [string,string][]).map(([id, lbl]) => (
              <TouchableOpacity key={id} style={[st.filterBtn, typeFilter === id && st.filterBtnOn]} onPress={() => setTypeFilter(id)}>
                <Text style={[st.filterBtnText, typeFilter === id && { color: '#fff' }]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity onPress={loadData} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 18, color: theme.colors.primary }}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── Bulk action toolbar ── */}
      {filtered.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: selectedIds.size > 0 ? theme.colors.primaryLight : theme.colors.surfaceLight, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          {selectedIds.size === 0 ? (
            <>
              <TouchableOpacity onPress={selectAll} style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 10 }]}>
                <Text style={[st.btnGhostText, { fontSize: 11 }]}>Select All ({filtered.length})</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, flex: 1 }}>{selectedIds.size} selected</Text>
              <TouchableOpacity onPress={clearSelection} style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8 }]}>
                <Text style={[st.btnGhostText, { fontSize: 11 }]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkSoftDelete}
                disabled={bulkBusy}
                style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8, opacity: bulkBusy ? 0.5 : 1 }]}
              >
                <Text style={[st.btnGhostText, { fontSize: 11, color: theme.colors.orange }]}>
                  {bulkBusy ? '⏳' : '🗑 Soft Delete'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkHardDelete}
                disabled={bulkBusy}
                style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8, opacity: bulkBusy ? 0.5 : 1 }]}
              >
                <Text style={[st.btnGhostText, { fontSize: 11, color: theme.colors.error }]}>
                  {bulkProgress ? `💥 ${bulkProgress.done}/${bulkProgress.total}` : '💥 Hard Delete'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📭</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No imports yet</Text>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' }}>
            Use the Import Wizard to add Box History, Pair History, Daily Input, or Results Ledger data.
          </Text>
        </View>
      ) : (
        <ScrollView>
          {filtered.map((imp) => {
            const isExpanded = expanded === imp.id;
            const isDeleted = !!imp.deleted_at;
            const isBusy = busyIds.has(imp.id);
            const isChecked = selectedIds.has(imp.id);
            const typeInfo = IMPORT_TYPES.find(t => t.id === imp.type);
            const badgeStatus = isDeleted ? 'deleted' : imp.status;
            return (
              <View key={imp.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <TouchableOpacity
                  style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isChecked ? theme.colors.primaryLight : isDeleted ? theme.colors.surfaceLight : theme.colors.surface }}
                  onPress={() => setExpanded(isExpanded ? null : imp.id)}
                  activeOpacity={0.85}
                >
                  {/* Checkbox */}
                  <TouchableOpacity
                    onPress={() => toggleSelect(imp.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: isChecked ? theme.colors.primary : theme.colors.border, backgroundColor: isChecked ? theme.colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isChecked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>

                  <Text style={{ fontSize: 18, opacity: isDeleted ? 0.4 : 1 }}>{typeInfo?.icon ?? '📦'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDeleted ? theme.colors.textTertiary : theme.colors.text }}>
                      {imp.type}{imp.horizon_label ? ' · ' + imp.horizon_label : ''}{imp.class_id != null ? ' · Class ' + imp.class_id : ''}
                    </Text>
                    <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>
                      {imp.scope ?? '—'} · {new Date(imp.created_at).toLocaleString()}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                      {imp.counts != null && <Text style={{ fontSize: 10, color: theme.colors.success }}>✓ {imp.counts} rows</Text>}
                      {imp.error_text && <Text style={{ fontSize: 10, color: theme.colors.error }} numberOfLines={1}>✗ {imp.error_text}</Text>}
                    </View>
                  </View>
                  <Pill label={badgeStatus} color={statusColor(badgeStatus)} />
                  <TouchableOpacity
                    onPress={() => handleHardDelete(imp.id, imp.type)}
                    disabled={isBusy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 6, opacity: isBusy ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 16, color: theme.colors.error }}>🗑</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Expanded detail */}
                {isExpanded && (
                  <View style={{ margin: 10, padding: 12, backgroundColor: theme.colors.background, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}>
                    {([
                      ['ID', imp.id],
                      ['Type', imp.type],
                      imp.class_id != null ? ['Class', String(imp.class_id)] : null,
                      imp.horizon_label ? ['Horizon', imp.horizon_label] : null,
                      imp.scope ? ['Scope', imp.scope] : null,
                      ['Status', imp.status],
                      imp.counts != null ? ['Row Count', String(imp.counts)] : null,
                      imp.error_text ? ['Error', imp.error_text] : null,
                      ['Created', new Date(imp.created_at).toLocaleString()],
                      imp.deleted_at ? ['Deleted At', new Date(imp.deleted_at).toLocaleString()] : null,
                    ] as ([string, string] | null)[]).filter(Boolean).map((row) => (
                      <View key={row![0]} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: theme.colors.border + '55' }}>
                        <Text style={{ fontSize: 11, color: theme.colors.textTertiary, width: 80 }}>{row![0]}</Text>
                        <Text style={{ fontSize: 11, color: theme.colors.text, fontFamily: 'Courier', fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={2}>{row![1]}</Text>
                      </View>
                    ))}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {!isDeleted ? (
                        <TouchableOpacity
                          style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1 }]}
                          onPress={() => handleSoftDelete(imp.id)}
                          disabled={isBusy}
                        >
                          <Text style={[st.btnGhostText, { color: theme.colors.orange }]}>
                            {isBusy ? '⏳ Working…' : '🗑 Soft Delete'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1 }]}
                          onPress={() => handleUndo(imp.id)}
                          disabled={isBusy}
                        >
                          <Text style={[st.btnGhostText, { color: theme.colors.success }]}>
                            {isBusy ? '⏳ Restoring…' : '↩ Undo Delete'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1, borderColor: theme.colors.error + '44' }]}
                        onPress={() => handleHardDelete(imp.id, imp.type)}
                        disabled={isBusy}
                      >
                        <Text style={[st.btnGhostText, { color: theme.colors.error }]}>
                          {isBusy ? '⏳ Working…' : '💥 Hard Delete'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Coverage Matrix View ─────────────────────────────────────────────────────
function CoverageMatrixView({ setView }: { setView: (v: string) => void }) {
  const [matrixTab, setMatrixTab] = useState<'history' | 'daily_input' | 'results'>('history');

  // ── Box/Pair History tab ──
  const [scopeTab, setScopeTab] = useState<'midday' | 'evening' | 'allday'>('midday');
  const [coverageRows, setCoverageRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [clearingScope, setClearingScope] = useState<string | null>(null);
  // CLEAR confirmation modal
  const [clearModal, setClearModal] = useState<{ scope: string; label: string } | null>(null);
  const [clearConfirmText, setClearConfirmText] = useState('');

  // ── Daily Input tab ──
  const [dailyImports, setDailyImports] = useState<{ scope: string; date: string }[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  // ── Results Ledger tab ──
  const [historyRows, setHistoryRows] = useState<{ date_et: string; session: string; jurisdiction: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const today = useMemo(() => getTodayET(), []);
  const yesterday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);
  const last30Days = useMemo(() => {
    const todayET = getTodayET();
    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(todayET + 'T12:00:00');
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    }
    return days;
  }, []);

  const loadBoxPairData = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_coverage_summary?select=*' });
      setCoverageRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  // Clear handlers declared AFTER loadBoxPairData to avoid TDZ crash in Hermes
  const handleClearScope = useCallback((scope: string) => {
    setClearConfirmText('');
    setClearModal({ scope, label: scope === 'all' ? 'ALL scopes' : scope });
  }, []);

  const handleClearAllScopes = useCallback(() => {
    setClearConfirmText('');
    setClearModal({ scope: 'all', label: 'ALL scopes' });
  }, []);

  const executeClear = useCallback(async () => {
    if (!clearModal || clearConfirmText.trim().toUpperCase() !== 'CLEAR') return;
    const { scope } = clearModal;
    setClearModal(null);
    setClearConfirmText('');
    setClearingScope(scope);
    try {
      let queries: Promise<any>[];
      if (scope === 'all') {
        queries = [
          fetchFromSupabase({ path: `/rest/v1/datasets_box?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/datasets_pair?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/percentile_maps?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/horizon_blends?id=not.is.null`, method: 'DELETE' }),
        ];
      } else {
        const enc = encodeURIComponent(scope);
        queries = [
          fetchFromSupabase({ path: `/rest/v1/datasets_box?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/datasets_pair?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/percentile_maps?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/horizon_blends?scope=eq.${enc}`, method: 'DELETE' }),
        ];
      }
      const results = await Promise.allSettled(queries);
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => String(r.reason instanceof Error ? r.reason.message : r.reason));
      if (errors.length > 0) {
        Alert.alert('Clear Partially Failed', errors.slice(0, 3).join('\n'));
      } else {
        Alert.alert('Cleared', `Coverage data for ${clearModal.label} has been removed.`);
      }
      await loadBoxPairData();
    } catch (e) {
      Alert.alert('Clear Failed', String(e instanceof Error ? e.message : e));
    } finally {
      setClearingScope(null);
    }
  }, [clearModal, clearConfirmText, loadBoxPairData]);

  const loadDailyData = useCallback(async () => {
    setDailyLoading(true); setDailyError(null);
    try {
      const rows = await fetchFromSupabase<{ scope: string; created_at: string; file_meta: any }[]>({
        path: '/rest/v1/imports?type=eq.daily_input&status=eq.completed&deleted_at=is.null&select=scope,created_at,file_meta&order=created_at.desc&limit=200',
      });
      setDailyImports((Array.isArray(rows) ? rows : []).map(r => {
        // Use file_meta.import_date (the date the data is FOR), fall back to created_at date
        let date = r.created_at ? r.created_at.split('T')[0] : '';
        try {
          const meta = typeof r.file_meta === 'string' ? JSON.parse(r.file_meta) : r.file_meta;
          if (meta?.import_date) date = meta.import_date;
        } catch {}
        return { scope: r.scope, date };
      }));
    } catch (e) {
      setDailyError(String(e instanceof Error ? e.message : e));
    } finally { setDailyLoading(false); }
  }, []);

  const loadHistoryData = useCallback(async () => {
    setHistoryLoading(true); setHistoryError(null);
    try {
      const rows = await fetchFromSupabase<{ date_et: string; session: string; jurisdiction: string }[]>({
        path: '/rest/v1/histories?select=date_et,session,jurisdiction&order=date_et.desc&limit=5000&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)',
      });
      setHistoryRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setHistoryError(String(e instanceof Error ? e.message : e));
    } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { loadBoxPairData(); }, [loadBoxPairData]);
  useEffect(() => {
    if (matrixTab === 'daily_input') loadDailyData();
    if (matrixTab === 'results') loadHistoryData();
  }, [matrixTab, loadDailyData, loadHistoryData]);

  // ── Daily Input lookups ──
  const dailySet = useMemo(() => {
    const s = new Set<string>();
    dailyImports.forEach(r => { if (r.date && r.scope) s.add(`${r.date}-${r.scope}`); });
    return s;
  }, [dailyImports]);
  const last7DailyCount = useMemo(() => {
    let count = 0;
    last30Days.slice(0, 7).forEach(d => {
      ['midday', 'evening', 'allday'].forEach(sc => { if (dailySet.has(`${d}-${sc}`)) count++; });
    });
    return count;
  }, [dailySet, last30Days]);
  const todayHasDailyInput = ['midday', 'evening', 'allday'].some(sc => dailySet.has(`${today}-${sc}`));

  // ── Results lookups ──
  const resultsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    historyRows.forEach(r => {
      const key = `${r.date_et}-${r.session}`;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(r.jurisdiction);
    });
    return m;
  }, [historyRows]);
  const yesterdayHasResults = ['midday', 'evening'].some(s => (resultsMap.get(`${yesterday}-${s}`)?.size ?? 0) > 0);

  // ── Box/Pair lookup ──
  const classes = [{ id: 1, label: 'Box', type: 'box' }, ...PAIR_CLASSES.map(p => ({ ...p, type: 'pair' }))];
  const lookup = useMemo(() => {
    const map: Record<string, number> = {};
    coverageRows.forEach(r => {
      const key = `${r.class_id}-${r.scope}-${r.horizon_label}`;
      map[key] = (map[key] ?? 0) + (r.row_count ?? 0);
    });
    return map;
  }, [coverageRows]);
  const h01yPresent = classes.filter(c => (lookup[`${c.id}-${scopeTab}-H01Y`] ?? 0) > 0).length;
  const h01yPct = Math.round((h01yPresent / classes.length) * 100);
  const h01yMissing = classes.filter(c => !((lookup[`${c.id}-${scopeTab}-H01Y`] ?? 0) > 0)).map(c => c.label);

  const formatDateShort = (d: string) => {
    try {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return d; }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Matrix tab bar ── */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 8, gap: 5 }}>
        {[
          { id: 'history', label: 'Box & Pair' },
          { id: 'daily_input', label: 'Daily Input' },
          { id: 'results', label: 'Results' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[st.optBtn, matrixTab === t.id && st.optBtnOn, { flex: 1, paddingHorizontal: 6 }]}
            onPress={() => setMatrixTab(t.id as any)}
          >
            <Text style={[st.optBtnText, matrixTab === t.id && st.optBtnTextOn, { textAlign: 'center', fontSize: 10 }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab: Box & Pair History ── */}
      {matrixTab === 'history' && (
        loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Loading coverage matrix…</Text>
          </View>
        ) : fetchError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 24, marginBottom: 8 }}>⚠️</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.error, marginBottom: 4, textAlign: 'center' }}>Failed to load coverage</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>{fetchError}</Text>
            <TouchableOpacity style={st.btnPrimary} onPress={loadBoxPairData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* ── Clear Coverage Section ── */}
            <View style={{ backgroundColor: theme.colors.surfaceLight, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.error + '30', padding: 14, marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.error, letterSpacing: 1, marginBottom: 6 }}>CLEAR COVERAGE DATA</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 10, lineHeight: 16 }}>
                Permanently removes dataset rows for a scope. Use before re-importing to avoid duplicates.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['midday', 'evening', 'allday'] as const).map(sc => (
                  <TouchableOpacity
                    key={sc}
                    onPress={() => handleClearScope(sc)}
                    disabled={clearingScope !== null}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.error + '44', backgroundColor: theme.colors.error + '08', opacity: clearingScope !== null ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.error }}>
                      {clearingScope === sc ? '⏳ Clearing…' : `Clear ${sc}`}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={handleClearAllScopes}
                  disabled={clearingScope !== null}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: theme.colors.error, backgroundColor: theme.colors.error + '12', opacity: clearingScope !== null ? 0.5 : 1 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.error }}>
                    {clearingScope === 'all' ? '⏳ Clearing All…' : '💥 Clear All Scopes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>Horizon Coverage Matrix</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 }}>✓ = data present · ⌛ = missing. K6 requires H01Y for all 11 classes</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {(['midday', 'evening', 'allday'] as const).map(s => (
                <TouchableOpacity key={s} style={[st.optBtn, scopeTab === s && st.optBtnOn, { flex: 1 }]} onPress={() => setScopeTab(s)}>
                  <Text style={[st.optBtnText, scopeTab === s && st.optBtnTextOn]}>
                    {s === 'midday' ? '☀️ Midday' : s === 'evening' ? '🌙 Evening' : '◈ All Day'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card style={{ padding: 12, marginBottom: 16, backgroundColor: h01yPct === 100 ? theme.colors.successLight : theme.colors.goldLight, borderColor: (h01yPct === 100 ? theme.colors.success : theme.colors.gold) + '44' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: h01yPct === 100 ? theme.colors.success : theme.colors.gold }}>
                H01Y Coverage ({scopeTab}): {h01yPct}% · {h01yPresent}/{classes.length} classes
              </Text>
              {h01yMissing.length > 0 && (
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>Missing: {h01yMissing.join(', ')}</Text>
              )}
            </Card>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceLight }}>
                  <View style={{ width: 120, padding: 8 }}><Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary }}>CLASS</Text></View>
                  {HORIZONS.map(h => (
                    <View key={h} style={{ width: 50, padding: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.textTertiary }}>{h}</Text>
                    </View>
                  ))}
                </View>
                {classes.map((cls, ci) => (
                  <View key={cls.id} style={{ flexDirection: 'row', backgroundColor: ci % 2 === 0 ? theme.colors.surface : theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border + '66' }}>
                    <View style={{ width: 120, padding: 8, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ backgroundColor: cls.type === 'box' ? theme.colors.primaryLight : theme.colors.cosmicLight, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: theme.colors.primary }}>{cls.type === 'box' ? 'BOX' : 'PAIR'}</Text>
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: theme.colors.textSecondary }} numberOfLines={1}>{(cls as any).label ?? 'Class ' + cls.id}</Text>
                      </View>
                    </View>
                    {HORIZONS.map(h => {
                      const count = lookup[`${cls.id}-${scopeTab}-${h}`] ?? 0;
                      const ok = count > 0;
                      return (
                        <View key={h} style={{ width: 50, padding: 4, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 42, height: 30, borderRadius: 6, backgroundColor: ok ? theme.colors.successLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: (ok ? theme.colors.success : theme.colors.border) + '55', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, color: ok ? theme.colors.success : theme.colors.textTertiary, lineHeight: 12 }}>{ok ? '✓' : '⌛'}</Text>
                            {ok && <Text style={{ fontSize: 7, color: theme.colors.success + 'AA', lineHeight: 8 }}>{count >= 1000 ? Math.round(count / 1000) + 'k' : count}</Text>}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            {coverageRows.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 24, padding: 16 }}>
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' }}>No coverage data found. Import Box History or Pair History data first.</Text>
              </View>
            )}
            {h01yPresent === 0 && coverageRows.length > 0 && (
              <Card style={{ padding: 10, marginTop: 8, backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.gold }}>
                  ⚠️ No {scopeTab} data — ZK6 will use allday fallback for this scope
                </Text>
              </Card>
            )}
          </ScrollView>
        )
      )}

      {/* ── Tab: Daily Input Coverage ── */}
      {matrixTab === 'daily_input' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>Daily Input Coverage</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 }}>Last 30 days · GREEN = imported for that scope/day</Text>

          <Card style={{ padding: 12, marginBottom: 8, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary }}>
              Last 7 days: {last7DailyCount}/21 sessions imported
            </Text>
          </Card>

          {!todayHasDailyInput && (
            <Card style={{ padding: 12, marginBottom: 12, backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.error }}>
                ⚠️ No daily input for today — ZK6 picks may be stale
              </Text>
            </Card>
          )}

          {dailyLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 20 }} />
          ) : dailyError ? (
            <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
              <Text style={{ fontSize: 24 }}>⚠️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.error, textAlign: 'center' }}>{dailyError}</Text>
              <TouchableOpacity style={st.btnPrimary} onPress={loadDailyData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 6, paddingHorizontal: 2 }}>
                <View style={{ width: 84 }}><Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1 }}>DATE</Text></View>
                {['MIDDAY', 'EVENING', 'ALL DAY'].map(sc => (
                  <View key={sc} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.5 }}>{sc}</Text>
                  </View>
                ))}
              </View>
              {last30Days.map(d => {
                const isToday = d === today;
                const isYday = d === yesterday;
                return (
                  <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingHorizontal: 2, backgroundColor: isToday ? theme.colors.primaryLight + '55' : 'transparent', borderRadius: 6 }}>
                    <View style={{ width: 84 }}>
                      <Text style={{ fontSize: 10, color: isToday ? theme.colors.primary : isYday ? theme.colors.gold : theme.colors.textSecondary, fontWeight: (isToday || isYday) ? '700' : '400', fontFamily: 'Courier' }}>
                        {isToday ? 'Today' : isYday ? 'Yesterday' : formatDateShort(d)}
                      </Text>
                    </View>
                    {(['midday', 'evening', 'allday'] as const).map(sc => {
                      const has = dailySet.has(`${d}-${sc}`);
                      return (
                        <TouchableOpacity
                          key={sc}
                          style={{ flex: 1, marginHorizontal: 2, height: 28, borderRadius: 6, backgroundColor: has ? theme.colors.successLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: has ? theme.colors.success + '55' : theme.colors.border + '44', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => { if (!has) setView('wizard'); }}
                          activeOpacity={has ? 1 : 0.65}
                        >
                          <Text style={{ fontSize: 11, color: has ? theme.colors.success : theme.colors.textTertiary }}>
                            {has ? '✓' : '+'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Tab: Results Ledger Coverage ── */}
      {matrixTab === 'results' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>Results Ledger Coverage</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 }}>Last 30 days · GREEN = 30+ states · YELLOW = partial · + = missing</Text>

          <Card style={{ padding: 12, marginBottom: 8, backgroundColor: theme.colors.tealLight, borderColor: theme.colors.teal + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.teal }}>Results Coverage: last 30 days</Text>
          </Card>

          {!yesterdayHasResults && (
            <Card style={{ padding: 12, marginBottom: 12, backgroundColor: theme.colors.error + '15', borderColor: theme.colors.error + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.error }}>
                ⚠️ Yesterday's results not imported — hit tracking unavailable
              </Text>
            </Card>
          )}

          {historyLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 20 }} />
          ) : historyError ? (
            <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
              <Text style={{ fontSize: 24 }}>⚠️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.error, textAlign: 'center' }}>{historyError}</Text>
              <TouchableOpacity style={st.btnPrimary} onPress={loadHistoryData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 6, paddingHorizontal: 2 }}>
                <View style={{ width: 84 }}><Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1 }}>DATE</Text></View>
                {['MIDDAY', 'EVENING'].map(s => (
                  <View key={s} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.5 }}>{s}</Text>
                  </View>
                ))}
              </View>
              {last30Days.map(d => {
                const isToday = d === today;
                const isYday = d === yesterday;
                return (
                  <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingHorizontal: 2, backgroundColor: isToday ? theme.colors.primaryLight + '44' : 'transparent', borderRadius: 6 }}>
                    <View style={{ width: 84 }}>
                      <Text style={{ fontSize: 10, color: isToday ? theme.colors.primary : isYday ? theme.colors.gold : theme.colors.textSecondary, fontWeight: (isToday || isYday) ? '700' : '400', fontFamily: 'Courier' }}>
                        {isToday ? 'Today' : isYday ? 'Yesterday' : formatDateShort(d)}
                      </Text>
                    </View>
                    {(['midday', 'evening'] as const).map(session => {
                      const count = resultsMap.get(`${d}-${session}`)?.size ?? 0;
                      const isFull = count >= 30;
                      const isPartial = count > 0 && count < 30;
                      const bgColor = isFull ? theme.colors.successLight : isPartial ? theme.colors.goldLight : theme.colors.surfaceLight;
                      const bdColor = isFull ? theme.colors.success + '55' : isPartial ? theme.colors.gold + '55' : theme.colors.border + '44';
                      const textColor = isFull ? theme.colors.success : isPartial ? theme.colors.gold : theme.colors.textTertiary;
                      return (
                        <TouchableOpacity
                          key={session}
                          style={{ flex: 1, marginHorizontal: 2, height: 34, borderRadius: 6, backgroundColor: bgColor, borderWidth: 1, borderColor: bdColor, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => { if (count === 0) setView('wizard'); }}
                          activeOpacity={count === 0 ? 0.65 : 1}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: textColor, lineHeight: 12 }}>
                            {isFull ? '✓' : isPartial ? '~' : '+'}
                          </Text>
                          {count > 0 && (
                            <Text style={{ fontSize: 7, color: textColor + 'CC', lineHeight: 9 }}>{count}st</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── CLEAR confirmation modal ── */}
      <Modal
        transparent
        visible={clearModal !== null}
        animationType="fade"
        onRequestClose={() => { setClearModal(null); setClearConfirmText(''); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: theme.colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: theme.colors.error + '55' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.error, marginBottom: 6 }}>
              ⚠️ Clear {clearModal?.label ?? ''} coverage data?
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
              This permanently removes all box, pair, percentile, and blend rows for this scope. This cannot be undone.{'\n\n'}Type CLEAR to confirm.
            </Text>
            <TextInput
              value={clearConfirmText}
              onChangeText={setClearConfirmText}
              placeholder="Type CLEAR here"
              autoCapitalize="characters"
              style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, color: theme.colors.text, backgroundColor: theme.colors.background, marginBottom: 14, fontSize: 13 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setClearModal(null); setClearConfirmText(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={executeClear}
                disabled={clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: clearConfirmText.trim().toUpperCase() === 'CLEAR' ? theme.colors.error : theme.colors.error + '44' }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Confirm Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Health Tests View ────────────────────────────────────────────────────────
function HealthTestsView() {
  type TS = { s: 'idle' | 'running' | 'success' | 'error'; msg: string; ms?: number | null; detail?: string | null };
  const idle = (hint: string): TS => ({ s: 'idle', msg: hint, ms: null, detail: null });

  const [tests, setTests] = useState<Record<string, TS>>({
    conn:     idle('Ping /rest/v1/app_config'),
    snap:     idle('Query v_latest_slate_snapshots'),
    imports:  idle('Query v_import_health'),
    datasets: idle('Check datasets_box for rows'),
  });
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const setT = useCallback((k: string, v: TS) => setTests(t => ({ ...t, [k]: v })), []);

  const runConn = useCallback(async () => {
    setT('conn', { s: 'running', msg: 'Pinging endpoint…', ms: null });
    const t0 = Date.now();
    try {
      await fetchFromSupabase({ path: '/rest/v1/app_config?limit=1' });
      const ms = Date.now() - t0;
      setT('conn', { s: 'success', msg: `Connected · Supabase healthy`, ms });
    } catch (e) {
      setT('conn', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runSnap = useCallback(async () => {
    setT('snap', { s: 'running', msg: 'Fetching snapshots…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_latest_slate_snapshots?select=*' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        const scopes = [...new Set(rows.map((r: any) => r.scope))].join(', ');
        const hash = String(rows[0]?.snapshot_hash ?? rows[0]?.hash ?? '').slice(0, 8);
        setT('snap', { s: 'success', msg: `${rows.length} snapshot(s) · scopes: ${scopes}`, ms, detail: hash || null });
      } else {
        setT('snap', { s: 'error', msg: 'No snapshots found — regenerate slate first', ms });
      }
    } catch (e) {
      setT('snap', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runImports = useCallback(async () => {
    setT('imports', { s: 'running', msg: 'Checking import health…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_import_health?select=*' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        const r = rows[0] as any;
        const total = r.total_imports ?? rows.length;
        const completed = r.completed ?? rows.filter((x: any) => x.status === 'completed').length;
        const failed = r.failed ?? rows.filter((x: any) => x.status === 'failed').length;
        const lastAt = r.last_import_at ? new Date(r.last_import_at).toLocaleDateString() : null;
        setT('imports', {
          s: completed > 0 ? 'success' : 'error',
          msg: `${total} total · ${completed} completed · ${failed} failed${lastAt ? ' · last: ' + lastAt : ''}`,
          ms,
        });
      } else {
        // Fallback: query imports table directly
        const fallback = await fetchFromSupabase<any[]>({ path: '/rest/v1/imports?select=id,status&limit=50' });
        const ms2 = Date.now() - t0;
        const comp = Array.isArray(fallback) ? fallback.filter((x: any) => x.status === 'completed').length : 0;
        setT('imports', {
          s: comp > 0 ? 'success' : 'error',
          msg: comp > 0 ? `${fallback?.length ?? 0} imports · ${comp} completed` : 'No completed imports yet',
          ms: ms2,
        });
      }
    } catch (e) {
      setT('imports', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runDatasets = useCallback(async () => {
    setT('datasets', { s: 'running', msg: 'Checking box dataset…', ms: null });
    const t0 = Date.now();
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/datasets_box?select=id&limit=1' });
      const ms = Date.now() - t0;
      if (Array.isArray(rows) && rows.length > 0) {
        setT('datasets', { s: 'success', msg: 'Box dataset present — data confirmed', ms });
      } else {
        setT('datasets', { s: 'error', msg: 'No box data imported yet', ms });
      }
    } catch (e) {
      setT('datasets', { s: 'error', msg: String(e instanceof Error ? e.message : e), ms: Date.now() - t0 });
    }
  }, [setT]);

  const runAll = useCallback(async () => {
    setRunning(true);
    await runConn();
    await runSnap();
    await runImports();
    await runDatasets();
    setLastRun(new Date());
    setRunning(false);
  }, [runConn, runSnap, runImports, runDatasets]);

  const SUITE: { k: string; l: string; h: string; fn: () => Promise<void> }[] = [
    { k: 'conn',     l: 'Connection Test',  h: 'GET /rest/v1/app_config?limit=1',              fn: runConn },
    { k: 'snap',     l: 'Snapshot Read',    h: 'GET /rest/v1/v_latest_slate_snapshots',         fn: runSnap },
    { k: 'imports',  l: 'Import Health',    h: 'GET /rest/v1/v_import_health',                  fn: runImports },
    { k: 'datasets', l: 'Datasets Check',   h: 'GET /rest/v1/datasets_box?select=id&limit=1',  fn: runDatasets },
  ];

  const dotColor = (s: string) =>
    s === 'success' ? theme.colors.success
    : s === 'error' ? theme.colors.error
    : s === 'running' ? theme.colors.gold
    : theme.colors.textTertiary;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: lastRun ? 4 : 16 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>Backend Health</Text>
        <TouchableOpacity style={[st.btnPrimary, { paddingHorizontal: 16, opacity: running ? 0.6 : 1 }]} onPress={runAll} disabled={running}>
          <Text style={st.btnPrimaryText}>{running ? '⏳ Running…' : '▶ Run All'}</Text>
        </TouchableOpacity>
      </View>
      {lastRun && (
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 14 }}>
          Last run: {lastRun.toLocaleTimeString()}
        </Text>
      )}

      {SUITE.map(t => {
        const state = tests[t.k];
        const bg = state.s === 'success' ? theme.colors.successLight
          : state.s === 'error' ? theme.colors.errorLight
          : state.s === 'running' ? theme.colors.goldLight
          : theme.colors.surfaceLight;
        const bc = state.s === 'success' ? theme.colors.success + '33'
          : state.s === 'error' ? theme.colors.error + '33'
          : state.s === 'running' ? theme.colors.gold + '33'
          : theme.colors.border;
        return (
          <Card key={t.k} style={{ padding: 12, marginBottom: 8, backgroundColor: bg, borderColor: bc }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {state.s === 'running'
                ? <ActivityIndicator size="small" color={theme.colors.gold} style={{ width: 8, height: 8 }} />
                : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor(state.s) }} />
              }
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text }}>{t.l}</Text>
                <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>{state.s === 'idle' ? t.h : state.msg}</Text>
              </View>
              {state.ms != null && state.s !== 'running' && (
                <Text style={{ fontSize: 10, color: state.s === 'success' ? theme.colors.success : theme.colors.textTertiary, fontFamily: 'Courier' }}>
                  {state.ms}ms
                </Text>
              )}
              {state.detail && (
                <Text style={{ fontSize: 10, color: theme.colors.primary, fontFamily: 'Courier' }}>…{state.detail}</Text>
              )}
              <TouchableOpacity
                style={[st.btnGhost, { paddingHorizontal: 10, paddingVertical: 5, opacity: state.s === 'running' ? 0.4 : 1 }]}
                onPress={t.fn}
                disabled={state.s === 'running'}
              >
                <Text style={st.btnGhostText}>Run</Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}
      <Card style={{ padding: 12, marginTop: 8 }}>
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, fontFamily: 'Courier', lineHeight: 16 }}>
          tgagarhwqbdcwoqhpapi.supabase.co · ZK6 Engine v2
        </Text>
      </Card>
    </ScrollView>
  );
}

// ─── Engine Config View ───────────────────────────────────────────────────────
function EngineConfigView({ regenerateSlate }: { regenerateSlate?: (scope: any, weightsKey?: any) => Promise<any> }) {
  const DEFAULT_PRESETS: Record<string, Record<string, number>> = {
    balanced:     { BOX: 40, PBURST: 40, CO: 20 },
    conservative: { BOX: 70, PBURST: 20, CO: 10 },
    aggressive:   { BOX: 25, PBURST: 45, CO: 30 },
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenning, setRegenning] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [wPreset, setWPreset]         = useState('balanced');
  const [presets, setPresets]         = useState(DEFAULT_PRESETS);
  const [singlesMax, setSinglesMax]   = useState(4);
  const [doublesMax, setDoublesMax]   = useState(2);
  const [pairRepCap, setPairRepCap]   = useState(2);
  const [confAdjust, setConfAdjust]   = useState(true);
  const [burstSignal, setBurstSignal] = useState(true);
  const [triplesOn, setTriplesOn]     = useState(false);
  const [defaultScope, setDefaultScope] = useState('midday');

  // Task 4 — new engine config state
  const DEFAULT_HORIZON_WEIGHTS: Record<string, number> = { H01Y:35, H02Y:22, H03Y:14, H04Y:9, H05Y:6, H06Y:4.5, H07Y:3, H08Y:2.5, H09Y:2, H10Y:2 };
  const [horizonWeights, setHorizonWeights] = useState<Record<string, number>>(DEFAULT_HORIZON_WEIGHTS);
  const [pressureThreshold, setPressureThreshold] = useState(200);
  const [pressureBonusWeight, setPressureBonusWeight] = useState(10);
  const [minEnergyThreshold, setMinEnergyThreshold] = useState(0);
  const [recentHitCooldown, setRecentHitCooldown] = useState(20);
  const [autoGenSlates, setAutoGenSlates] = useState(false);
  const [morningGenTime, setMorningGenTime] = useState('04:00');
  const [eveningGenTime, setEveningGenTime] = useState('16:00');
  const [previewModal, setPreviewModal] = useState(false);
  const [synergyOn, setSynergyOn] = useState(false);
  const [synergyWeight, setSynergyWeight] = useState(0.15);

  const w = presets[wPreset] ?? DEFAULT_PRESETS.balanced;
  const horizonSum = Object.values(horizonWeights).reduce((a, b) => a + b, 0);

  // ── Load config from app_config table ──
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchFromSupabase<{ key: string; value: string }[]>({
        path: '/rest/v1/app_config?select=key,value',
      });
      if (!Array.isArray(rows)) return;
      const cfg: Record<string, string> = {};
      rows.forEach(r => { cfg[r.key] = r.value; });

      if (cfg.engine_preset) setWPreset(cfg.engine_preset);
      if (cfg.drawing_confidence_on) setConfAdjust(cfg.drawing_confidence_on === 'true');
      if (cfg.burst_signal_on)       setBurstSignal(cfg.burst_signal_on === 'true');
      if (cfg.synergy_boost_on)      setSynergyOn(cfg.synergy_boost_on === 'true');
      if (cfg.synergy_boost_weight)  setSynergyWeight(parseFloat(cfg.synergy_boost_weight) || 0.15);
      if (cfg.k6_triples_on)         setTriplesOn(cfg.k6_triples_on === 'true');
      if (cfg.k6_singles_max)        setSinglesMax(parseInt(cfg.k6_singles_max, 10) || 4);
      if (cfg.k6_doubles_max)        setDoublesMax(parseInt(cfg.k6_doubles_max, 10) || 2);  // 0 is valid
      if (cfg.pair_rep_cap)          setPairRepCap(parseInt(cfg.pair_rep_cap, 10) || 2);
      if (cfg.default_scope)         setDefaultScope(cfg.default_scope);
      if (cfg.pressure_threshold)    setPressureThreshold(parseInt(cfg.pressure_threshold, 10) || 200);
      if (cfg.pressure_bonus_weight) setPressureBonusWeight(parseInt(cfg.pressure_bonus_weight, 10) || 10);
      if (cfg.min_energy_threshold)  setMinEnergyThreshold(parseInt(cfg.min_energy_threshold, 10) || 0);
      if (cfg.recent_hit_cooldown)   setRecentHitCooldown(parseInt(cfg.recent_hit_cooldown, 10) || 0);
      if (cfg.auto_gen_slates)       setAutoGenSlates(cfg.auto_gen_slates === 'true');
      if (cfg.morning_gen_time)      setMorningGenTime(cfg.morning_gen_time);
      if (cfg.evening_gen_time)      setEveningGenTime(cfg.evening_gen_time);
      if (cfg.horizon_weights) {
        try { setHorizonWeights({ ...DEFAULT_HORIZON_WEIGHTS, ...JSON.parse(cfg.horizon_weights) }); } catch {}
      }

      // Load custom preset weights if stored
      const overrides: typeof DEFAULT_PRESETS = { ...DEFAULT_PRESETS };
      (['balanced', 'conservative', 'aggressive'] as const).forEach(p => {
        const raw = cfg[`engine_weights_${p}`];
        if (raw) {
          try { overrides[p] = { ...DEFAULT_PRESETS[p], ...JSON.parse(raw) }; } catch {}
        }
      });
      setPresets(overrides);
    } catch (e) {
      setLoadError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // ── Save all config keys via individual PATCH calls (avoids RLS INSERT restriction) ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      const entries: Record<string, string> = {
        engine_preset:            wPreset,
        drawing_confidence_on:    String(confAdjust),
        burst_signal_on:          String(burstSignal),
        synergy_boost_on:         String(synergyOn),
        synergy_boost_weight:      String(synergyWeight),
        k6_triples_on:            String(triplesOn),
        k6_singles_max:           String(singlesMax),
        k6_doubles_max:           String(doublesMax),
        pair_rep_cap:             String(pairRepCap),
        default_scope:            defaultScope,
        engine_weights_balanced:  JSON.stringify(presets.balanced),
        engine_weights_conservative: JSON.stringify(presets.conservative),
        engine_weights_aggressive: JSON.stringify(presets.aggressive),
        horizon_weights:          JSON.stringify(horizonWeights),
        pressure_threshold:       String(pressureThreshold),
        pressure_bonus_weight:    String(pressureBonusWeight),
        min_energy_threshold:     String(minEnergyThreshold),
        recent_hit_cooldown:      String(recentHitCooldown),
        auto_gen_slates:          String(autoGenSlates),
        morning_gen_time:         morningGenTime,
        evening_gen_time:         eveningGenTime,
      };

      // Use PATCH per key — rows already exist, INSERT would violate RLS
      await Promise.all(
        Object.entries(entries).map(([k, v]) =>
          fetchFromSupabase({
            path: `/rest/v1/app_config?key=eq.${encodeURIComponent(k)}`,
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: { value: v },
          })
        )
      );
      setSavedOk(true);
      setSavedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSavedOk(false), 2500);
    } catch (e) {
      setSaveError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }, [wPreset, confAdjust, burstSignal, synergyOn, synergyWeight, triplesOn, singlesMax, doublesMax, pairRepCap, defaultScope, presets, horizonWeights, pressureThreshold, pressureBonusWeight, minEnergyThreshold, recentHitCooldown, autoGenSlates, morningGenTime, eveningGenTime]);

  const handleSaveAndRegen = useCallback(async () => {
    await handleSave();
    if (!regenerateSlate) return;
    setRegenning(true);
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
    for (const sc of scopes) {
      try { await regenerateSlate(sc); } catch {}
    }
    setRegenning(false);
  }, [handleSave, regenerateSlate]);

  const handleReset = useCallback(() => {
    setWPreset('balanced'); setPresets(DEFAULT_PRESETS);
    setSinglesMax(4); setDoublesMax(2); setPairRepCap(2);
    setConfAdjust(true); setBurstSignal(true); setTriplesOn(false);
    setSynergyOn(false); setSynergyWeight(0.15);
    setDefaultScope('midday');
    setHorizonWeights(DEFAULT_HORIZON_WEIGHTS);
    setPressureThreshold(200); setPressureBonusWeight(10);
    setMinEnergyThreshold(0); setRecentHitCooldown(20);
    setAutoGenSlates(false); setMorningGenTime('04:00'); setEveningGenTime('16:00');
  }, []);

  function ToggleRow({ icon, label, sub, on, onChange }: { icon: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 15 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>{label}</Text>
            {sub && <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }}>{sub}</Text>}
          </View>
        </View>
        <TouchableOpacity onPress={() => onChange(!on)} style={{ width: 42, height: 22, borderRadius: 11, backgroundColor: on ? theme.colors.primary : theme.colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }} />
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Loading engine config…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>⚙️ ZK6 Engine Configuration</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: loadError ? 8 : 16 }}>Proprietary settings — creator access only.</Text>

      {loadError && (
        <Card style={{ padding: 10, marginBottom: 14, backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }}>
          <Text style={{ fontSize: 11, color: theme.colors.gold }}>⚠️ Loaded with defaults — {loadError}</Text>
        </Card>
      )}

      <SectionTitle>SIGNAL WEIGHTS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Object.entries(presets).map(([k, v]) => (
              <TouchableOpacity key={k} style={[st.optBtn, wPreset === k && st.optBtnOn]} onPress={() => setWPreset(k)}>
                <Text style={[st.optBtnText, wPreset === k && st.optBtnTextOn]}>
                  {k.charAt(0).toUpperCase() + k.slice(1)} ({v.BOX}/{v.PBURST}/{v.CO})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ l: 'BOX', c: theme.colors.primary }, { l: 'PBURST', c: theme.colors.rose }, { l: 'CO', c: theme.colors.teal }].map(s => (
            <View key={s.l} style={{ flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: 10, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '800', letterSpacing: 1, marginBottom: 3 }}>{s.l}</Text>
              <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: 'Courier' }}>{(w as any)[s.l]}%</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionTitle>K6 RAIL CONTROLS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <ToggleRow icon="🏆" label="Drawing Confidence Adjustment" sub="Weight signals higher for physical ball machine states" on={confAdjust} onChange={setConfAdjust} />
        <ToggleRow icon="📈" label="Recency Burst Detection" sub="Bonus signal for combos building extra pressure in H01Y" on={burstSignal} onChange={setBurstSignal} />
        <ToggleRow icon="3️⃣" label="Allow Triples in K6" sub="Currently off — triples have very low historical frequency" on={triplesOn} onChange={setTriplesOn} />

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Max Singles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.primary, fontFamily: 'Courier' }}>{singlesMax}</Text>
          </View>
          <View style={{ height: 4, backgroundColor: theme.colors.surfaceLight, borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${(singlesMax / 6) * 100}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            {[1,2,3,4,5,6].map(v => (
              <TouchableOpacity key={v} onPress={() => setSinglesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: singlesMax === v ? theme.colors.primaryLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: singlesMax === v ? theme.colors.primary : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Max Doubles in K6</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.teal, fontFamily: 'Courier' }}>{doublesMax}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[0,1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setDoublesMax(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: doublesMax === v ? theme.colors.tealLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: doublesMax === v ? theme.colors.teal : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pair Repetition Cap</Text>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.gold, fontFamily: 'Courier' }}>{pairRepCap}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {[1,2,3,4].map(v => (
              <TouchableOpacity key={v} onPress={() => setPairRepCap(v)} style={{ width: 30, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: pairRepCap === v ? theme.colors.goldLight : 'transparent' }}>
                <Text style={{ fontSize: 10, color: pairRepCap === v ? theme.colors.gold : theme.colors.textTertiary, fontWeight: '700' }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Signal Synergy Matrix (Tier 4) ── */}
      <SectionTitle>SIGNAL SYNERGY MATRIX</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <ToggleRow 
          icon="⚡" 
          label="Synergy Boost" 
          sub="Reward combos where multiple lethal signals align (Super Signals)" 
          on={synergyOn} 
          onChange={setSynergyOn} 
        />
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Boost Weight</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Bonus score added when 2+ signals are {'>'} 0.70</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: 'Courier' }}>+{synergyWeight.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0.05, 0.10, 0.15, 0.20, 0.25].map(v => (
              <TouchableOpacity key={v} onPress={() => setSynergyWeight(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: synergyWeight === v ? theme.colors.primaryLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: synergyWeight === v ? theme.colors.primary + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: synergyWeight === v ? theme.colors.primary : theme.colors.textTertiary }}>+{v.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      <SectionTitle>DEFAULT SCOPE</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text, marginBottom: 8 }}>Default Scope on App Launch</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['midday','☀️ Midday'], ['evening','🌙 Evening'], ['allday','◈ All Day']] as [string,string][]).map(([id, lbl]) => (
            <TouchableOpacity key={id} style={[st.optBtn, { flex: 1 }, defaultScope === id && st.optBtnOn]} onPress={() => setDefaultScope(id)}>
              <Text style={[st.optBtnText, defaultScope === id && st.optBtnTextOn]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* ── Horizon Weights ── */}
      <SectionTitle>HORIZON WEIGHTS</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Horizon Blend Weights</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Math.abs(horizonSum - 100) < 0.5 ? theme.colors.success : theme.colors.error, fontFamily: 'Courier' }}>
            Sum: {horizonSum.toFixed(1)}%
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 10 }}>Sum must equal 100%. Higher weight = more influence on final score.</Text>
        {HORIZONS.map(h => {
          const val = horizonWeights[h] ?? 0;
          return (
            <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary, width: 40, fontFamily: 'Courier' }}>{h}</Text>
              <View style={{ flex: 1, height: 6, backgroundColor: theme.colors.surfaceLight, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(val, 100)}%`, height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '900', color: theme.colors.primary, fontFamily: 'Courier', width: 36 }}>{val}%</Text>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: Math.max(0, (w[h] ?? 0) - 0.5) }))}
                  style={{ width: 22, height: 22, backgroundColor: theme.colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setHorizonWeights(w => ({ ...w, [h]: (w[h] ?? 0) + 0.5 }))}
                  style={{ width: 22, height: 22, backgroundColor: theme.colors.surfaceLight, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '700' }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Card>

      {/* ── Draws Since Pressure ── */}
      <SectionTitle>DRAWS SINCE PRESSURE</SectionTitle>
      <Card style={{ paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 }}>
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pressure Threshold</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Combos overdue by more than X draws get a pressure bonus</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.rose, fontFamily: 'Courier' }}>{pressureThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[50, 100, 150, 200, 300, 500].map(v => (
              <TouchableOpacity key={v} onPress={() => setPressureThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: pressureThreshold === v ? theme.colors.roseLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: pressureThreshold === v ? theme.colors.rose + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: pressureThreshold === v ? theme.colors.rose : theme.colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Pressure Bonus Weight</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>How much the pressure bonus affects final score</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.rose, fontFamily: 'Courier' }}>{pressureBonusWeight}%</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[5, 10, 15, 20, 25].map(v => (
              <TouchableOpacity key={v} onPress={() => setPressureBonusWeight(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: pressureBonusWeight === v ? theme.colors.roseLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: pressureBonusWeight === v ? theme.colors.rose + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: pressureBonusWeight === v ? theme.colors.rose : theme.colors.textTertiary }}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Diversity Rails (enhanced) ── */}
      <SectionTitle>DIVERSITY RAILS</SectionTitle>
      <Card style={{ paddingHorizontal: 16 }}>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>Min Energy Threshold</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 2 }}>Only include picks with energy score above this threshold</Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.primary, fontFamily: 'Courier' }}>{minEnergyThreshold}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[0, 10, 20, 30, 40, 50].map(v => (
              <TouchableOpacity key={v} onPress={() => setMinEnergyThreshold(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: minEnergyThreshold === v ? theme.colors.primaryLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: minEnergyThreshold === v ? theme.colors.primary + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: minEnergyThreshold === v ? theme.colors.primary : theme.colors.textTertiary }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>🚫 Recent Hit Cooldown</Text>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginTop: 1 }}>Exclude combos that hit within last N draws (0 = off)</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.teal, fontFamily: 'Courier' }}>{recentHitCooldown === 0 ? 'Off' : `${recentHitCooldown}d`}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[0, 5, 10, 15, 20, 25, 30].map(v => (
              <TouchableOpacity key={v} onPress={() => setRecentHitCooldown(v)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: recentHitCooldown === v ? theme.colors.tealLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: recentHitCooldown === v ? theme.colors.teal + '55' : theme.colors.border }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: recentHitCooldown === v ? theme.colors.teal : theme.colors.textTertiary }}>{v === 0 ? 'Off' : v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Card>

      {/* ── Slate Generation Schedule ── */}
      <SectionTitle>SLATE GENERATION SCHEDULE</SectionTitle>
      <Card style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <ToggleRow
          icon="⏰"
          label="Auto-generate Slates"
          sub="Note: requires server-side scheduling (Phase 3)"
          on={autoGenSlates}
          onChange={setAutoGenSlates}
        />
        {autoGenSlates && (
          <>
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>Morning Generation Time (ET)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {['02:00','03:00','04:00','05:00','06:00'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setMorningGenTime(t)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: morningGenTime === t ? theme.colors.goldLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: morningGenTime === t ? theme.colors.gold + '55' : theme.colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: morningGenTime === t ? theme.colors.gold : theme.colors.textTertiary }}>{t} ET</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>Evening Generation Time (ET)</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {['14:00','15:00','16:00','17:00','18:00'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setEveningGenTime(t)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: eveningGenTime === t ? theme.colors.goldLight : theme.colors.surfaceLight, borderWidth: 1, borderColor: eveningGenTime === t ? theme.colors.gold + '55' : theme.colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: eveningGenTime === t ? theme.colors.gold : theme.colors.textTertiary }}>{t} ET</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}
      </Card>

      {saveError && (
        <Card style={{ padding: 10, marginBottom: 10, backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error + '44' }}>
          <Text style={{ fontSize: 11, color: theme.colors.error }}>✗ Save failed — {saveError}</Text>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          style={[st.btnPrimary, { flex: 1, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving || regenning}
        >
          <Text style={st.btnPrimaryText}>
            {saving ? '⏳ Saving…' : savedOk ? '✓ Saved!' : '💾 Save Engine Config'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btnGhost} onPress={handleReset}>
          <Text style={st.btnGhostText}>↺ Reset</Text>
        </TouchableOpacity>
      </View>
      {regenerateSlate && (
        <TouchableOpacity
          style={[st.btnPrimary, { marginTop: 8, backgroundColor: theme.colors.teal, opacity: saving || regenning ? 0.6 : 1 }]}
          onPress={handleSaveAndRegen}
          disabled={saving || regenning}
        >
          {regenning && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
          <Text style={st.btnPrimaryText}>
            {regenning ? '↻ Saving & Regenerating…' : '↻ Save & Regen All Slates'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Preview Engine Output button */}
      <TouchableOpacity
        style={[st.btnGhost, { borderWidth: 1.5, borderColor: theme.colors.primary + '44', backgroundColor: theme.colors.primaryLight, marginTop: 10 }]}
        onPress={() => setPreviewModal(true)}
      >
        <Text style={[st.btnGhostText, { color: theme.colors.primary, fontWeight: '700' }]}>
          🔮 Preview Engine Output
        </Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
        Runs computeSlate with current settings and shows K6 picks
      </Text>
      {savedAt && (
        <Text style={{ fontSize: 10, color: theme.colors.success, textAlign: 'center', marginTop: -14, marginBottom: 16 }}>
          Last saved: {savedAt} — engine will use these weights on next slate generation
        </Text>
      )}

      {/* Preview modal */}
      {previewModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setPreviewModal(false)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#1E1B4B55' }} activeOpacity={1} onPress={() => setPreviewModal(false)}>
            <TouchableOpacity activeOpacity={1} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: theme.colors.border, padding: 20, maxHeight: '70%' }} onPress={() => {}}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceMuted, alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>🔮 Engine Preview</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>
                Current config: {wPreset} preset · {singlesMax} singles max · {doublesMax} doubles max · scope: {defaultScope}
              </Text>
              <Card style={{ padding: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '28', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 }}>Preview Engine Output</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 }}>
                  To preview engine output with current settings, save your config first then use Regen All Slates on the Dashboard. Live engine preview requires the full Supabase dataset to be loaded.
                </Text>
              </Card>
              <TouchableOpacity style={st.btnPrimary} onPress={() => setPreviewModal(false)}>
                <Text style={st.btnPrimaryText}>Close</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </ScrollView>
  );
}

// ─── Hit Tracking View ────────────────────────────────────────────────────────

interface ExpandedRowData {
  picks: any[];
  historyResults: any[];
  trackingRows: any[];
  snapshotId: string | null;
  loaded: boolean;
}

function PerformanceRow({
  row,
  allData,
  avgBox,
  onDeleted,
}: { row: any; allData: any[]; avgBox: number; onDeleted?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedData, setExpandedData] = useState<ExpandedRowData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rate = row.box_hit_rate ?? 0;
  const straightRate = row.straight_hit_rate ?? 0;
  const totalPicks = row.total_picks ?? 0;
  const boxHits = row.box_hits ?? 0;
  const straightHits = row.straight_hits ?? 0;

  const rowBg = rate > 33 ? theme.colors.successLight : rate >= 16 ? theme.colors.goldLight : theme.colors.errorLight;
  const rowBorderC = rate > 33 ? theme.colors.success + '44' : rate >= 16 ? theme.colors.gold + '44' : theme.colors.error + '44';
  const rateColor = rate > 33 ? theme.colors.success : rate >= 16 ? theme.colors.gold : theme.colors.error;

  const scopeLabel = row.scope === 'midday' ? '☀️ Mid' : row.scope === 'evening' ? '🌙 Eve' : '◈ All';
  const scopeColor = row.scope === 'midday' ? theme.colors.gold : row.scope === 'evening' ? theme.colors.primary : theme.colors.teal;

  const formatDate = (d: string) => {
    try {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    } catch { return d; }
  };

  const loadDetail = useCallback(async () => {
    if (expandedData?.loaded) return;
    setLoadingDetail(true);
    try {
      const diUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const diKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const diHdrs = { 'apikey': diKey, 'Authorization': 'Bearer ' + diKey };

      let picks: any[] = [];
      let resolvedSnapshotId: string | null = row.snapshotId ?? null;


      if (resolvedSnapshotId) {
        const res = await fetch(
          diUrl + '/rest/v1/slate_snapshots?id=eq.' + resolvedSnapshotId +
          '&select=id,scope,mode,top_k_straights_json,updated_at_et',
          { headers: diHdrs }
        );
        const snapData = await res.json();
        try {
          const raw = snapData[0]?.top_k_straights_json;
          if (typeof raw === 'string') picks = JSON.parse(raw);
          else if (Array.isArray(raw)) picks = raw;
        } catch (e) {
        }
      } else {
        // Fallback: search by scope + date
        const res = await fetch(
          diUrl + '/rest/v1/slate_snapshots?scope=eq.' + row.scope +
          '&deleted_at=is.null&order=updated_at_et.desc&limit=30' +
          '&select=id,scope,top_k_straights_json,updated_at_et',
          { headers: diHdrs }
        );
        const snaps = await res.json();
        const scopeSnap = Array.isArray(snaps)
          ? (snaps.find((s: any) => (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date) ?? snaps[0])
          : null;
        if (scopeSnap) {
          resolvedSnapshotId = scopeSnap.id ?? null;
          try {
            const raw = scopeSnap.top_k_straights_json;
            if (typeof raw === 'string') picks = JSON.parse(raw);
            else if (Array.isArray(raw)) picks = raw;
          } catch (_e) { /* ignore parse error */ }
        }
      }


      const [histRes, trackRes] = await Promise.all([
        fetchFromSupabase<any[]>({
          path: `/rest/v1/histories?date_et=eq.${row.slate_date}&select=result_digits,comboset_sorted,jurisdiction,session`,
          method: 'GET',
        }),
        fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking?slate_date=eq.${row.slate_date}&scope=eq.${row.scope}&select=*&limit=20`,
          method: 'GET',
        }),
      ]);

      setExpandedData({
        picks: Array.isArray(picks) ? picks : [],
        historyResults: Array.isArray(histRes) ? histRes : [],
        trackingRows: Array.isArray(trackRes) ? trackRes : [],
        snapshotId: resolvedSnapshotId,
        loaded: true,
      });
    } catch (e) {
      console.warn('[PerformanceRow] detail load failed:', e);
      setExpandedData({ picks: [], historyResults: [], trackingRows: [], snapshotId: null, loaded: true });
    } finally {
      setLoadingDetail(false);
    }
  }, [row.snapshotId, row.slate_date, row.scope, expandedData]);

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadDetail();
  }, [expanded, loadDetail]);

  const handleDelete = useCallback(() => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    const softDeleteById = (id: string) => {
      setDeleting(true);
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', url + '/rest/v1/slate_snapshots?id=eq.' + id, true);
      xhr.setRequestHeader('apikey', key);
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=minimal');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          setDeleting(false);
          if (xhr.status >= 200 && xhr.status < 300) {
            Alert.alert('Deleted', 'Slate removed.');
            onDeleted?.();
          } else {
            Alert.alert('Failed', xhr.status + ': ' + xhr.responseText);
          }
        }
      };
      xhr.send(JSON.stringify({ deleted_at: new Date().toISOString() }));
    };

    const doDelete = async () => {
      let snapshotId = expandedData?.snapshotId ?? row.snapshotId ?? null;

      // If no pre-matched ID, look it up now by scope + date
      if (!snapshotId && row.slate_date && row.scope) {
        try {
          const res = await fetch(
            url + '/rest/v1/slate_snapshots' +
            '?scope=eq.' + encodeURIComponent(row.scope) +
            '&deleted_at=is.null' +
            '&select=id,updated_at_et' +
            '&order=updated_at_et.desc&limit=10',
            { headers: { apikey: key, Authorization: 'Bearer ' + key } }
          );
          const snaps = await res.json();
          if (Array.isArray(snaps)) {
            const match = snaps.find((s: any) =>
              (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date
            );
            snapshotId = match?.id ?? null;
          }
        } catch {}
      }

      if (!snapshotId) {
        Alert.alert('Not Found', 'No snapshot found for this date and scope. It may have already been deleted.');
        return;
      }

      Alert.alert(
        'Delete Slate?',
        'Remove this slate record permanently?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => softDeleteById(snapshotId!) },
        ]
      );
    };

    doDelete();
  }, [expandedData, row.snapshotId, row.slate_date, row.scope, onDeleted]);

  // Bar width proportional to rate (max 100%)
  const barWidth = Math.min(rate, 100);

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Collapsed row */}
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 10, paddingVertical: 10,
          backgroundColor: rowBg, borderRadius: expanded ? 12 : 10,
          borderWidth: 1, borderColor: rowBorderC,
          borderBottomLeftRadius: expanded ? 0 : 10,
          borderBottomRightRadius: expanded ? 0 : 10,
        }}
      >
        <View style={{ width: 62 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Courier', color: theme.colors.text, fontWeight: '700' }}>{formatDate(row.slate_date)}</Text>
        </View>
        <View style={{ width: 52 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: scopeColor }}>{scopeLabel}</Text>
          {row.mode && <Text style={{ fontSize: 8, color: theme.colors.textTertiary }}>{row.mode}</Text>}
        </View>
        <View style={{ width: 36 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{boxHits}/{totalPicks || 6}</Text>
        </View>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${barWidth}%`, height: 6, backgroundColor: rateColor, borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 8, color: rateColor, fontWeight: '800', marginTop: 2 }}>{rate > 0 ? rate + '% box' : '—'}</Text>
        </View>
        <View style={{ width: 28, alignItems: 'flex-end' }}>
          {straightHits > 0 && (
            <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.teal }}>🎯{straightHits}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleDelete}
          disabled={deleting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 6, padding: 2 }}
        >
          <Text style={{ fontSize: 13, color: deleting ? theme.colors.textTertiary : theme.colors.error }}>🗑</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: theme.colors.textTertiary, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={{
          backgroundColor: theme.colors.surface, borderWidth: 1, borderTopWidth: 0,
          borderColor: rowBorderC, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          padding: 12,
        }}>
          {loadingDetail ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : expandedData ? (
            <>
              {/* SECTION A — HIT SUMMARY */}
              <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Hit Summary — {formatDate(row.slate_date)} {row.scope}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 8 }}>
                Went {boxHits} for {totalPicks || expandedData.picks.length || 6}
                {straightHits > 0 ? ` (${straightHits} straight)` : ''}
              </Text>

              {expandedData.picks.length > 0 ? (() => {
                const histSet = new Map<string, any>();
                expandedData.historyResults.forEach((r: any) => {
                  const cs = r.comboset_sorted ?? ('{' + (r.result_digits ?? '').split('').sort().join(',') + '}');
                  histSet.set(cs, r);
                });
                const picksToShow = expandedData.picks.slice(0, 6);
                let boxHitCount = 0, straightHitCount = 0;
                const enriched = picksToShow.map((pick: any) => {
                  const cs = pick.comboSet ?? ('{' + (pick.combo ?? '').split('').sort().join(',') + '}');
                  const histMatch = histSet.get(cs);
                  const isStraightHit = pick.hitType === 'straight' || (histMatch && (histMatch.result_digits === pick.bestOrder || histMatch.result_digits === pick.combo));
                  const isBoxHit = !!pick.hitType || !!histMatch;
                  if (isBoxHit) boxHitCount++;
                  if (isStraightHit) straightHitCount++;
                  return { ...pick, isBoxHit, isStraightHit, histMatch };
                });
                const rankMedal = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 8 }}>
                      Went {boxHitCount} for {picksToShow.length} · {boxHitCount} box hit{boxHitCount !== 1 ? 's' : ''} · {straightHitCount} straight hit{straightHitCount !== 1 ? 's' : ''}
                    </Text>
                    <View style={{ gap: 6 }}>
                      {enriched.map((pick: any, pi: number) => {
                        const rank = pick.rank ?? pi + 1;
                        const combo = pick.combo ?? '???';
                        const digits = combo.split('').join(' — ');
                        const cs = pick.comboSet ?? ('{' + combo.split('').sort().join(',') + '}');
                        const bestOrder = pick.bestOrder;
                        const hasDiffOrder = bestOrder && bestOrder !== combo;
                        const energy = pick.energy ?? pick.temperature ?? 0;
                        const energyColor = energy >= 80 ? theme.colors.success : energy >= 50 ? theme.colors.gold : theme.colors.textSecondary;
                        const bBox = Math.round((pick.box ?? 0) * 100);
                        const bPburst = Math.round((pick.pburst ?? 0) * 100);
                        const bCo = Math.round((pick.co ?? 0) * 100);
                        const hitState = pick.hitState ?? pick.histMatch?.jurisdiction;
                        const hitSession = pick.hitSession ?? pick.histMatch?.session;
                        const hitResult = pick.hitResult ?? pick.histMatch?.result_digits;
                        return (
                          <View key={pi} style={{
                            padding: 10, borderRadius: 10, borderWidth: 1,
                            backgroundColor: pick.isStraightHit ? theme.colors.successLight : pick.isBoxHit ? theme.colors.gold + '14' : theme.colors.surfaceLight,
                            borderColor: pick.isStraightHit ? theme.colors.success + '66' : pick.isBoxHit ? theme.colors.gold + '55' : theme.colors.border,
                          }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, marginRight: 6 }}>{rankMedal(rank)}</Text>
                              <Text style={{ fontSize: 18, fontWeight: '900', fontFamily: 'Courier', color: theme.colors.text, flex: 1 }}>{digits}</Text>
                              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: energyColor + '22' }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: energyColor }}>E{energy}</Text>
                              </View>
                            </View>
                            {hasDiffOrder && (
                              <Text style={{ fontSize: 10, color: theme.colors.gold, fontWeight: '700', marginBottom: 3 }}>
                                Best order: {bestOrder?.split('').join(' — ')}
                              </Text>
                            )}
                            <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginBottom: 6 }}>{cs}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                              {([['Freq', bBox, theme.colors.primary], ['Mom', bPburst, theme.colors.teal], ['Pat', bCo, theme.colors.rose]] as const).map(([lbl, val, color]) => (
                                <View key={lbl} style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginBottom: 2 }}>{lbl}</Text>
                                  <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 2 }}>
                                    <View style={{ width: `${Math.min(val, 100)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
                                  </View>
                                  <Text style={{ fontSize: 8, color, marginTop: 1 }}>{val}%</Text>
                                </View>
                              ))}
                            </View>
                            {pick.isStraightHit ? (
                              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.success }}>
                                ⭐ Straight · {hitState}{hitResult ? ` (${hitResult})` : ''}
                              </Text>
                            ) : pick.isBoxHit ? (
                              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.gold }}>
                                🎯 Box · {hitState} {hitSession ?? ''}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 9, color: theme.colors.textTertiary }}>✗ Miss</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })() : (
                <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginBottom: 12 }}>
                  No picks stored for this slate.{'\n'}Regenerate slates to populate pick data.
                </Text>
              )}

              {/* SECTION B — SIGNAL ANALYSIS */}
              {expandedData.trackingRows.length > 0 && (() => {
                const hits = expandedData.trackingRows.filter((t: any) => t.hit_box || t.hit_straight);
                const misses = expandedData.trackingRows.filter((t: any) => !t.hit_box && !t.hit_straight);
                const avgHitEnergy = hits.length ? Math.round(hits.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / hits.length) : 0;
                const avgMissEnergy = misses.length ? Math.round(misses.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / misses.length) : 0;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Signal Analysis</Text>
                    {hits.map((t: any, ti: number) => {
                      const maxSig = Math.max(t.signal_box ?? 0, t.signal_pburst ?? 0, t.signal_co ?? 0, t.signal_dgc ?? 0);
                      const dominant = maxSig === (t.signal_box ?? 0) ? 'FREQUENCY' : maxSig === (t.signal_pburst ?? 0) ? 'MOMENTUM' : maxSig === (t.signal_co ?? 0) ? 'PATTERN' : 'CONSISTENCY';
                      return (
                        <Text key={ti} style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>
                          {t.combo} hit · Freq {Math.round((t.signal_box ?? 0) * 100)}% · Mom {Math.round((t.signal_pburst ?? 0) * 100)}% · Pat {Math.round((t.signal_co ?? 0) * 100)}% · Cons {Math.round((t.signal_dgc ?? 0) * 100)}%
                          {' '}· Dominant: <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{dominant}</Text>
                        </Text>
                      );
                    })}
                    {hits.length > 0 && misses.length > 0 && (
                      <Text style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 }}>
                        Avg hit energy: {avgHitEnergy} · Avg miss energy: {avgMissEnergy}
                        {avgHitEnergy > avgMissEnergy ? ' · Hits scored higher' : ' · Misses scored higher'}
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* SECTION C — STATE BREAKDOWN */}
              {expandedData.historyResults.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>State Breakdown</Text>
                  <View style={{ gap: 2 }}>
                    {expandedData.historyResults.slice(0, 10).map((res: any, ri: number) => {
                      const matchedPick = expandedData.picks.find((p: any) =>
                        p.comboSet === res.comboset_sorted || (p.hitType && p.hitResult === res.result_digits)
                      );
                      const matched = !!matchedPick;
                      return (
                        <View key={ri} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, width: 80, color: theme.colors.textSecondary }}>{res.jurisdiction?.slice(0, 10) ?? '?'}</Text>
                          <Text style={{ fontSize: 10, fontFamily: 'Courier', fontWeight: '700', color: theme.colors.text, width: 30 }}>{res.result_digits}</Text>
                          <Text style={{ fontSize: 10, color: matched ? theme.colors.success : theme.colors.textTertiary, flex: 1 }}>
                            {matched ? `✓ ${matchedPick.hitType} hit · Pick #${matchedPick.rank ?? '?'}` : '✗ Miss'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* SECTION D — CUMULATIVE CONTEXT */}
              {(() => {
                const allBox = allData.map(r => r.box_hit_rate ?? 0);
                const bestRow = allData.reduce((best, r) => (r.box_hit_rate ?? 0) > (best.box_hit_rate ?? 0) ? r : best, allData[0] ?? {});
                const worstRow = allData.reduce((worst, r) => (r.box_hit_rate ?? 0) < (worst.box_hit_rate ?? 0) ? r : worst, allData[0] ?? {});
                const avg30 = allBox.length ? Math.round(allBox.reduce((a, b) => a + b, 0) / allBox.length * 10) / 10 : 0;
                const vsAvg = rate - avg30;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Cumulative Context</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>Best day: {bestRow.slate_date ? formatDate(bestRow.slate_date) : '—'} — {bestRow.box_hits ?? 0}/{bestRow.total_picks ?? 6} hits</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>Worst day: {worstRow.slate_date ? formatDate(worstRow.slate_date) : '—'} — {worstRow.box_hits ?? 0}/{worstRow.total_picks ?? 6} hits</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>30-day avg box rate: {avgBox}%</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: vsAvg >= 0 ? theme.colors.success : theme.colors.error }}>
                      This slate: {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(1)}% vs average
                    </Text>
                  </View>
                );
              })()}

              {/* SECTION E — MODE ANALYSIS */}
              {(() => {
                const modes = ['balanced', 'conservative', 'aggressive'];
                const modeStats = modes.map(m => {
                  const modeRows = allData.filter(r => r.mode === m);
                  const avg = modeRows.length ? Math.round(modeRows.reduce((s: number, r: any) => s + (r.box_hit_rate ?? 0), 0) / modeRows.length * 10) / 10 : null;
                  return { mode: m, avg, count: modeRows.length };
                }).filter(m => m.count > 0);
                if (!modeStats.length) return null;
                const bestMode = modeStats.reduce((best, m) => (m.avg ?? 0) > (best.avg ?? 0) ? m : best, modeStats[0]);
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Mode Analysis</Text>
                    {modeStats.map(m => (
                      <Text key={m.mode} style={{ fontSize: 10, color: m.mode === bestMode.mode ? theme.colors.primary : theme.colors.text, marginBottom: 2 }}>
                        {m.mode}: {m.avg ?? 0}% avg box rate ({m.count} slates){m.mode === bestMode.mode ? ' ← best' : ''}
                      </Text>
                    ))}
                  </View>
                );
              })()}

              {/* SECTION F — QUICK ACTIONS */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.primary + '44', backgroundColor: theme.colors.primaryLight, alignItems: 'center' }}
                  onPress={() => {}}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.primary }}>View Results</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

function HitTrackingView() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const [rows, snaps] = await Promise.all([
        fetchFromSupabase<any[]>({
          path: '/rest/v1/rpc/calculate_hit_rates',
          method: 'POST',
          body: {},
        }),
        fetchFromSupabase<any[]>({
          path: '/rest/v1/slate_snapshots?deleted_at=is.null&select=id,scope,updated_at_et&order=updated_at_et.desc&limit=200',
          method: 'GET',
        }),
      ]);
      const snapList = Array.isArray(snaps) ? snaps : [];
      const hitRows = Array.isArray(rows) ? rows : [];
      // Merge snapshot ID into each performance row so delete + picks fetch have a real ID
      const merged = hitRows.map((row: any) => {
        const match = snapList.find((s: any) =>
          s.scope === row.scope &&
          (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date
        );
        return { ...row, snapshotId: match?.id ?? null };
      });
      setData(merged);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteDuplicates = useCallback(async () => {
    try {
      const snaps = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?deleted_at=is.null&select=id,scope,mode,updated_at_et&order=updated_at_et.desc&limit=500`,
      });
      if (!Array.isArray(snaps) || snaps.length === 0) {
        Alert.alert('No Duplicates', 'No snapshots found.'); return;
      }
      const groups = new Map<string, any[]>();
      for (const snap of snaps) {
        const date = (snap.updated_at_et ?? '').split('T')[0];
        const mode = snap.mode ?? 'balanced';
        const key = `${date}-${snap.scope}-${mode}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(snap);
      }
      const toDelete: string[] = [];
      for (const group of groups.values()) {
        if (group.length > 3) toDelete.push(...group.slice(3).map((s: any) => s.id));
      }
      if (toDelete.length === 0) {
        Alert.alert('No Duplicates', 'No duplicate snapshots found (max 3 per scope/mode/date).'); return;
      }
      Alert.alert(
        'Delete Duplicates',
        `Found ${toDelete.length} duplicate snapshot(s). Keep 3 most recent per scope/mode/date.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: async () => {
            let deleted = 0;
            let failed = 0;
            for (const id of toDelete) {
              try {
                await fetchFromSupabase({
                  path: `/rest/v1/slate_snapshots?id=eq.${id}`,
                  method: 'PATCH',
                  body: { deleted_at: new Date().toISOString() },
                });
                deleted++;
              } catch {
                failed++;
              }
            }
            Alert.alert(
              'Done',
              failed > 0
                ? `Removed ${deleted} snapshot(s). ${failed} failed — check RLS permissions.`
                : `Removed ${deleted} duplicate snapshot(s).`
            );
            load();
          }},
        ]
      );
    } catch (e) {
      Alert.alert('Error', String(e instanceof Error ? e.message : e));
    }
  }, [load]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const allBox = data.map(r => r.box_hit_rate ?? 0);
    const allStr = data.map(r => r.straight_hit_rate ?? 0);
    const avgBox = allBox.length ? Math.round(allBox.reduce((a, b) => a + b, 0) / allBox.length * 10) / 10 : 0;
    const avgStr = allStr.length ? Math.round(allStr.reduce((a, b) => a + b, 0) / allStr.length * 10) / 10 : 0;
    const best = Math.max(...allBox, 0);
    const bestRow = data.find(r => (r.box_hit_rate ?? 0) === best);
    const totalHits = data.reduce((s, r) => s + (r.box_hits ?? 0), 0);
    return { avgBox, avgStr, best, bestDate: bestRow?.slate_date ?? '', total: data.length, totalHits };
  }, [data]);

  const filtered = useMemo(() => {
    let d = data;
    if (scopeFilter !== 'all') d = d.filter(r => r.scope === scopeFilter);
    if (modeFilter !== 'all') d = d.filter(r => r.mode === modeFilter);
    return d.slice(0, 30);
  }, [data, scopeFilter, modeFilter]);

  const avgBox = stats?.avgBox ?? 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>🎯 Slate Performance</Text>
        <TouchableOpacity onPress={load} style={{ padding: 6 }}>
          <Text style={{ fontSize: 16, color: theme.colors.primary }}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10 }}>Slate picks vs actual draw results · tap row to expand</Text>
      <TouchableOpacity
        onPress={handleDeleteDuplicates}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.error + '55', backgroundColor: theme.colors.errorLight, marginBottom: 14 }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.error }}>🗑 Delete Duplicates</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Calculating hit rates…</Text>
        </View>
      ) : fetchError ? (
        <Card style={{ padding: 16, backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error + '44' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.error, marginBottom: 4 }}>⚠️ Failed to load</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{fetchError}</Text>
          <TouchableOpacity style={[st.btnPrimary, { marginTop: 12 }]} onPress={load}>
            <Text style={st.btnPrimaryText}>↺ Retry</Text>
          </TouchableOpacity>
        </Card>
      ) : !data.length ? (
        <Card style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📊</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No performance data yet</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
            Import Results Ledger data and generate slates to begin tracking ZK6 accuracy.
          </Text>
        </Card>
      ) : (
        <>
          {/* 4 Stat Cards */}
          {stats && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { l: 'All-Time Box %', v: stats.avgBox + '%', c: theme.colors.success, i: '✓' },
                { l: 'All-Time Straight %', v: stats.avgStr + '%', c: theme.colors.teal, i: '🎯' },
                { l: 'Best Day', v: `${stats.best}%${stats.bestDate ? '\n' + stats.bestDate.slice(5) : ''}`, c: theme.colors.gold, i: '🏆' },
                { l: 'Total Hits', v: String(stats.totalHits), c: theme.colors.primary, i: '🔢' },
              ].map(s => (
                <Card key={s.l} style={{ flex: 1, minWidth: 72, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, marginBottom: 2 }}>{s.i}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: s.c, fontFamily: 'Courier', textAlign: 'center' }}>{s.v}</Text>
                  <Text style={{ fontSize: 8, color: theme.colors.textTertiary, fontWeight: '700', textAlign: 'center', marginTop: 2 }}>{s.l}</Text>
                </Card>
              ))}
            </View>
          )}

          {/* Scope Filter */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {[['all', 'All Scopes'], ['midday', '☀️ Midday'], ['evening', '🌙 Evening'], ['allday', '◈ All-Day']].map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setScopeFilter(val)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: scopeFilter === val ? theme.colors.primary : theme.colors.surfaceLight,
                  borderWidth: 1, borderColor: scopeFilter === val ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: scopeFilter === val ? '#fff' : theme.colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mode Filter */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {[['all', 'All Modes'], ['balanced', 'Balanced'], ['conservative', 'Conservative'], ['aggressive', 'Aggressive']].map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setModeFilter(val)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: modeFilter === val ? theme.colors.teal : theme.colors.surfaceLight,
                  borderWidth: 1, borderColor: modeFilter === val ? theme.colors.teal : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: modeFilter === val ? '#fff' : theme.colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SectionTitle>RECENT PERFORMANCE (LAST 30 DAYS)</SectionTitle>

          {/* Column labels */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 }}>
            <Text style={{ width: 62, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>DATE</Text>
            <Text style={{ width: 52, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>SCOPE</Text>
            <Text style={{ width: 36, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>HITS</Text>
            <Text style={{ flex: 1, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>BOX RATE</Text>
            <Text style={{ width: 28, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>STR</Text>
            <Text style={{ width: 36, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>DEL</Text>
          </View>

          {filtered.map((row, i) => (
            <PerformanceRow key={`${row.slate_date}-${row.scope}-${i}`} row={row} allData={data} avgBox={avgBox} onDeleted={load} />
          ))}

          {filtered.length === 0 && (
            <Card style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>No data matches current filters</Text>
            </Card>
          )}

          <Card style={{ padding: 10, marginTop: 8 }}>
            <Text style={{ fontSize: 9, color: theme.colors.textTertiary, lineHeight: 15 }}>
              🟢 Green = box rate {'>'} 33% · 🟡 Yellow = 16–33% · 🔴 Red = {'<'} 16%{'\n'}
              Tap any row to expand hit details, signal analysis, and state breakdown
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

// ─── Nationwide Admin View ────────────────────────────────────────────────────
function NationwideAdminView() {
  const [url, setUrl] = useState('https://www.thelotter.com');
  const [note, setNote] = useState('Legal lottery concierge service — buy tickets in 40+ states from home.');
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  const SERVICES = [
    ['TheLotter', 'https://www.thelotter.com', 'Largest multi-state lottery concierge, 40+ US states'],
    ['Jackpot.com', 'https://www.jackpot.com', 'US-focused, easy interface, multiple states'],
    ['LottoMaster', 'https://www.lottomaster.com', 'Specialty Pick 3/4 focus'],
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>🌎 Nationwide Play Admin</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>Configure the secret Pro feature — legal nationwide lottery access</Text>
      <Card style={{ padding: 14, marginBottom: 14, backgroundColor: theme.colors.successLight, borderColor: theme.colors.success + '33' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.success, marginBottom: 6 }}>ℹ️ What This Feature Does</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 19 }}>Pro subscribers gain access to a curated guide showing how to legally play Pick 3 across multiple US states. Third-party lottery concierge services purchase tickets on the player's behalf.</Text>
      </Card>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>Enable for Pro subscribers</Text>
            <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 1 }}>If OFF, the Learn screen hides the nationwide play section</Text>
          </View>
          <TouchableOpacity onPress={() => setEnabled(e => !e)} style={{ width: 42, height: 22, borderRadius: 11, backgroundColor: enabled ? theme.colors.success : theme.colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignSelf: enabled ? 'flex-end' : 'flex-start' }} />
          </TouchableOpacity>
        </View>
      </Card>
      <SectionTitle>SERVICE URL</SectionTitle>
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>Nationwide Play URL</Text>
        <TextInput style={[st.csvInput, { height: 44, fontFamily: 'Courier', fontSize: 12, color: theme.colors.primary, textAlignVertical: 'center' }]} value={url} onChangeText={setUrl} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: 6, marginTop: 10, textTransform: 'uppercase' }}>Description for Pro users</Text>
        <TextInput style={[st.csvInput, { height: 72 }]} value={note} onChangeText={setNote} multiline textAlignVertical="top" />
      </Card>
      <SectionTitle>RECOMMENDED SERVICES</SectionTitle>
      <Card style={{ padding: 0 }}>
        {SERVICES.map(([name, link, desc], i) => (
          <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: i < SERVICES.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>{name}</Text>
              <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{desc}</Text>
            </View>
            <TouchableOpacity style={[st.btnGhost, { borderWidth: 1, borderColor: url === link ? theme.colors.primary : theme.colors.border, backgroundColor: url === link ? theme.colors.primaryLight : 'transparent' }]} onPress={() => setUrl(link)}>
              <Text style={[st.btnGhostText, url === link && { color: theme.colors.primary }]}>{url === link ? '✓ Selected' : 'Use'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <TouchableOpacity style={[st.btnPrimary, { flex: 1 }]} onPress={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}>
          <Text style={st.btnPrimaryText}>{saved ? '✓ Saved!' : '💾 Save Settings'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Adaptive Learning View ───────────────────────────────────────────────────
function AdaptiveLearningView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Pull last 90 days of intelligence data for performance report
      const data = await fetchFromSupabase<any[]>({
        path: '/rest/v1/daily_intelligence?select=slate_date,scope,hit_box,hit_straight,energy_score,hit_state&order=slate_date.desc&limit=2700&mode=neq.zk30',
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute stats
  const totalPicks    = rows.length;
  const boxHits       = rows.filter(r => r.hit_box || r.hit_straight);
  const straightHits  = rows.filter(r => r.hit_straight);
  const totalBoxHits  = boxHits.length;
  const totalStraight = straightHits.length;
  const boxHitRate    = totalPicks > 0 ? ((totalBoxHits / totalPicks) * 100).toFixed(1) : '0.0';
  const avgEnergy     = boxHits.length > 0
    ? Math.round(boxHits.reduce((s, r) => s + (r.energy_score ?? 0), 0) / boxHits.length)
    : 0;
  const statesSet     = new Set(rows.filter(r => r.hit_box || r.hit_straight).map(r => r.hit_state).filter(Boolean));

  // Best day — find date with most hits
  const dateHitMap = new Map<string, number>();
  for (const r of rows) {
    if (r.hit_box || r.hit_straight) {
      dateHitMap.set(r.slate_date, (dateHitMap.get(r.slate_date) ?? 0) + 1);
    }
  }
  const bestDay = [...dateHitMap.values()].reduce((max, v) => Math.max(max, v), 0);

  // 7-day chart — last 7 unique dates with picks
  const allDates = [...new Set(rows.map(r => r.slate_date))].slice(0, 7).reverse();
  const day7Data = allDates.map(date => {
    const dayRows = rows.filter(r => r.slate_date === date);
    const dayHits = dayRows.filter(r => r.hit_box || r.hit_straight).length;
    const rate    = dayRows.length > 0 ? (dayHits / dayRows.length) * 100 : 0;
    const label   = date.slice(5); // MM-DD
    return { date, label, rate, hits: dayHits, total: dayRows.length };
  });

  const maxRate = Math.max(...day7Data.map(d => d.rate), 1);

  const isEmpty = !loading && !error && totalPicks === 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>📊 ZK6 Performance Report</Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>Verified ZK6 accuracy stats — all picks tracked against real draw results</Text>

      {loading && (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 10 }}>Loading performance data…</Text>
        </View>
      )}

      {error && !loading && (
        <Card style={{ padding: 16, marginBottom: 14, borderColor: theme.colors.error + '44', backgroundColor: theme.colors.error + '0A', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: theme.colors.error, fontWeight: '700', marginBottom: 8 }}>Failed to load data</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 12, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={st.btnGhost} onPress={load}>
            <Text style={st.btnGhostText}>Retry</Text>
          </TouchableOpacity>
        </Card>
      )}

      {isEmpty && !loading && (
        <Card style={{ padding: 24, marginBottom: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📭</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' }}>No performance data yet</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>Generate slates and import Results Ledger data to begin tracking ZK6 accuracy.</Text>
        </Card>
      )}

      {!loading && !error && !isEmpty && (
        <>
          {/* Stats grid */}
          <SectionTitle>VERIFIED ACCURACY</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Box Hit Rate', v: boxHitRate + '%', c: theme.colors.success },
              { l: 'Best Day (hits)', v: String(bestDay) + '/6', c: theme.colors.gold },
              { l: 'Total Box Hits', v: String(totalBoxHits), c: theme.colors.primary },
              { l: 'Straight Hits', v: String(totalStraight), c: theme.colors.teal },
              { l: 'States Where ZK6 Hit', v: statesSet.size > 0 ? String(statesSet.size) : '—', c: theme.colors.rose },
              { l: 'Avg Energy on Hits', v: avgEnergy > 0 ? String(avgEnergy) : '—', c: theme.colors.primary },
            ].map(s => (
              <Card key={s.l} style={{ width: '47%', padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: s.c, fontFamily: 'Courier' }}>{s.v}</Text>
                <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', textAlign: 'center', marginTop: 3 }}>{s.l}</Text>
              </Card>
            ))}
          </View>

          {/* 7-day chart */}
          {day7Data.length > 0 && (
            <>
              <SectionTitle>ZK6 ACCURACY — LAST 7 DAYS</SectionTitle>
              <Card style={{ padding: 14, marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 8 }}>
                  {day7Data.map(d => {
                    const barH = Math.max(4, Math.round((d.rate / maxRate) * 70));
                    const isGood = d.rate >= 16;
                    return (
                      <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 80 }}>
                        <Text style={{ fontSize: 9, color: isGood ? theme.colors.success : theme.colors.textTertiary, fontWeight: '700', marginBottom: 3 }}>
                          {d.rate.toFixed(0)}%
                        </Text>
                        <View style={{ width: '80%', height: barH, borderRadius: 3, backgroundColor: isGood ? theme.colors.success : theme.colors.surfaceMuted }} />
                        <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginTop: 4 }}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 4 }}>
                  Green bars = hit rate ≥16% (1+ box hit per 6 picks)
                </Text>
              </Card>
            </>
          )}

          {/* Trust statement */}
          <Card style={{ padding: 14, marginBottom: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 }}>Verified Hit Tracking</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 }}>
              ZK6 Intelligence tracks every pick against real draw results automatically. These stats are verified hits — not estimates or projections. The engine is updated daily as new draw data is imported.
            </Text>
          </Card>
        </>
      )}

      <TouchableOpacity style={[st.btnGhost, { marginTop: 4 }]} onPress={load} disabled={loading}>
        <Text style={st.btnGhostText}>{loading ? 'Loading…' : '↺ Refresh Report'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  optBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1.5, borderColor: theme.colors.border },
  optBtnOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  optBtnText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  optBtnTextOn: { color: theme.colors.primary, fontWeight: '700' },
  btnPrimary: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnGhost: { backgroundColor: theme.colors.surfaceLight, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnGhostText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 12 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'transparent' },
  filterBtnOn: { backgroundColor: theme.colors.primary },
  filterBtnText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  csvInput: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 11, color: theme.colors.text, backgroundColor: theme.colors.surface, height: 160, fontFamily: 'Courier' },
});

// ─── Intelligence Route View ──────────────────────────────────────────────────
function IntelligenceRouteView() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Text style={{ fontSize: 36 }}>🔬</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text, textAlign: 'center' }}>Pattern Intelligence</Text>
      <Text style={{ fontSize: 13, color: theme.colors.textTertiary, textAlign: 'center', lineHeight: 18 }}>
        Deep pick analysis: signal hit rates, rank patterns, draws-since sweet spots, and engine tuning suggestions.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}
        onPress={() => router.push('/(tabs)/intelligence')}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open Intelligence Screen →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [view, setView] = useState('dashboard');
  const [wizardPreset, setWizardPreset] = useState<{ type: 'box_history' | 'pair_history'; jurisdiction: string } | null>(null);
  const { refreshSnapshot } = useSnapshot();
  const { refreshHealth, regenerateSlate, checkSlateLock, imports, isLoading, healthMetrics, importHistory, importLedger, importDailyInput } = useDataIngestion();
  const { coveragePctH01Y, missingH01Y } = useCoverage();
  const { scope } = useScope();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['left', 'right', 'bottom']}>
      {/* Top header */}
      <LinearGradient colors={[theme.colors.cosmic, theme.colors.primary]} style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ fontSize: 22 }}>🔐</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Creator Access</Text>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5 }}>ADMIN ONLY</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' }}>← Exit</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Horizontal nav */}
      <View style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: 'row' }}>
          {NAV.map(n => (
            <TouchableOpacity key={n.id} style={[{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }, view === n.id && { backgroundColor: theme.colors.primaryLight }]} onPress={() => setView(n.id)}>
              <Text style={{ fontSize: 13 }}>{n.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: view === n.id ? '700' : '400', color: view === n.id ? theme.colors.primary : theme.colors.textSecondary }}>{n.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {view === 'dashboard' && <DashboardView setView={setView} imports={imports ?? []} healthMetrics={healthMetrics} regenerateSlate={regenerateSlate} checkSlateLock={checkSlateLock} onOpenZK30Import={(type) => { setWizardPreset({ type, jurisdiction: 'TX' }); setView('wizard'); }} />}
        {view === 'wizard' && <ImportWizardView setView={setView} importHistory={importHistory} importLedger={importLedger} importDailyInput={importDailyInput} regenerateSlate={regenerateSlate} preset={wizardPreset} onClearPreset={() => setWizardPreset(null)} />}
        {view === 'history' && <ImportHistoryView />}
        {view === 'matrix' && <ErrorBoundary fallback="Coverage matrix error"><CoverageMatrixView setView={setView} /></ErrorBoundary>}
        {view === 'health' && <HealthTestsView />}
        {view === 'engine' && <EngineConfigView regenerateSlate={regenerateSlate} />}
        {view === 'performance' && <HitTrackingView />}
        {view === 'nationwide' && <NationwideAdminView />}
        {view === 'adaptive' && <AdaptiveLearningView />}
        {view === 'intelligence' && <IntelligenceRouteView />}
      </View>
    </SafeAreaView>
  );
}
