/* ============================================================================
   v6 PATCH — Slates screen, Option B (3-tab densification)
   ============================================================================
   FILE:        app/(tabs)/explore.tsx
   STRATEGY:    Keep all the current features, but split them into 3 tabs so
                only ONE thing is on screen at a time:

                  ┌──────────────────────────────────────┐
                  │ Status strip                         │
                  │ Header: K6 Slates       [Generate]   │
                  │ ┌──────────┬─────────┬───────────┐   │
                  │ │  SLATE   │  LIVE   │   MORE    │   │
                  │ └──────────┴─────────┴───────────┘   │
                  │                                       │
                  │   ACTIVE TAB CONTENT                  │
                  │                                       │
                  └──────────────────────────────────────┘

                SLATE tab : scope pills · filter/sort · pick list/grid
                LIVE  tab : draw ticker · today's hits · heat check
                MORE  tab : yesterday · saved · mode · credits · pro banner

   REPLACES:    Full file replacement. All hooks/state/handlers from the
                existing screen are preserved — only the JSX layout changes
                to route content into the right tab.
   ============================================================================ */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RefreshCw, Settings, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useScope } from '@/hooks/useScope';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useAuth } from '@/hooks/useAuth';
import { PickCard, PickItem } from '@/components/PickCard';
import { LockedPicksSummary } from '@/components/LockedPicksSummary';
import { PickDetailModal } from '@/components/PickDetailModal';
import { Paywall } from '@/components/Paywall';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { HeatCheckFAB } from '@/components/HeatCheckFAB';
import { DrawTicker } from '@/components/DrawTicker';
import { storage } from '@/lib/storage';
import { fetchFromSupabase } from '@/lib/supabase';
import { scopeAccent } from '@/lib/scopeAccent';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';
import { InfoTooltip } from '@/components/InfoTooltip';
import { useToast } from '@/components/Toast';
import { NeonRefreshControl } from '@/components/NeonRefreshControl';
import { runHitDetectionAllScopes } from '@/lib/hitDetection';

function toComboSet(combo: string) { return '{' + combo.split('').sort().join(',') + '}'; }
function tempColorForEnergy(e: number): string {
  if (e >= 80) return theme.colors.hot;    // #ff3b30
  if (e >= 60) return theme.colors.warm;   // #ffcc00
  if (e >= 40) return theme.colors.mild;   // #34c759
  return theme.colors.cold;                 // #666666
}

function tempLabel(e: number): string {
  if (e >= 80) return 'HOT';
  if (e >= 60) return 'WARM';
  if (e >= 40) return 'MILD';
  return 'COLD';
}
function getETTime() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET';
}

const SCOPE_LABELS: Record<string, string> = { midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All Day' };
const MODE_LABELS = ['balanced', 'conservative', 'aggressive'];

type Tab = 'picks' | 'hits' | 'more';

// ─── Grid tile (v8 — temp badge + signal labels/values + glow) ────────────
function GridTile({ pick, onPress }: { pick: PickItem; onPress: () => void }) {
  const tc       = tempColorForEnergy(pick.energy);
  const tLabel   = tempLabel(pick.energy);
  const isLocked = pick.locked;
  const digits   = isLocked ? '•••' : (pick.bestOrder ?? pick.combo);

  const channels = [
    { k: 'B', v: pick.signals.BOX,      c: theme.colors.cyan   },
    { k: 'P', v: pick.signals.PBURST,   c: theme.colors.rose   },
    { k: 'C', v: pick.signals.CO,       c: theme.colors.purple },
    { k: 'D', v: pick.signals.DGC ?? 0, c: theme.colors.gold   },
  ];

  return (
    <TouchableOpacity
      style={[gt.card, { borderColor: tc + '66', shadowColor: tc }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Top: rank chip + temp badge */}
      <View style={gt.topRow}>
        <View style={[gt.rankChip, { borderColor: tc + '66', backgroundColor: tc + '14' }]}>
          <Text style={[gt.rankNum, { color: tc }]}>#{pick.rank}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[gt.tempBadge, { borderColor: tc, shadowColor: tc }]}>
          <Text style={[gt.tempLabel, { color: tc }]}>{tLabel}</Text>
          <Text style={[gt.tempNum,   { color: tc }]}>{pick.energy}°</Text>
        </View>
      </View>

      {/* Combo digits — sized to fit */}
      <Text
        style={[gt.digits, { color: tc, textShadowColor: tc + 'aa' }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {digits.split('').join(' ')}
      </Text>

      {/* comboSet · multiplicity */}
      <View style={gt.metaRow}>
        <Text style={gt.comboSet} numberOfLines={1}>
          {isLocked ? '{•,•,•}' : pick.comboSet}
        </Text>
        {pick.multiplicity && !isLocked && (
          <Text style={[gt.mult, { color: tc }]}>
            {pick.multiplicity === 'doubles' ? 'DBL' : 'SGL'}
          </Text>
        )}
      </View>

      {/* Signal grid — 4 mini-bars w/ label + value */}
      {!isLocked && (
        <View style={gt.signalGrid}>
          {channels.map(ch => {
            const pct = Math.max(0, Math.min(1, ch.v));
            return (
              <View key={ch.k} style={gt.signalCell}>
                <View style={gt.signalHead}>
                  <Text style={[gt.signalKey, { color: ch.c }]}>{ch.k}</Text>
                  <Text style={[gt.signalVal, { color: ch.c }]}>{Math.round(pct * 100)}</Text>
                </View>
                <View style={gt.barTrack}>
                  <View style={[gt.barFill, { width: (pct * 100) + '%' as any, backgroundColor: ch.c, shadowColor: ch.c }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {isLocked && (
        <View style={gt.lockedRow}>
          <Text style={gt.lockedText}>🔒 Pro</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
const gt = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
    gap: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, borderWidth: 1 },
  rankNum: { fontSize: 11, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3 },
  tempBadge: {
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(20,12,38,0.55)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6,
  },
  tempLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold },
  tempNum:   { fontSize: 10, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },

  digits: {
    fontSize: 32, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 2, lineHeight: 34,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comboSet: { flex: 1, fontSize: 10, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  mult: { fontSize: 8, fontWeight: '900', letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold },

  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  signalCell: { width: '48%', gap: 2 },
  signalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  signalKey: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, fontFamily: theme.typography.fontFamily.monoBold },
  signalVal: { fontSize: 10, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  barTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  barFill: {
    height: 3, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },

  lockedRow: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  lockedText: { fontSize: 10, color: theme.colors.textTertiary, fontWeight: '700' },
});

export default function SlatesScreen() {
  const { snapshot, refreshSnapshot, hitPicks, activePicks } = useSnapshot();
  const { scope, setScope } = useScope();
  const { regenerateSlate, checkSlateLock } = useDataIngestion();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // tabs
  const [tab, setTab] = useState<Tab>('picks');
  const [controlsSheetOpen, setControlsSheetOpen] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // existing state preserved
  const [wKey, setWKey] = useState<'balanced' | 'conservative' | 'aggressive'>('balanced');
  const [fMult, setFMult] = useState<'all' | 'singles' | 'doubles'>('all');
  const [sort, setSort] = useState<'rank' | 'energy' | 'freq'>('rank');
  const [detail, setDetail] = useState<PickItem | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [heatCheckCombo, setHeatCheckCombo] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMsg, setRegenMsg] = useState('');
  const [isRegenLoading, setIsRegenLoading] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [creditsError, setCreditsError] = useState(false);
  const [savingSlate, setSavingSlate] = useState(false);
  const [slateSavedMsg, setSlateSavedMsg] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'compact'>('list');
  const [showYesterday, setShowYesterday] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; isLocked: boolean }>({ visible: false, isLocked: false });

  const isFree = user?.role === 'free';
  const isAdmin = user?.role === 'admin';
  const isPro = user?.role === 'premium';
  const PRO_DAILY_CREDITS = 3;
  const creditsRemaining = Math.max(0, PRO_DAILY_CREDITS - creditsUsed);

  const todayStr = useMemo(() => getTodayET(), []);
  const yesterdayStr = useMemo(() => getYesterdayET(), []);

  // yesterday data (only fetched when on More tab + showYesterday)
  const { data: yesterdaySnap, isLoading: ysLoading } = useQuery({
    queryKey: ['yesterday_snap', scope, yesterdayStr],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?scope=eq.${scope}&updated_at_et=gte.${yesterdayStr}T00:00:00&updated_at_et=lt.${todayStr}T00:00:00&order=updated_at_et.desc&limit=1&select=id,scope,top_k_straights_json`,
      });
      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    },
    enabled: tab === 'more' && showYesterday,
    staleTime: 10 * 60 * 1000,
  });

  // PRO credits
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
        if (Array.isArray(rows) && rows.length > 0) setCreditsUsed(rows[0].credits_used ?? 0);
      } catch { setCreditsError(true); }
    })();
  }, [isPro, user?.id]);

  const handleRequestRegen = async () => {
    if (isPro && creditsRemaining <= 0) {
      setRegenMsg('No credits remaining today. Resets at midnight ET.');
      setRegenOpen(true); return;
    }
    const isLocked = await checkSlateLock(scope as any);
    setRegenConfirm({ visible: true, isLocked });
  };

  const handleGenerate = useCallback(async (force?: boolean) => {
    setRegenConfirm({ visible: false, isLocked: false });
    try {
      setIsRegenLoading(true);
      const res = await regenerateSlate(scope as any, wKey, force);
      setRegenMsg(res.message); setRegenOpen(true);
      if (res.status === 'success') {
        showToast('✓ Slate regenerated', 'success');
        queryClient.removeQueries({ queryKey: ['snapshot'] });
        await refreshSnapshot();
      }
    } catch { showToast('Failed to regenerate', 'error'); }
    finally { setIsRegenLoading(false); }
  }, [regenerateSlate, scope, wKey, refreshSnapshot, queryClient, showToast]);

  const handlePullRefresh = useCallback(async () => {
    setIsPullRefreshing(true);
    try {
      const today = getTodayET();
      const yesterday = getYesterdayET();
      await Promise.all([
        runHitDetectionAllScopes(today).catch(() => null),
        runHitDetectionAllScopes(yesterday).catch(() => null),
      ]);
      await refreshSnapshot();
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    } catch { /* ignore */ }
    setIsPullRefreshing(false);
  }, [refreshSnapshot, queryClient]);

  const rawItems = useMemo((): PickItem[] => {
    // If active (non-hit) picks exist, show those. Otherwise fall back to the full
    // snapshot including hit picks — so the slate never shows empty placeholder rows
    // just because all picks already hit (e.g. yesterday's slate after hit detection ran).
    const list = activePicks.length > 0 ? activePicks
      : (Array.isArray(snapshot?.top_k_straights_json) ? (snapshot!.top_k_straights_json as any[]) : []);
    if (!Array.isArray(list) || list.length === 0) {
      return Array.from({ length: 6 }).map((_, i) => ({
        rank: i + 1, combo: '---', comboSet: '{-,-,-}', energy: 0,
        signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 }, locked: isFree && i < 4,
      }));
    }
    return list.slice(0, 6).map((row, idx) => {
      const r = row as any;
      const combo = r.combo ?? '---';
      const energy = typeof r.energy === 'number' ? r.energy : typeof r.temperature === 'number' ? r.temperature : 0;
      return {
        rank: idx + 1, combo, comboSet: r.comboSet ?? toComboSet(combo), bestOrder: r.bestOrder ?? combo, energy,
        signals: {
          BOX: Number(r.signals?.BOX ?? r.box ?? r.components?.BOX ?? 0),
          PBURST: Number(r.signals?.PBURST ?? r.pburst ?? r.components?.PBURST ?? 0),
          CO: Number(r.signals?.CO ?? r.co ?? r.components?.CO ?? 0),
          DGC: Number(r.signals?.DGC ?? r.components?.DGC ?? 0),
        },
        multiplicity: r.multiplicity, topPair: r.topPair, drawsSince: r.drawsSince,
        timesDrawn: r.timesDrawn, lastSeen: r.lastSeen, locked: isFree && idx < 4,
        generatedAt: snapshot?.updated_at_et, snapshotScope: scope,
      };
    });
  }, [activePicks, snapshot, isFree, scope]);

  const slateHitItems = useMemo((): PickItem[] => hitPicks.map((row: any, idx) => ({
    rank: row.rank ?? (idx + 1), combo: row.combo ?? '---',
    comboSet: row.comboSet ?? toComboSet(row.combo ?? ''),
    energy: typeof row.energy === 'number' ? row.energy : 0,
    signals: {
      BOX: Number(row.signals?.BOX ?? row.box ?? 0), PBURST: Number(row.signals?.PBURST ?? row.pburst ?? 0),
      CO: Number(row.signals?.CO ?? row.co ?? 0), DGC: Number(row.signals?.DGC ?? 0),
    },
    locked: false,
    hitType: row.hitType as 'straight' | 'box', hitState: row.hitState, hitSession: row.hitSession, hitResult: row.hitResult,
  })), [hitPicks]);

  const filtered = useMemo(() => {
    let p = [...rawItems];
    if (fMult !== 'all') p = p.filter(x => x.multiplicity === fMult);
    if (sort === 'energy') p.sort((a, b) => b.energy - a.energy);
    else if (sort === 'freq') p.sort((a, b) => b.signals.BOX - a.signals.BOX);
    else p.sort((a, b) => a.rank - b.rank);
    return p;
  }, [rawItems, fMult, sort]);

  const handleSaveSlate = useCallback(async () => {
    if (savingSlate || rawItems.every(p => p.combo === '---')) return;
    setSavingSlate(true);
    try {
      const todayEt = getTodayET();
      const entry = {
        id: 'slate_' + Date.now(),
        name: `ZK6 Picks · ${SCOPE_LABELS[scope]} · ${todayEt}`,
        scope, type: 'saved_slate', savedAt: new Date().toISOString(),
        combos: rawItems.filter(p => p.combo !== '---').map(p => ({ combo: p.combo, energy: p.energy })),
      };
      const existing = await storage.getItem('saved_slates');
      const slates = existing ? JSON.parse(existing) : [];
      slates.unshift(entry);
      await storage.setItem('saved_slates', JSON.stringify(slates));
      setSlateSavedMsg('Saved!');
      setTimeout(() => setSlateSavedMsg(''), 2500);
    } catch { /* ignore */ }
    setSavingSlate(false);
  }, [savingSlate, rawItems, scope]);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      {/* ── Status strip ── */}
      <View style={s.statusStrip}>
        <View style={s.liveDot} />
        <Text style={s.stripText}>{getETTime()} ET</Text>
        {snapshot?.updated_at_et && (
          <Text style={s.stripFreshness}>
            · {(() => {
              const mins = Math.floor((Date.now() - new Date(snapshot.updated_at_et).getTime()) / 60000);
              return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
            })()}
          </Text>
        )}
        {snapshot?.hash && <Text style={s.stripHash}>#{snapshot.hash.slice(-6)}</Text>}
      </View>

      {/* ── Header — title + generate + controls (⚙️) ── */}
      <View style={s.header}>
        <Text style={s.title}>ZK6 <Text style={{ color: theme.colors.cyan }}>Picks</Text></Text>
        <View style={{ flex: 1 }} />
        {!isFree && (
          <TouchableOpacity
            style={[s.generateBtn, isPro && creditsRemaining === 0 && { opacity: 0.4 }]}
            onPress={handleRequestRegen} disabled={isRegenLoading || (isPro && creditsRemaining <= 0)}
          >
            <RefreshCw size={12} color="#fff" />
            <Text style={s.generateBtnText}>{isRegenLoading ? '…' : 'Generate'}</Text>
          </TouchableOpacity>
        )}
        {tab === 'picks' && (
          <TouchableOpacity style={s.iconBtn} onPress={() => setControlsSheetOpen(true)} accessibilityLabel="Slate display controls">
            <Settings size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Big segmented scope control (screenshot-friendly) ── */}
      {tab === 'picks' && (
        <View style={s.scopeBigRow}>
          {(['midday', 'evening', 'allday'] as const).map(sc => {
            const active = scope === sc;
            const accent = scopeAccent(sc);
            return (
              <TouchableOpacity
                key={sc}
                style={[
                  s.scopeBigBtn,
                  active && { backgroundColor: accent + '14', borderColor: accent + '88' },
                ]}
                onPress={() => setScope(sc as any)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.scopeBigText, active && { color: accent, fontWeight: '900' }]}>{SCOPE_LABELS[sc]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Generation timestamp + view toggle (in screenshot frame) ── */}
      {tab === 'picks' && (
        <View style={s.scopeMetaRow}>
          {snapshot?.updated_at_et ? (
            <Text style={s.scopeTimestampInline}>
              Generated {new Date(snapshot.updated_at_et).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} ET
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <View style={s.viewToggle}>
            {([['list', 'List'], ['compact', 'Grid']] as const).map(([vm, lbl]) => (
              <TouchableOpacity
                key={vm}
                style={[s.viewToggleBtn, viewMode === vm && s.viewToggleBtnOn]}
                onPress={() => setViewMode(vm as any)}
                accessibilityRole="tab"
                accessibilityState={{ selected: viewMode === vm }}
              >
                <Text style={[s.viewToggleText, viewMode === vm && s.viewToggleTextOn]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── TAB BAR ── */}
      <View style={s.tabBar}>
        {(['picks', 'hits', 'more'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnOn]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextOn]}>
              {t === 'picks' ? 'Picks' : t === 'hits' ? 'Hits' : 'More'}
            </Text>
            {t === 'hits' && slateHitItems.length > 0 && <View style={s.tabDot} />}
          </TouchableOpacity>
        ))}
      </View>

      <RegenConfirmationModal
        visible={regenConfirm.visible} isLocked={regenConfirm.isLocked} scope={scope}
        onClose={() => setRegenConfirm({ visible: false, isLocked: false })} onConfirm={handleGenerate}
      />

      {/* ──────────────── TAB: SLATE ──────────────── */}
      {tab === 'picks' && (
        <>
          {viewMode === 'compact' ? (
            <View style={s.gridContainer}>
              <View style={s.gridArea}>
                {[0, 1, 2].map(row => (
                  <View key={row} style={s.gridRow}>
                    {filtered.slice(row * 2, row * 2 + 2).map(pick => (
                      <GridTile key={`grid-${pick.rank}`} pick={pick} onPress={() => pick.locked ? setPaywallOpen(true) : setDetail(pick)} />
                    ))}
                    {filtered.slice(row * 2, row * 2 + 2).length < 2 && <View style={{ flex: 1 }} />}
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <ScrollView
              style={s.content}
              contentContainerStyle={s.listContent}
              refreshControl={<NeonRefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={theme.colors.primary} />}
            >
              {(() => {
                const locked = filtered.filter(p => p.locked);
                const unlocked = filtered.filter(p => !p.locked);
                const handleAdTap = (_rank: number) => {
                  showToast('👁 Watch-to-unlock launches soon — upgrade for instant access', 'info');
                  setPaywallOpen(true);
                };
                return (
                  <>
                    {locked.length > 0 && (
                      <LockedPicksSummary lockedPicks={locked} onUnlock={() => setPaywallOpen(true)} onWatchAd={handleAdTap} />
                    )}
                    {unlocked.map((pick, i) => (
                      <PickCard
                        key={`${pick.rank}-${pick.combo}-${i}`} pick={pick}
                        onTap={() => setDetail(pick)}
                        onUnlock={() => setPaywallOpen(true)}
                      />
                    ))}
                  </>
                );
              })()}
            </ScrollView>
          )}
        </>
      )}

      {/* ──────────────── TAB: LIVE ──────────────── */}
      {tab === 'hits' && (
        <ScrollView style={s.content} contentContainerStyle={s.listContent}>
          <Text style={s.sectionTitle}>Live draw ticker</Text>
          <DrawTicker scope={scope} />

          <Text style={[s.sectionTitle, { marginTop: 16 }]}>Today's hits</Text>
          {slateHitItems.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyEmoji}>⏳</Text>
              <Text style={s.emptyTitle}>No hits yet today</Text>
              <Text style={s.emptyDesc}>Check back after the next draw.</Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {slateHitItems.map((pick, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: theme.colors.gold + '18', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.gold + '44' }}>
                  <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, backgroundColor: pick.hitType === 'straight' ? theme.colors.gold + '22' : theme.colors.cyan + '22', borderColor: pick.hitType === 'straight' ? theme.colors.gold + '66' : theme.colors.cyan + '66' }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: pick.hitType === 'straight' ? theme.colors.gold : theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {pick.hitType === 'straight' ? 'STRAIGHT' : 'BOX'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 4, color: theme.colors.text, flex: 1 }}>{pick.combo}</Text>
                  <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>
                    {pick.hitState}{pick.hitSession ? ` · ${pick.hitSession === 'midday' ? '☀️' : '🌙'}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[s.sectionTitle, { marginTop: 16 }]}>Heat check</Text>
          <TouchableOpacity style={s.bigAction} onPress={() => { setHeatCheckCombo(''); setHeatCheckOpen(true); }}>
            <Text style={{ fontSize: 20 }}>🔍</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bigActionTitle}>Heat Check any combo</Text>
              <Text style={s.bigActionSub}>See the energy and hit history for any 3-digit combo</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ──────────────── TAB: MORE ──────────────── */}
      {tab === 'more' && (
        <ScrollView style={s.content} contentContainerStyle={s.listContent}>

          {/* ── Group: Engine settings ── */}
          <Text style={s.moreGroupTitle}>ENGINE</Text>
          <Text style={s.sectionTitle}>Mode</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {MODE_LABELS.map(k => (
              <TouchableOpacity key={k} style={[s.modeBtn, wKey === k && s.modeBtnOn]} onPress={() => setWKey(k as any)}>
                <Text style={[s.modeBtnText, wKey === k && s.modeBtnTextOn]}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Group: Slate actions ── */}
          <Text style={[s.moreGroupTitle, { marginTop: 22 }]}>THIS SLATE</Text>
          <TouchableOpacity style={s.bigAction} onPress={handleSaveSlate} disabled={savingSlate || isFree}>
            <Text style={{ fontSize: 20 }}>📖</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bigActionTitle}>{slateSavedMsg ? '✓ Saved' : savingSlate ? 'Saving…' : isFree ? 'Save (Pro only)' : 'Save current slate'}</Text>
              <Text style={s.bigActionSub}>Bookmark today's picks for later review</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bigAction, { marginTop: 8 }]} onPress={() => setShowYesterday(v => !v)}>
            <Text style={{ fontSize: 20 }}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bigActionTitle}>{showYesterday ? 'Hide yesterday' : 'Show yesterday'}</Text>
              <Text style={s.bigActionSub}>Review yesterday's K6 picks vs actual draws</Text>
            </View>
          </TouchableOpacity>
          {showYesterday && (
            ysLoading ? <ActivityIndicator color={theme.colors.cyan} style={{ marginTop: 12 }} />
            : !yesterdaySnap ? <Text style={s.emptyDesc}>No yesterday's slate found.</Text>
            : <Text style={[s.emptyDesc, { marginTop: 8 }]}>Yesterday's slate loaded — switch to Slate tab to view.</Text>
          )}

          {/* ── Group: Account ── */}
          <Text style={[s.moreGroupTitle, { marginTop: 22 }]}>ACCOUNT</Text>
          {isPro && (
            <View style={s.statRow}>
              <Text style={s.statLabel}>Daily regenerations</Text>
              <Text style={[s.statValue, creditsRemaining === 0 && { color: theme.colors.error }]}>
                {creditsError ? 'Credits unavailable' : `${creditsRemaining}/${PRO_DAILY_CREDITS}`}
              </Text>
              <InfoTooltip term="Daily Regenerations" definition={`Oracle+ gets ${PRO_DAILY_CREDITS} regens/day. Resets at midnight ET.`} size={13} />
            </View>
          )}
          {isFree && (
            <View style={s.upsellCard}>
              <Text style={s.upsellTitle}>♛ Unlock your full K6 Slate</Text>
              <Text style={s.upsellDesc}>Pro unlocks all 6 picks, optimal straights, pattern analysis.</Text>
              <TouchableOpacity style={s.upsellBtn} onPress={() => setPaywallOpen(true)}>
                <Text style={s.upsellBtnText}>♛ Begin Pro Trial · $4.99</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Footer ── */}
          <Text style={s.disclaimer}>HitMaster picks are for entertainment only. Play responsibly. 1-800-GAMBLER</Text>
        </ScrollView>
      )}

      {/* ── modals ── */}
      <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Regenerate Slate</Text>
            <Text style={s.modalBody}>{regenMsg}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={() => setRegenOpen(false)}><Text style={s.modalBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Slate display controls — filter / sort / view mode */}
      <Modal transparent visible={controlsSheetOpen} animationType="slide" onRequestClose={() => setControlsSheetOpen(false)}>
        <TouchableOpacity activeOpacity={1} style={s.sheetBackdrop} onPress={() => setControlsSheetOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={e => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Slate display</Text>
              <TouchableOpacity onPress={() => setControlsSheetOpen(false)}>
                <X size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={s.sheetGroupLabel}>Show</Text>
            <View style={s.sheetGroupRow}>
              {(['all', 'singles', 'doubles'] as const).map(m => (
                <TouchableOpacity key={m} style={[s.sheetChip, fMult === m && s.sheetChipOnCyan]} onPress={() => setFMult(m)}>
                  <Text style={[s.sheetChipText, fMult === m && s.sheetChipTextOnCyan]}>
                    {m === 'all' ? 'All' : m === 'singles' ? 'Singles' : 'Doubles'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sheetGroupLabel}>Sort by</Text>
            <View style={s.sheetGroupRow}>
              {([['rank', 'Rank'], ['energy', 'Energy'], ['freq', 'Frequency']] as const).map(([id, lbl]) => (
                <TouchableOpacity key={id} style={[s.sheetChip, sort === id && s.sheetChipOnPurple]} onPress={() => setSort(id)}>
                  <Text style={[s.sheetChipText, sort === id && s.sheetChipTextOnPurple]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {detail && (
        <PickDetailModal pick={detail} scope={scope} isPro={!isFree}
          onClose={() => setDetail(null)}
          onHeatCheck={(combo) => { setDetail(null); setHeatCheckCombo(combo); setHeatCheckOpen(true); }} />
      )}
      <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <HeatCheckModal visible={heatCheckOpen} onClose={() => setHeatCheckOpen(false)} initialCombo={heatCheckCombo} scope={scope} />
      {/* FAB hidden on compact (grid) view so screenshots stay clean. */}
      {tab === 'picks' && viewMode !== 'compact' && (
        <HeatCheckFAB onPress={() => { setHeatCheckCombo(''); setHeatCheckOpen(true); }} />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  statusStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 5, backgroundColor: theme.colors.bgElevated, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.cyan },
  stripText: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  stripFreshness: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, opacity: 0.7 },
  stripHash: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: theme.typography.fontFamily.mono, marginLeft: 'auto' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.colors.bgElevated, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.bold },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.purple, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  // tabs
  tabBar: { flexDirection: 'row', backgroundColor: theme.colors.background, paddingHorizontal: 14, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabBtnOn: { backgroundColor: theme.colors.purple + '22', borderColor: theme.colors.purple + '88' },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1 },
  tabTextOn: { color: theme.colors.purple },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.gold },

  // Big scope segmented control (screenshot-friendly)
  scopeBigRow: { flexDirection: 'row', backgroundColor: theme.colors.bgElevated, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 6 },
  scopeBigBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border },
  scopeBigText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.6 },
  scopeMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 6, backgroundColor: theme.colors.bgElevated, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  scopeTimestampInline: { flex: 1, fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.4 },
  viewToggle: { flexDirection: 'row', backgroundColor: theme.colors.background, borderRadius: 8, padding: 2, gap: 1, borderWidth: 1, borderColor: theme.colors.border },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  viewToggleBtnOn: { backgroundColor: theme.colors.purple + '20', borderWidth: 1, borderColor: theme.colors.purple + '66' },
  viewToggleText: { fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  viewToggleTextOn: { color: theme.colors.purple, fontWeight: '900' },

  // Header icon button (settings ⚙️)
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border, marginLeft: 6 },

  // Slate display controls sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, borderTopWidth: 1.5, borderColor: theme.colors.purple + '44', gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  sheetGroupLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 8, marginBottom: 6 },
  sheetGroupRow: { flexDirection: 'row', gap: 6 },
  sheetChip: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  sheetChipOnCyan: { backgroundColor: theme.colors.cyan + '14', borderColor: theme.colors.cyan + '88' },
  sheetChipOnPurple: { backgroundColor: theme.colors.purple + '20', borderColor: theme.colors.purple + '88' },
  sheetChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  sheetChipTextOnCyan: { color: theme.colors.cyan, fontWeight: '900' },
  sheetChipTextOnPurple: { color: theme.colors.purple, fontWeight: '900' },

  // More tab section grouping
  moreGroupTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 10 },

  content: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 32, gap: 8 },

  gridContainer: { flex: 1, backgroundColor: theme.colors.background },
  gridArea: { flex: 1, padding: 8, gap: 6 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 6 },

  sectionTitle: { fontSize: 10, fontWeight: '900', color: theme.colors.textTertiary, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 8 },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: theme.colors.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  statLabel: { fontSize: 13, color: theme.colors.text, flex: 1 },
  statValue: { fontSize: 14, fontWeight: '900', color: theme.colors.purple, fontFamily: theme.typography.fontFamily.monoBold },

  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.bgElevated },
  modeBtnOn: { borderColor: theme.colors.purple + '88', backgroundColor: theme.colors.purple + '18' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary },
  modeBtnTextOn: { color: theme.colors.purple },

  bigAction: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: theme.colors.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
  bigActionTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  bigActionSub: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },

  emptyCard: { padding: 22, alignItems: 'center', backgroundColor: theme.colors.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  emptyDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },

  upsellCard: { borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.purple + '66', backgroundColor: theme.colors.purple + '12' },
  upsellTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  upsellDesc: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  upsellBtn: { backgroundColor: theme.colors.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 11 },
  upsellBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  disclaimer: { fontSize: 11, color: theme.colors.textTertiary, lineHeight: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: theme.colors.bgElevated, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  modalBtn: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.borderMed, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { color: theme.colors.text, fontWeight: '600' },
});
