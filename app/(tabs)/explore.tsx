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
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { RefreshCw, Settings, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
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
import { CosmicBackground } from '@/components/CosmicBackground';
import { LastHitPill } from '@/components/LastHitPill';
import { useFollowedStates } from '@/hooks/useFollowedStates';
import { DrawTicker } from '@/components/DrawTicker';
import { storage } from '@/lib/storage';
import { fetchFromSupabase } from '@/lib/supabase';
import { scopeAccent } from '@/lib/scopeAccent';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';
import { ScopeSegment } from '@/components/ScopeSegment';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HitCard } from '@/components/HitCard';
import { FreshnessLine } from '@/components/FreshnessLine';
import { InfoTooltip } from '@/components/InfoTooltip';
import { useToast } from '@/components/Toast';
import { NeonRefreshControl } from '@/components/NeonRefreshControl';
import { runHitDetectionAllScopes } from '@/lib/hitDetection';

function toComboSet(combo: string) { return '{' + combo.split('').sort().join(',') + '}'; }
function tempColorForEnergy(e: number, colors: ColorTokens): string {
  if (e >= 80) return colors.hot;
  if (e >= 60) return colors.warm;
  if (e >= 40) return colors.mild;
  return colors.cold;
}

function tempLabel(e: number): string {
  if (e >= 80) return 'HOT';
  if (e >= 60) return 'WARM';
  if (e >= 40) return 'MILD';
  return 'COLD';
}

const SCOPE_LABELS: Record<string, string> = { midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All Day' };
const MODE_LABELS = ['balanced', 'conservative', 'aggressive'];

type Tab = 'picks' | 'hits' | 'more';

// ─── Grid tile (v8 — temp badge + signal labels/values + glow) ────────────
function GridTile({ pick, onPress }: { pick: PickItem; onPress: () => void }) {
  const { colors } = useTheme();
  const gt = useMemo(() => makeGt(colors), [colors]);
  const tc       = tempColorForEnergy(pick.energy, colors);
  const tLabel   = tempLabel(pick.energy);
  const isLocked = pick.locked;
  const digits   = isLocked ? '•••' : (pick.bestOrder ?? pick.combo);

  const channels = [
    { k: 'B', v: pick.signals.BOX,      c: colors.cyan   },
    { k: 'P', v: pick.signals.PBURST,   c: colors.rose   },
    { k: 'C', v: pick.signals.CO,       c: colors.purple },
    { k: 'D', v: pick.signals.DGC ?? 0, c: colors.gold   },
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
const makeGt = (colors: ColorTokens) => StyleSheet.create({
  // Screenshot surface — every dimension here is chosen so 3 rows of these
  // tiles fit comfortably on the smallest reasonable phone (~135pt per row
  // after gridArea padding + row gaps on iPhone SE). Do NOT add vertical
  // content without compensating elsewhere; the constraint is hard.
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    padding: 8,
    gap: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  rankNum: { fontSize: 10, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3 },
  tempBadge: {
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(20,12,38,0.55)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6,
  },
  tempLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, fontFamily: theme.typography.fontFamily.monoBold },
  tempNum:   { fontSize: 9,  fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },

  // Digits stay the visual headline of the screenshot — keep them bold but
  // a touch smaller than before (was 32/34). adjustsFontSizeToFit handles
  // narrower screens by shrinking further if needed.
  digits: {
    fontSize: 26, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1.5, lineHeight: 28,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comboSet: { flex: 1, fontSize: 9, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  mult: { fontSize: 8, fontWeight: '900', letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold },

  // Signal grid — single-row 4-cell layout (was 2×2). Each cell ~22% wide
  // with a thin bar; this packs into one row instead of two, saving ~16pt
  // vertically and keeping all 4 signals visible at a glance.
  signalGrid: { flexDirection: 'row', columnGap: 4, marginTop: 'auto' },
  signalCell: { flex: 1, gap: 1 },
  signalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  signalKey: { fontSize: 8, fontWeight: '900', letterSpacing: 0.4, fontFamily: theme.typography.fontFamily.monoBold },
  signalVal: { fontSize: 9, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  barTrack: { height: 2.5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  barFill: {
    height: 2.5, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },

  lockedRow: { marginTop: 'auto', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  lockedText: { fontSize: 10, color: colors.textTertiary, fontWeight: '700' },
});

export default function SlatesScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { snapshot, refreshSnapshot, activePicks } = useSnapshot();
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
  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; isLocked: boolean }>({ visible: false, isLocked: false });

  const isFree = user?.role === 'free';
  const isAdmin = user?.role === 'admin';
  const isPro = user?.role === 'premium';
  const PRO_DAILY_CREDITS = 3;
  const creditsRemaining = Math.max(0, PRO_DAILY_CREDITS - creditsUsed);

  const todayStr = useMemo(() => getTodayET(), []);
  const { followed: followedStates, toPostgrestFilter } = useFollowedStates();
  const matchedStateFilter = toPostgrestFilter().replace('jurisdiction=', 'matched_state=');

  // Hit feed (Hits tab) reads from adaptive_tracking — the canonical multi-row
  // hit log. Critical for two reasons:
  //   1. Survives slate regens. Each regen produces a new slate_hash; older
  //      hits stay in adaptive_tracking under the old hash. daily_intelligence
  //      would lose them when the soft-delete happens on regen.
  //   2. Multi-state hits visible. One pick can match in multiple jurisdictions
  //      (today: 916 box-set {1,6,9} hit BOTH WI 619 AND ME,NH,VT 196).
  //      daily_intelligence has 1 row per pick; adaptive_tracking has one
  //      row per (pick × matched_state) so secondaries surface naturally.
  const { data: feedHits = [] } = useQuery<Array<{ scope: string; combo: string; rank: number; matched_state: string; matched_session: string; hit_box: boolean; hit_straight: boolean; actual_result: string | null }>>({
    queryKey: ['hit_feed_today_adaptive', todayStr, followedStates.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=eq.${todayStr}&hit_box=eq.true&mode=eq.balanced${matchedStateFilter}&select=scope,combo,rank,matched_state,matched_session,hit_box,hit_straight,actual_result&order=matched_session.asc&limit=200`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    enabled: tab === 'hits',
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const feedHitsValid = useMemo(() => {
    // BUG-132 defense in depth — only show hits whose slate scope matches
    // the hit session (or scope=allday, which matches any session per the
    // user convention saved 2026-05-13).
    const sessionOrder: Record<string, number> = { morning: 0, midday: 1, evening: 2, night: 3 };
    return feedHits
      .filter(h => {
        const s = (h.scope ?? '').toLowerCase();
        const sess = (h.matched_session ?? '').toLowerCase();
        if (s === 'allday') return true;
        if (!sess) return true;
        return s === sess;
      })
      .sort((a, b) => (sessionOrder[a.matched_session?.toLowerCase()] ?? 9) - (sessionOrder[b.matched_session?.toLowerCase()] ?? 9));
  }, [feedHits]);

  // Scope-filtered Today's hits — same source as the feed but narrowed to
  // the user's currently-selected scope. Surfaces hits even after a slate
  // regen produced different picks (regenerated slates don't carry the
  // hit annotations from the prior slate_hash).
  const { data: scopedHits = [] } = useQuery<Array<{ combo: string; rank: number; matched_state: string; matched_session: string; hit_box: boolean; hit_straight: boolean; actual_result: string | null }>>({
    queryKey: ['hits_today_scope', todayStr, scope, followedStates.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=eq.${todayStr}&scope=eq.${encodeURIComponent(scope)}&hit_box=eq.true&mode=eq.balanced${matchedStateFilter}&select=combo,rank,matched_state,matched_session,hit_box,hit_straight,actual_result&order=rank.asc&limit=50`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    enabled: tab === 'hits',
    staleTime: 60 * 1000,
  });

  // "Show yesterday" toggle + yesterdaySnap useQuery removed — the original
  // implementation fetched a snapshot but never consumed it in the picks tab,
  // so the button was a dead-end. Replaced with a tap-through to the Replay
  // screen, which does the same job (yesterday's picks vs actual draws) and
  // already exists at app/replay.tsx (§4.4).

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

  // slateHitItems is the data behind the "Today's hits" section in the Hits
  // tab. It now sources from `scopedHits` (adaptive_tracking, scope-filtered
  // by current selection) — NOT from useSnapshot().hitPicks any more, because
  // hitPicks comes from the CURRENT snapshot which can be a fresh post-hit
  // regen whose picks intentionally excluded already-drawn box-sets, leaving
  // zero hit annotations on the active slate. adaptive_tracking preserves
  // hits across slate_hash regenerations.
  const slateHitItems = useMemo((): PickItem[] => scopedHits.map((row, idx) => ({
    rank: row.rank ?? (idx + 1),
    combo: row.combo ?? '---',
    comboSet: toComboSet(row.combo ?? ''),
    energy: 0,
    signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 },
    locked: false,
    hitType: (row.hit_straight ? 'straight' : 'box') as 'straight' | 'box',
    hitState: row.matched_state ?? undefined,
    hitSession: row.matched_session ?? undefined,
    hitResult: row.actual_result ?? undefined,
  })), [scopedHits]);

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
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <CosmicBackground />
      {/* ── Header (shared ScreenHeader — design.md step 3; freshness via FreshnessLine — step 5) ── */}
      <ScreenHeader
        title={<Text style={s.title}>ZK6 <Text style={{ color: colors.cyan }}>Picks</Text></Text>}
        subtitle={<FreshnessLine snapshot={snapshot} />}
        rightSlot={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                <Settings size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        }
      />


      {/* ── Big segmented scope control (shared ScopeSegment — design.md step 1) ── */}
      {tab === 'picks' && (
        <View style={s.scopeBigRowWrap}>
          <ScopeSegment value={scope as any} onChange={setScope as any} size="tall" />
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

      {/* §4.2 last-hit pill */}
      <LastHitPill />

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
            // Grid view (2×3) — SCREENSHOT SURFACE. Per the brand, all 6
            // picks must fit on one screen with no scroll. Rows take equal
            // share of available container height (flex:1); the tile
            // content is dense enough to fit even on iPhone SE.
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
              refreshControl={<NeonRefreshControl refreshing={isPullRefreshing} onRefresh={handlePullRefresh} tintColor={colors.primary} />}
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
            <View style={{ gap: 8 }}>
              {slateHitItems.map((pick, i) => (
                <HitCard
                  key={i}
                  combo={pick.combo}
                  hitType={(pick.hitType ?? 'box') as 'straight' | 'box'}
                  hitState={pick.hitState}
                  hitSession={pick.hitSession}
                />
              ))}
            </View>
          )}

          <Text style={[s.sectionTitle, { marginTop: 16 }]}>Hit feed · all scopes today</Text>
          {feedHitsValid.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyEmoji}>📡</Text>
              <Text style={s.emptyTitle}>No hits across the engine yet</Text>
              <Text style={s.emptyDesc}>Confirmed hits from any scope and jurisdiction will appear here.</Text>
            </View>
          ) : (
            <View style={{ gap: 5 }}>
              {feedHitsValid.map((h, i) => {
                const sessIcon = h.matched_session === 'midday' ? '☀️' : h.matched_session === 'evening' ? '🌙' : h.matched_session === 'morning' ? '🌅' : h.matched_session === 'night' ? '🌑' : '◈';
                const tint = scopeAccent(h.scope);
                const isStraight = !!h.hit_straight;
                return (
                  <View key={`${h.scope}-${h.combo}-${h.matched_state}-${h.matched_session}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: tint + '0E', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: tint }}>
                    <Text style={{ fontSize: 14 }}>{sessIcon}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, color: colors.text, minWidth: 56 }}>{h.combo}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        <Text style={{ color: tint, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold }}>{h.scope}</Text>
                        {' · '}
                        <Text style={{ fontWeight: '700', color: colors.text }}>{h.matched_state}</Text>
                        {' · '}
                        {h.matched_session}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: isStraight ? colors.gold + '88' : colors.cyan + '88', backgroundColor: isStraight ? colors.gold + '18' : colors.cyan + '14' }}>
                      <Text style={{ fontSize: 8, fontWeight: '900', color: isStraight ? colors.gold : colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 }}>
                        {isStraight ? '⭐ STR' : '🎯 BOX'}
                      </Text>
                    </View>
                  </View>
                );
              })}
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
          <TouchableOpacity
            style={[s.bigAction, { marginTop: 8 }]}
            onPress={() => router.push('/replay')}
            accessibilityRole="button"
            accessibilityLabel="Open replay — review past slates vs actual draws"
          >
            <Text style={{ fontSize: 20 }}>📅</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bigActionTitle}>Replay past slates</Text>
              <Text style={s.bigActionSub}>Yesterday's K6 picks vs actual draws · last 7 days</Text>
            </View>
            <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
          </TouchableOpacity>

          {/* ── Group: Account ── */}
          <Text style={[s.moreGroupTitle, { marginTop: 22 }]}>ACCOUNT</Text>
          {isPro && (
            <View style={s.statRow}>
              <Text style={s.statLabel}>Daily regenerations</Text>
              <Text style={[s.statValue, creditsRemaining === 0 && { color: colors.error }]}>
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
                <X size={20} color={colors.textSecondary} />
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

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // status strip retired (design.md step 5) — freshness now lives in the header subtitle
  // via components/FreshnessLine.tsx. Operator-grade fields (live-dot, hash, raw ET clock)
  // are no longer subscriber-facing.

  // header layout moved to components/ScreenHeader.tsx (design.md step 3).
  title: { fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 26, fontFamily: theme.typography.fontFamily.bold },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.purple, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  // tabs
  tabBar: { flexDirection: 'row', backgroundColor: colors.background, paddingHorizontal: theme.layout.screenInset, paddingVertical: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  tabBtnOn: { backgroundColor: colors.purple + '22', borderColor: colors.purple + '88' },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1 },
  tabTextOn: { color: colors.purple },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },

  // Big scope segmented control (screenshot-friendly)
  // Wrapper preserves the surrounding band: bg-elevated, bottom border,
  // padding around the shared ScopeSegment. (Component itself is layout-only.)
  scopeBigRowWrap: { backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: theme.layout.screenInset, paddingTop: 10, paddingBottom: 10 },
  scopeMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: theme.layout.screenInset, paddingTop: 6, paddingBottom: 6, backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border },
  scopeTimestampInline: { flex: 1, fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.4 },
  viewToggle: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 8, padding: 2, gap: 1, borderWidth: 1, borderColor: colors.border },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  viewToggleBtnOn: { backgroundColor: colors.purple + '20', borderWidth: 1, borderColor: colors.purple + '66' },
  viewToggleText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  viewToggleTextOn: { color: colors.purple, fontWeight: '900' },

  // Header icon button (settings ⚙️)
  iconBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, marginLeft: 6 },

  // Slate display controls sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, borderTopWidth: 1.5, borderColor: colors.purple + '44', gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  sheetGroupLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 8, marginBottom: 6 },
  sheetGroupRow: { flexDirection: 'row', gap: 6 },
  sheetChip: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sheetChipOnCyan: { backgroundColor: colors.cyan + '14', borderColor: colors.cyan + '88' },
  sheetChipOnPurple: { backgroundColor: colors.purple + '20', borderColor: colors.purple + '88' },
  sheetChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  sheetChipTextOnCyan: { color: colors.cyan, fontWeight: '900' },
  sheetChipTextOnPurple: { color: colors.purple, fontWeight: '900' },

  // More tab section grouping
  moreGroupTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 10 },

  content: { flex: 1 },
  listContent: { paddingHorizontal: theme.layout.screenInset, paddingVertical: 14, paddingBottom: 32, gap: 8 },

  gridContainer: { flex: 1, backgroundColor: colors.background },
  // flex:1 on rows lets all 3 rows split the container height evenly.
  // Tile content (see `gt` below) is sized to fit even when 1/3 of the
  // smallest reasonable phone (iPhone SE ≈ ~135pt per row) is allocated.
  gridArea: { flex: 1, padding: 8, gap: 6 },
  gridRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 6 },

  sectionTitle: { fontSize: 10, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 8 },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  statLabel: { fontSize: 13, color: colors.text, flex: 1 },
  statValue: { fontSize: 14, fontWeight: '900', color: colors.purple, fontFamily: theme.typography.fontFamily.monoBold },

  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.bgElevated },
  modeBtnOn: { borderColor: colors.purple + '88', backgroundColor: colors.purple + '18' },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  modeBtnTextOn: { color: colors.purple },

  bigAction: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.tile, borderWidth: 1, borderColor: colors.border },
  bigActionTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  bigActionSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },

  emptyCard: { padding: 22, alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.tile, borderWidth: 1, borderColor: colors.border },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  upsellCard: { borderRadius: theme.borderRadius.lg, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '66', backgroundColor: colors.purple + '12' },
  upsellTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 4 },
  upsellDesc: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  upsellBtn: { backgroundColor: colors.purple, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 11 },
  upsellBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  disclaimer: { fontSize: 11, color: colors.textTertiary, lineHeight: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
  modalBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderMed, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { color: colors.text, fontWeight: '600' },
});
