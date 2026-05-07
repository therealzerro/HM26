import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useScope } from '@/hooks/useScope';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useAuth } from '@/hooks/useAuth';
import { TopKStraightRow } from '@/types/core';
import { PickCard, PickItem } from '@/components/PickCard';
import { PickDetailModal } from '@/components/PickDetailModal';
import { Paywall } from '@/components/Paywall';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { storage } from '@/lib/storage';
import { fetchFromSupabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';

function toComboSet(combo: string) {
  return '{' + combo.split('').sort().join(',') + '}';
}

function getETTime() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  }) + ' ET';
}

const SCOPE_LABELS: Record<string, string> = { midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All Day' };
const MODE_LABELS = ['balanced', 'conservative', 'aggressive'];

export default function SlatesScreen() {
  const { snapshot, refreshSnapshot, hitPicks, activePicks } = useSnapshot();
  const { scope, setScope: setScopeRaw } = useScope();
  const setScope = (s: string) => { setScopeRaw(s as any); };
  const { regenerateSlate, checkSlateLock } = useDataIngestion();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [wKey, setWKey] = useState<'balanced' | 'conservative' | 'aggressive'>('balanced');
  const [search, setSearch] = useState('');
  const [fMult, setFMult] = useState<'all' | 'singles' | 'doubles'>('all');
  const [sort, setSort] = useState<'rank' | 'energy' | 'freq'>('rank');
  const [detail, setDetail] = useState<PickItem | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [heatCheckCombo, setHeatCheckCombo] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMsg, setRegenMsg] = useState('');
  const [isRegenLoading, setIsRegenLoading] = useState(false);
  const [softUpgradeOpen, setSoftUpgradeOpen] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [savingSlate, setSavingSlate] = useState(false);
  const [slateSavedMsg, setSlateSavedMsg] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'compact'>('list');

  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; isLocked: boolean }>({ visible: false, isLocked: false });

  const isFree = user?.role === 'free';
  const isAdmin = user?.role === 'admin';
  const isPro = user?.role === 'premium';
  const isPlus = isAdmin;
  const PRO_DAILY_CREDITS = 3;
  const creditsRemaining = Math.max(0, PRO_DAILY_CREDITS - creditsUsed);

  const [showYesterday, setShowYesterday] = useState(false);

  const todayStr = useMemo(() => getTodayET(), []);
  const yesterdayStr = useMemo(() => getYesterdayET(), []);

  const { data: yesterdaySnap, isLoading: ysLoading } = useQuery({
    queryKey: ['yesterday_snap', scope, yesterdayStr],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?scope=eq.${scope}&deleted_at=is.null` +
              `&updated_at_et=gte.${yesterdayStr}T00:00:00&updated_at_et=lt.${todayStr}T00:00:00` +
              `&order=updated_at_et.desc&limit=1&select=id,scope,top_k_straights_json`,
      });
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    },
    enabled: showYesterday,
    staleTime: 10 * 60 * 1000,
  });

  const { data: yesterdayResults } = useQuery({
    queryKey: ['yesterday_results', yesterdayStr],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?date_et=eq.${yesterdayStr}&select=result_digits,comboset_sorted,jurisdiction,session&limit=500&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    enabled: showYesterday,
    staleTime: 10 * 60 * 1000,
  });

  const yesterdayHasFullResults = useMemo(() =>
    Array.isArray(yesterdayResults) && new Set(yesterdayResults.map(r => r.jurisdiction)).size >= 20
  , [yesterdayResults]);

  const yesterdayItems = useMemo((): PickItem[] => {
    if (!yesterdaySnap || !Array.isArray(yesterdaySnap.top_k_straights_json)) return [];
    const resultSets = new Set((yesterdayResults ?? []).map((r: any) =>
      r.comboset_sorted ?? ('{' + (r.result_digits ?? '').split('').sort().join(',') + '}')
    ));
    const resultDigits = new Set((yesterdayResults ?? []).map((r: any) => r.result_digits));
    return yesterdaySnap.top_k_straights_json.slice(0, 6).map((row: any, idx: number) => {
      const combo = typeof row === 'string' ? row : (row?.combo ?? '---');
      const cs = typeof row === 'string' ? toComboSet(row) : (row?.comboSet ?? toComboSet(combo));
      const hitBox = resultSets.has(cs);
      const hitStraight = resultDigits.has(row?.bestOrder) || resultDigits.has(combo);
      const hitResult = hitBox ? (yesterdayResults ?? []).find((r: any) =>
        (r.comboset_sorted ?? toComboSet(r.result_digits)) === cs
      ) : null;
      return {
        rank: idx + 1,
        combo,
        comboSet: cs,
        bestOrder: row?.bestOrder,
        energy: row?.energy ?? row?.temperature ?? 0,
        signals: { BOX: row?.box ?? 0, PBURST: row?.pburst ?? 0, CO: row?.co ?? 0, DGC: row?.signals?.DGC ?? 0 },
        multiplicity: row?.multiplicity,
        topPair: row?.topPair,
        drawsSince: row?.drawsSince,
        timesDrawn: row?.timesDrawn,
        lastSeen: row?.lastSeen,
        locked: false,
        hitBox,
        hitStraight,
        hitResult,
      } as any;
    });
  }, [yesterdaySnap, yesterdayResults]);

  // Load today's credit usage for PRO users
  useEffect(() => {
    if (!isPro) return;
    (async () => {
      const today = getTodayET();
      const tokenKey = 'session_token_' + (user?.id ?? 'anon');
      const token = await storage.getItem(tokenKey) ?? 'anon_' + Date.now();
      await storage.setItem(tokenKey, token);
      try {
        const rows = await fetchFromSupabase<{ credits_used: number }[]>({
          path: `/rest/v1/slate_credits?session_token=eq.${encodeURIComponent(token)}&date_et=eq.${today}&select=credits_used`,
        });
        if (Array.isArray(rows) && rows.length > 0) {
          setCreditsUsed(rows[0].credits_used ?? 0);
        }
      } catch { /* ignore */ }
    })();
  }, [isPro, user?.id]);

  // Track slates view count — show gentle upgrade after 3 views for free users
  useEffect(() => {
    if (!isFree) return;
    (async () => {
      const countStr = await storage.getItem('slates_view_count');
      const count = parseInt(countStr || '0', 10) + 1;
      await storage.setItem('slates_view_count', String(count));
      if (count === 3) setSoftUpgradeOpen(true);
    })();
  }, []);

  const handleRequestRegen = async () => {
    if (isPro && creditsRemaining <= 0) {
      setRegenMsg('No credits remaining today. Resets at midnight ET. Upgrade to Mystic for unlimited.');
      setRegenOpen(true);
      return;
    }
    const isLocked = await checkSlateLock(scope as any);
    setRegenConfirm({ visible: true, isLocked });
  };

  const handleGenerate = useCallback(async (force?: boolean) => {
    setRegenConfirm({ visible: false, isLocked: false });
    
    try {
      setIsRegenLoading(true);
      const res = await regenerateSlate(scope as any, wKey, force);
      setRegenMsg(res.message);
      setRegenOpen(true);
      if (res.status === 'success') {
        queryClient.removeQueries({ queryKey: ['snapshot'] });
        await refreshSnapshot();
      }

      // Deduct credit for PRO users
      if (isPro) {
        const today = getTodayET();
        const tokenKey = 'session_token_' + (user?.id ?? 'anon');
        const token = await storage.getItem(tokenKey) ?? 'anon_' + Date.now();
        const newUsed = creditsUsed + 1;
        setCreditsUsed(newUsed);
        await fetchFromSupabase({
          path: '/rest/v1/slate_credits?on_conflict=session_token,date_et',
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: { session_token: token, date_et: today, credits_used: newUsed, tier: 'pro' },
        }).catch(() => {/* non-fatal */});
      }
    } catch {
      setRegenMsg('Failed to trigger regeneration');
      setRegenOpen(true);
    } finally {
      setIsRegenLoading(false);
    }
  }, [regenerateSlate, scope, wKey, refreshSnapshot, queryClient, isPro, creditsUsed, user?.id]);

  const rawItems = useMemo((): PickItem[] => {
    // Use activePicks (non-hit picks) from useSnapshot
    const list = activePicks.length > 0
      ? activePicks
      : (Array.isArray(snapshot?.top_k_straights_json)
        ? (snapshot!.top_k_straights_json as any[]).filter((p: any) => !p?.hitType)
        : []);
    const components = snapshot?.components_json ?? [];
    if (!Array.isArray(list) || list.length === 0) {
      return Array.from({ length: 6 }).map((_, i) => ({
        rank: i + 1, combo: '---', comboSet: '{-,-,-}', energy: 0,
        signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 }, locked: isFree && i >= 2,
      }));
    }
    return list.slice(0, 6).map((row, idx) => {
      const r = row as any;
      const combo = r.combo ?? '---';
      const energy = typeof r.energy === 'number' ? r.energy
        : typeof r.temperature === 'number' ? r.temperature
        : typeof r.indicator === 'number' ? Math.round(r.indicator * 100) : 0;
      const signals = {
        BOX:    Number(r.signals?.BOX    ?? r.box    ?? r.components?.BOX    ?? 0),
        PBURST: Number(r.signals?.PBURST ?? r.pburst ?? r.components?.PBURST ?? 0),
        CO:     Number(r.signals?.CO     ?? r.co     ?? r.components?.CO     ?? 0),
        DGC:    Number(r.signals?.DGC    ?? r.components?.DGC                ?? 0),
      };
      return {
        rank: idx + 1, combo, comboSet: r.comboSet ?? toComboSet(combo),
        bestOrder: r.bestOrder ?? combo, energy, signals,
        multiplicity: r.multiplicity as string | undefined,
        topPair: r.topPair, drawsSince: r.drawsSince, timesDrawn: r.timesDrawn, lastSeen: r.lastSeen,
        locked: isFree && idx >= 2,
        generatedAt: snapshot?.updated_at_et,
        snapshotScope: scope,
        hitType: r.hitType ?? null,
        hitState: r.hitState ?? null,
        hitSession: r.hitSession ?? null,
        hitResult: r.hitResult ?? null,
      };
    });
  }, [activePicks, snapshot, isFree, scope]);

  const slateHitItems = useMemo((): PickItem[] => {
    return hitPicks.map((row: any, idx) => ({
      rank: row.rank ?? (idx + 1),
      combo: row.combo ?? '---',
      comboSet: row.comboSet ?? toComboSet(row.combo ?? ''),
      energy: typeof row.energy === 'number' ? row.energy
        : typeof row.temperature === 'number' ? row.temperature : 0,
      signals: {
        BOX:    Number(row.signals?.BOX    ?? row.box    ?? row.components?.BOX    ?? 0),
        PBURST: Number(row.signals?.PBURST ?? row.pburst ?? row.components?.PBURST ?? 0),
        CO:     Number(row.signals?.CO     ?? row.co     ?? row.components?.CO     ?? 0),
        DGC:    Number(row.signals?.DGC    ?? row.components?.DGC                  ?? 0),
      },
      locked: false,
      hitType: row.hitType as 'straight' | 'box',
      hitState: row.hitState,
      hitSession: row.hitSession,
      hitResult: row.hitResult,
    }));
  }, [hitPicks]);

  const filtered = useMemo(() => {
    let p = [...rawItems];
    if (search) p = p.filter(x => x.combo.includes(search) || x.comboSet.includes(search));
    if (fMult !== 'all') p = p.filter(x => x.multiplicity === fMult);
    if (sort === 'energy') p.sort((a, b) => b.energy - a.energy);
    else if (sort === 'freq') p.sort((a, b) => b.signals.BOX - a.signals.BOX);
    else p.sort((a, b) => a.rank - b.rank);
    return p;
  }, [rawItems, search, fMult, sort]);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      {/* Status bar */}
      <LinearGradient colors={[theme.colors.cosmic, theme.colors.primary]} style={s.statusBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={s.liveDot} />
          <Text style={s.statusLive}>✦ Oracle Live</Text>
        </View>
        <Text style={s.statusTime}>{getETTime()}</Text>
        {snapshot?.hash && (
          <Text style={s.statusHash}>…{snapshot.hash.slice(-6)}</Text>
        )}
      </LinearGradient>

      {/* Header */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>⚡ K6 <Text style={{ color: theme.colors.primary }}>Slates</Text></Text>
          <Text style={s.subtitle}>
            {isFree
              ? '📅 Official slate · Updated twice daily by ZK6 Admin'
              : isPro
              ? `⚡ Live slate · ${creditsRemaining} credit${creditsRemaining !== 1 ? 's' : ''} remaining`
              : '✦ Live slate · Unlimited regenerations'}
          </Text>
        </View>
        {isFree ? null : (
          <TouchableOpacity
            style={[s.generateBtn, isPro && creditsRemaining === 0 && { backgroundColor: theme.colors.surfaceMuted }]}
            onPress={handleRequestRegen}
            disabled={isRegenLoading || (isPro && creditsRemaining <= 0)}
          >
            <RefreshCw size={14} color={isPro && creditsRemaining === 0 ? theme.colors.textTertiary : '#fff'} />
            <Text style={[s.generateBtnText, isPro && creditsRemaining === 0 && { color: theme.colors.textTertiary }]}>
              {isRegenLoading ? 'Generating…' : isPro ? `Generate (${creditsRemaining})` : 'Generate'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <RegenConfirmationModal
        visible={regenConfirm.visible}
        isLocked={regenConfirm.isLocked}
        scope={scope}
        onClose={() => setRegenConfirm({ visible: false, isLocked: false })}
        onConfirm={handleGenerate}
      />

      {/* Scope + Mode */}
      <View style={s.scopeRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={s.scopeGroup}>
              {(['midday', 'evening', 'allday'] as const).map(sc => (
                <TouchableOpacity
                  key={sc} style={[s.scopeBtn, scope === sc && !showYesterday && s.scopeBtnOn]}
                  onPress={() => { setScope(sc); setShowYesterday(false); }}
                >
                  <Text style={[s.scopeBtnText, scope === sc && !showYesterday && s.scopeBtnTextOn]}>{SCOPE_LABELS[sc]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[s.scopeBtn, showYesterday && s.scopeBtnYest]}
                onPress={() => setShowYesterday(v => !v)}
              >
                <Text style={[s.scopeBtnText, showYesterday && { color: theme.colors.gold, fontWeight: '700' }]}>📅 Yesterday</Text>
              </TouchableOpacity>
            </View>
            {MODE_LABELS.map(k => (
              <TouchableOpacity
                key={k}
                style={[s.modeBtn, wKey === k && s.modeBtnOn]}
                onPress={() => setWKey(k as any)}
              >
                <Text style={[s.modeBtnText, wKey === k && s.modeBtnTextOn]}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Heat Check button */}
      <TouchableOpacity
        onPress={() => { setHeatCheckCombo(''); setHeatCheckOpen(true); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginVertical: 6, paddingVertical: 8, backgroundColor: theme.colors.surfaceLight, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border }}
      >
        <Text style={{ fontSize: 14 }}>🔍</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>Heat Check Any Combo</Text>
      </TouchableOpacity>

      {/* PRO upgrade banner */}
      {isFree && (
        <TouchableOpacity style={s.proBanner} onPress={() => setPaywallOpen(true)} activeOpacity={0.85}>
          <Text style={{ fontSize: 18 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.proBannerTitle}>See all 6 K6 Slate picks</Text>
            <Text style={s.proBannerSub}>Join <Text style={{ color: theme.colors.gold, fontWeight: '700' }}>2,400+ players</Text> on Pro slates.</Text>
          </View>
          <View style={s.proBannerBtn}>
            <Text style={s.proBannerBtnText}>Unlock ♛</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Search + Filters */}
      <View style={s.filterBar}>
        <View style={s.searchBox}>
          <Text style={{ color: theme.colors.textTertiary, fontSize: 12 }}>🔍</Text>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search number…"
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['all', 'singles', 'doubles'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[s.filterChip, fMult === m && s.filterChipOn]}
              onPress={() => setFMult(m)}
            >
              <Text style={[s.filterChipText, fMult === m && s.filterChipTextOn]}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '800', letterSpacing: 1 }}>SORT</Text>
          {([['rank', 'Rank'], ['energy', 'Energy'], ['freq', 'Freq']] as const).map(([id, lbl]) => (
            <TouchableOpacity
              key={id}
              style={[s.sortChip, sort === id && s.sortChipOn]}
              onPress={() => setSort(id)}
            >
              <Text style={[s.filterChipText, sort === id && { color: '#fff' }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Save Slate button row */}
      {!isFree && (
        <View style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 8 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.goldLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: theme.colors.gold + '44', opacity: savingSlate ? 0.6 : 1 }}
            onPress={async () => {
              if (savingSlate || rawItems.every(p => p.combo === '---')) return;
              setSavingSlate(true);
              try {
                const today = new Date();
                const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const SCOPE_LABELS: Record<string, string> = { midday: 'Mid Day', evening: 'Evening', allday: 'All Day' };
                const listName = `K6 Slate · ${SCOPE_LABELS[scope] ?? scope} · ${dateLabel}`;
                const energyLabels = ['ON FIRE','BLAZING','HOT','WARM','COOL'];
                const getEnergyLabel = (e: number) => e >= 90 ? 'ON FIRE' : e >= 80 ? 'BLAZING' : e >= 65 ? 'HOT' : e >= 45 ? 'WARM' : 'COOL';
                const savedEntry = {
                  id: 'slate_' + Date.now(),
                  name: listName,
                  scope,
                  type: 'saved_slate',
                  savedAt: today.toISOString(),
                  combos: rawItems.filter(p => p.combo !== '---').map(p => ({
                    combo: p.combo,
                    note: `Energy ${p.energy} · ${getEnergyLabel(p.energy)}`,
                    starred: false,
                    energy: p.energy,
                  })),
                };
                const existing = await storage.getItem('saved_slates');
                const slates = existing ? JSON.parse(existing) : [];
                slates.unshift(savedEntry);
                await storage.setItem('saved_slates', JSON.stringify(slates));
                setSlateSavedMsg('Slate saved to Number Book!');
                setTimeout(() => setSlateSavedMsg(''), 3000);
              } catch { /* ignore */ }
              setSavingSlate(false);
            }}
            disabled={savingSlate}
          >
            <Text style={{ fontSize: 16 }}>📖</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.gold }}>
              {savingSlate ? 'Saving…' : slateSavedMsg || 'Save This Slate to Number Book'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* View toggle */}
      {!showYesterday && (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          {([['list', '≡ List'], ['compact', '⊞ Compact']] as const).map(([mode, label]) => (
            <TouchableOpacity
              key={mode}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: viewMode === mode ? theme.colors.primary : theme.colors.surfaceLight, borderWidth: 1, borderColor: viewMode === mode ? theme.colors.primary : theme.colors.border }}
              onPress={() => setViewMode(mode)}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: viewMode === mode ? '#fff' : theme.colors.textSecondary }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Pick list */}
      <ScrollView style={s.content} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Yesterday Panel */}
        {showYesterday && (
          <View>
            {ysLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={{ marginTop: 8, fontSize: 12, color: theme.colors.textSecondary }}>Loading yesterday's slate…</Text>
              </View>
            ) : !yesterdaySnap ? (
              <View style={{ padding: 20, backgroundColor: theme.colors.surfaceLight, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📅</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No yesterday's slate found</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center' }}>Yesterday's slate snapshot is not available for this scope.</Text>
              </View>
            ) : !yesterdayHasFullResults ? (
              <View style={{ padding: 20, backgroundColor: theme.colors.goldLight, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.gold + '44', marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.gold, marginBottom: 4 }}>⏳ Yesterday's performance pending</Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 17 }}>Import full results ledger to see hit tracking ({(yesterdayResults?.length ?? 0)} jurisdictions imported, need 20+)</Text>
              </View>
            ) : (
              <>
                {/* Summary banner */}
                {(() => {
                  const hits = yesterdayItems.filter((p: any) => p.hitBox || p.hitStraight);
                  const boxes = yesterdayItems.filter((p: any) => p.hitBox && !p.hitStraight);
                  const straights = yesterdayItems.filter((p: any) => p.hitStraight);
                  return (
                    <View style={{ backgroundColor: hits.length > 0 ? theme.colors.successLight : theme.colors.surfaceLight, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: hits.length > 0 ? theme.colors.success + '44' : theme.colors.border }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: hits.length > 0 ? theme.colors.success : theme.colors.text }}>
                        {hits.length > 0 ? `🎯 ZK6 went ${hits.length} for 6 yesterday` : '❌ ZK6 went 0 for 6 yesterday'}
                      </Text>
                      {hits.length > 0 && (
                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 }}>
                          {boxes.length > 0 && `${boxes.length} box`}{boxes.length > 0 && straights.length > 0 ? ', ' : ''}{straights.length > 0 && `${straights.length} straight`}
                        </Text>
                      )}
                    </View>
                  );
                })()}
                {yesterdayItems.map((pick: any, i: number) => (
                  <View key={i} style={{ marginBottom: 10, opacity: pick.hitBox || pick.hitStraight ? 1 : 0.6 }}>
                    {(pick.hitBox || pick.hitStraight) && (
                      <View style={{ backgroundColor: theme.colors.gold + '22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4, borderWidth: 1, borderColor: theme.colors.gold + '44' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.gold }}>
                          {pick.hitStraight ? '⭐ STRAIGHT HIT' : '🎯 BOX HIT'} — {pick.hitResult?.result_digits} in {pick.hitResult?.jurisdiction}
                        </Text>
                      </View>
                    )}
                    <PickCard
                      pick={pick}
                      onTap={() => setDetail(pick)}
                    />
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Today's Hits ── */}
        {!showYesterday && slateHitItems.length > 0 && (
          <View style={{ backgroundColor: '#FFD70018', borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD70044', padding: 12, marginBottom: 12, gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#B8860B', letterSpacing: 0.5, marginBottom: 4 }}>🎯 TODAY'S HITS — Removed from Active Slate</Text>
            {slateHitItems.map((pick, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: pick.hitType === 'straight' ? '#FFD70022' : '#00808022', borderColor: pick.hitType === 'straight' ? '#FFD70066' : '#00808066' }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', color: pick.hitType === 'straight' ? '#B8860B' : '#008080' }}>
                    {pick.hitType === 'straight' ? '⭐ STRAIGHT' : '🎯 BOX'}
                  </Text>
                </View>
                <Text style={{ fontSize: 20, fontWeight: '900', fontFamily: 'Courier', letterSpacing: 4, flex: 1 }}>{pick.combo}</Text>
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '600' }}>
                  {pick.hitState}{pick.hitSession ? ` · ${pick.hitSession === 'midday' ? '☀️' : '🌙'}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {!showYesterday && viewMode === 'list' && filtered.map((pick, i) => (
          <PickCard
            key={`${pick.rank}-${pick.combo}-${i}`}
            pick={pick}
            onTap={pick.locked ? undefined : () => setDetail(pick)}
            onUnlock={() => setPaywallOpen(true)}
          />
        ))}

        {!showYesterday && viewMode === 'compact' && (
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', marginBottom: 12, ...theme.shadows.soft }}>
            {filtered.map((pick, i) => {
              const heatColor = pick.energy >= 80 ? theme.colors.error : pick.energy >= 65 ? theme.colors.orange : pick.energy >= 45 ? theme.colors.gold : theme.colors.textTertiary;
              const heatEmoji = pick.energy >= 90 ? '🔥' : pick.energy >= 80 ? '⚡' : pick.energy >= 65 ? '✦' : pick.energy >= 45 ? '◈' : '❄';
              const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
              const medal = MEDAL[pick.rank] ?? `#${pick.rank}`;
              const bestStr = (pick.bestOrder ?? pick.combo).split('').join('-');
              return (
                <View key={`compact-${pick.rank}-${pick.combo}`} style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: theme.colors.border }}>
                  <Text style={{ fontSize: pick.rank <= 3 ? 18 : 13, width: 28, textAlign: 'center', fontWeight: '900', color: theme.colors.textTertiary }}>{medal}</Text>
                  <Text style={{ fontSize: 20, fontWeight: '900', fontFamily: 'Courier', letterSpacing: 3, color: pick.locked ? theme.colors.textTertiary : theme.colors.text, flex: 1 }}>
                    {pick.locked ? '•••' : pick.combo}
                  </Text>
                  {!pick.locked && (
                    <Text style={{ fontSize: 11, color: theme.colors.gold, fontFamily: 'Courier', fontWeight: '700' }}>→ {bestStr}</Text>
                  )}
                  <View style={{ backgroundColor: heatColor + '20', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: heatColor + '40', alignItems: 'center', minWidth: 46 }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: heatColor, fontFamily: 'Courier', lineHeight: 14 }}>{pick.energy}</Text>
                    <Text style={{ fontSize: 9, lineHeight: 11 }}>{heatEmoji}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => pick.locked ? setPaywallOpen(true) : setDetail(pick)}
                  >
                    <Text style={{ fontSize: 16, color: pick.locked ? theme.colors.textTertiary : theme.colors.primary }}>
                      {pick.locked ? '🔒' : '▶'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {isFree && (
          <LinearGradient
            colors={[theme.colors.primaryLight, theme.colors.cosmicLight]}
            style={s.upsellCard}
          >
            <Text style={s.upsellTitle}>♛ Unlock your full K6 Slate</Text>
            <Text style={s.upsellDesc}>Pro unlocks all 6 picks, optimal straights, pattern analysis — across 76 daily draws.</Text>
            <TouchableOpacity style={s.upsellBtn} onPress={() => setPaywallOpen(true)}>
              <Text style={s.upsellBtnText}>♛ Begin Pro Trial · $4.99</Text>
            </TouchableOpacity>
          </LinearGradient>
        )}
      </ScrollView>

      {/* Regen modal */}
      <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Regenerate Slate</Text>
            <Text style={s.modalBody}>{regenMsg}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={() => setRegenOpen(false)}>
              <Text style={s.modalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {detail && (
        <PickDetailModal
          pick={detail}
          scope={scope}
          isPro={!isFree}
          onClose={() => setDetail(null)}
          onHeatCheck={(combo) => { setDetail(null); setHeatCheckCombo(combo); setHeatCheckOpen(true); }}
        />
      )}

      {/* Soft upgrade prompt after 3 views for free users */}
      <Modal transparent visible={softUpgradeOpen} animationType="fade" onRequestClose={() => setSoftUpgradeOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { alignItems: 'center', paddingVertical: 28 }]}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>🏆</Text>
            <Text style={[s.modalTitle, { textAlign: 'center' }]}>Ready to see all 6 picks?</Text>
            <Text style={[s.modalBody, { textAlign: 'center' }]}>
              You've viewed the K6 Slate 3 times. Oracle+ members see all 6 picks, optimal straights, and deep signal analytics.
            </Text>
            <TouchableOpacity
              style={[s.modalBtn, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, marginBottom: 8, width: '100%' }]}
              onPress={() => { setSoftUpgradeOpen(false); setPaywallOpen(true); }}
            >
              <Text style={[s.modalBtnText, { color: '#fff', fontWeight: '700' }]}>Upgrade to Oracle+ ♛</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.modalBtn, { width: '100%' }]} onPress={() => setSoftUpgradeOpen(false)}>
              <Text style={s.modalBtnText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <HeatCheckModal
        visible={heatCheckOpen}
        onClose={() => setHeatCheckOpen(false)}
        initialCombo={heatCheckCombo}
        scope={scope}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success, shadowColor: theme.colors.success, shadowOpacity: 0.8, shadowRadius: 4, elevation: 2 },
  statusLive: { fontSize: 11, fontWeight: '700', color: theme.colors.success },
  statusTime: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'Courier', fontWeight: '700' },
  statusHash: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'Courier', marginLeft: 'auto' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 2 },
  subtitle: { fontSize: 11, color: theme.colors.textTertiary },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.lg },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  scopeRow: { backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 8 },
  scopeGroup: { flexDirection: 'row', backgroundColor: theme.colors.surfaceLight, borderRadius: 11, padding: 3, gap: 2, marginRight: 8 },
  scopeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  scopeBtnOn: { backgroundColor: theme.colors.surface, ...theme.shadows.soft },
  scopeBtnYest: { backgroundColor: theme.colors.goldLight, borderWidth: 1, borderColor: theme.colors.gold + '44' },
  scopeBtnText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '500' },
  scopeBtnTextOn: { color: theme.colors.primary, fontWeight: '700' },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1.5, borderColor: theme.colors.border },
  modeBtnOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  modeBtnText: { fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary },
  modeBtnTextOn: { color: theme.colors.primary },
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.cosmicLight, borderBottomWidth: 1, borderBottomColor: theme.colors.primary + '33', paddingHorizontal: 16, paddingVertical: 10 },
  proBannerTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.text, marginBottom: 2 },
  proBannerSub: { fontSize: 11, color: theme.colors.textSecondary },
  proBannerBtn: { backgroundColor: theme.colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.borderRadius.md },
  proBannerBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  filterBar: { backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.surfaceLight, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: theme.colors.border },
  searchInput: { flex: 1, fontSize: 12, color: theme.colors.text },
  filterChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.colors.surfaceLight },
  filterChipOn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  filterChipText: { fontSize: 11, fontWeight: '500', color: theme.colors.textSecondary },
  filterChipTextOn: { color: theme.colors.text, fontWeight: '700' },
  sortChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.colors.surfaceLight },
  sortChipOn: { backgroundColor: theme.colors.primary },
  content: { flex: 1 },
  upsellCard: { borderRadius: theme.borderRadius.xl, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.primary + '33', marginBottom: 16 },
  upsellTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  upsellDesc: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  upsellBtn: { backgroundColor: theme.colors.cosmic, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 11 },
  upsellBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  modalBtn: { backgroundColor: theme.colors.surfaceLight, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, borderRadius: theme.borderRadius.md, alignItems: 'center' },
  modalBtnText: { color: theme.colors.text, fontWeight: '600' },
});
