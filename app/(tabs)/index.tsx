import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated, Platform, RefreshControl,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { useAuth } from '@/hooks/useAuth';
import { TopKStraightRow } from '@/types/core';
import { DrawTicker } from '@/components/DrawTicker';
import { PickCard, PickItem } from '@/components/PickCard';
import { PickDetailModal } from '@/components/PickDetailModal';
import { Paywall } from '@/components/Paywall';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { InfoTooltip } from '@/components/InfoTooltip';
import { useToast } from '@/components/Toast';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { getTodayET } from '@/lib/dateUtils';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}
function energyColor(e: number) {
  if (e >= 80) return theme.colors.hot;
  if (e >= 65) return theme.colors.amber;
  if (e >= 45) return theme.colors.gold;
  return theme.colors.textTertiary;
}
function energyEmoji(e: number) {
  if (e >= 80) return '🔥';
  if (e >= 65) return '⚡';
  if (e >= 45) return '✦';
  return '❄';
}

const SCOPE_LABELS: Record<string, string> = {
  midday: '☀️ Midday',
  evening: '🌙 Evening',
  allday: '◈ All Day',
};

const MODE_OPTIONS = [
  { key: 'balanced',     label: 'Balanced',     sub: 'Equal weight' },
  { key: 'conservative', label: 'Conservative', sub: 'History focus' },
  { key: 'aggressive',   label: 'Aggressive',   sub: 'Momentum focus' },
];

// ─── Live Results Ticker ──────────────────────────────────────────────────────
interface TickerHistoryRow {
  jurisdiction: string;
  result_digits: string;
  session: string;
  date_et: string;
  comboset_sorted?: string;
}

function LiveResultsTicker({ currentPickSets }: { currentPickSets?: Set<string> }) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const { data: rows } = useQuery<TickerHistoryRow[]>({
    queryKey: ['live_ticker'],
    queryFn: () => fetchFromSupabase<TickerHistoryRow[]>({
      path: '/rest/v1/histories?order=date_et.desc,session.desc&limit=50&select=jurisdiction,result_digits,session,date_et,comboset_sorted&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)',
    }),
    refetchInterval: 30 * 1000,
    staleTime: 30 * 1000,
  });

  const items = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const deduped = rows.filter(r => r.result_digits && r.result_digits.length >= 3);
    return [...deduped, ...deduped]; // double for seamless loop
  }, [rows]);

  const ITEM_WIDTH = 95;
  const tickerWidth = (items?.length ?? 0) * ITEM_WIDTH;

  useEffect(() => {
    if (!items || items.length === 0) return;
    animRef.current?.stop();
    scrollX.setValue(0);
    animRef.current = Animated.loop(
      Animated.timing(scrollX, {
        toValue: -tickerWidth / 2,
        duration: (items?.length ?? 0) * 1000,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    animRef.current.start();
    return () => animRef.current?.stop();
  }, [items]);

  // Pulsing LIVE badge
  useEffect(() => {
    pulseRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    pulseRef.current.start();
    return () => pulseRef.current?.stop();
  }, []);

  const stateAbbr = (j: string) => j.replace(/\s+/g, '').slice(0, 2).toUpperCase();

  const toSet = (combo: string) => '{' + combo.split('').sort().join(',') + '}';

  const isMatch = (item: TickerHistoryRow): boolean => {
    if (!currentPickSets || currentPickSets.size === 0) return false;
    const cs = item.comboset_sorted ?? toSet(item.result_digits);
    return currentPickSets.has(cs);
  };

  return (
    <View style={tk.container}>
      <View style={tk.labelBox}>
        <Animated.View style={[tk.liveDot, { backgroundColor: theme.colors.error, opacity: pulseAnim }]} />
        <Text style={tk.labelText}>LIVE</Text>
      </View>
      <View style={tk.track}>
        {!items ? (
          <View style={{ paddingHorizontal: 12, justifyContent: 'center', flex: 1 }}>
            <Text style={tk.awaitingText}>● Awaiting live data…</Text>
          </View>
        ) : (
          <Animated.View style={[tk.row, { transform: [{ translateX: scrollX }] }]}>
            {items.map((item, i) => {
              const isMid = item.session === 'midday';
              const matched = isMatch(item);
              return (
                <View key={i} style={[tk.chip, matched && tk.chipMatch]}>
                  <View style={[tk.stateTag, { backgroundColor: isMid ? theme.colors.gold : theme.colors.purple }]}>
                    <Text style={[tk.stateText, { color: '#000000' }]}>{stateAbbr(item.jurisdiction)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[tk.chipText, { color: matched ? theme.colors.amber : isMid ? theme.colors.gold : theme.colors.text }]}>
                    {matched ? '🎯' : ''}{item.result_digits}
                  </Text>
                  <View style={[tk.sessionDot, { backgroundColor: isMid ? theme.colors.gold : theme.colors.purple }]} />
                </View>
              );
            })}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const tk = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#000000', borderRadius: theme.borderRadius.lg,
    borderTopWidth: 2, borderBottomWidth: 2,
    borderTopColor: '#FFD700', borderBottomColor: '#FFD700',
    overflow: 'hidden', height: 70,
  },
  labelBox: {
    alignItems: 'center', justifyContent: 'center', gap: 3,
    backgroundColor: '#FF0000', paddingHorizontal: 8, height: '100%', width: 42,
    borderRightWidth: 1, borderRightColor: '#FF000055',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  labelText: { fontSize: 8, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  track: { flex: 1, overflow: 'hidden', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, height: '100%' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 5, width: 90,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  chipMatch: {
    backgroundColor: '#FFD70033',
    borderColor: '#FFD70066',
  },
  sessionDot: { width: 6, height: 6, borderRadius: 3 },
  stateTag: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  stateText: { fontSize: 10, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  chipText: { fontSize: 12, fontWeight: '900', color: '#fff', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2, flex: 1 },
  awaitingText: { fontSize: 10, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' },
});

// ─── Onboarding Modal ─────────────────────────────────────────────────────────
const ONBOARDING_SCREENS = [
  {
    emoji: '🏆',
    title: 'Welcome to HitMaster',
    body: 'Your daily Pick 3 intelligence system. The ZK6™ Engine analyzes years of draw history to surface your highest-signal plays.',
    btn: 'Next →',
  },
  {
    emoji: '⚡',
    title: 'Your Daily K6 Slate',
    body: 'Each morning your K6 Slate is powered by 3 signals — Frequency, Momentum, and Pattern — ranked by Energy Score. Higher energy = stronger convergence.',
    btn: 'Next →',
  },
  {
    emoji: '🌟',
    title: 'Join 2,400+ Players',
    body: 'Players across 18 states use HitMaster daily. Upgrade to Oracle+ to see all 6 picks, optimal straights, and deep analytics.',
    btn: 'Get My Slates',
  },
];

function OnboardingModal({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const screen = ONBOARDING_SCREENS[step];

  const handleNext = async () => {
    if (step < ONBOARDING_SCREENS.length - 1) {
      setStep(s => s + 1);
    } else {
      await storage.setItem('onboarding_complete', 'true');
      onDone();
    }
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={ob.backdrop}>
        <LinearGradient colors={[theme.colors.bgElevated, theme.colors.background]} style={ob.card}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{screen.emoji}</Text>
          <Text style={ob.title}>{screen.title}</Text>
          <Text style={ob.body}>{screen.body}</Text>
          <View style={ob.dots}>
            {ONBOARDING_SCREENS.map((_, i) => (
              <View key={i} style={[ob.dot, i === step && ob.dotActive]} />
            ))}
          </View>
          <TouchableOpacity style={ob.btn} onPress={handleNext}>
            <Text style={ob.btnText}>{screen.btn}</Text>
          </TouchableOpacity>
          {step > 0 && (
            <TouchableOpacity onPress={onDone} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: theme.colors.textTertiary }}>Skip</Text>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const ob = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    width: '100%', maxWidth: 380, borderRadius: 22, padding: 28,
    alignItems: 'center', borderWidth: 1.5, borderColor: theme.colors.purple + '44',
  },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.border },
  dotActive: { backgroundColor: theme.colors.purple, width: 18 },
  btn: { backgroundColor: theme.colors.purple, borderRadius: 13, paddingHorizontal: 28, paddingVertical: 13, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});


// ─── Engine Status Bar ────────────────────────────────────────────────────────
function EngineStatusBar({ snapshot }: { snapshot: ReturnType<typeof useSnapshot>['snapshot'] }) {
  if (!snapshot) return null;
  const meta = snapshot.horizons_present_json as Record<string, any>;
  const version = (meta?._engineVersion as string) ?? 'v2.0';
  const rawStats = meta?._dataStats as Record<string, any> | undefined;
  const usingFallback = rawStats?.usingFallback === true;
  const boxRows = typeof rawStats?.boxRowsUsed === 'number' ? rawStats.boxRowsUsed : 0;
  const pairRows = typeof rawStats?.pairRowsUsed === 'number' ? rawStats.pairRowsUsed : 0;
  const hLoaded: string[] = Array.isArray(rawStats?.horizonsLoaded) ? rawStats.horizonsLoaded : [];

  if (boxRows === 0) {
    return (
      <View style={[esb.bar, esb.demo]}>
        <Text style={esb.text}>🔶 Sample data only — import real draw history from the Results tab to power live ZK6 analysis</Text>
      </View>
    );
  }
  if (usingFallback) {
    return (
      <View style={[esb.bar, esb.warning]}>
        <Text style={esb.text}>
          {'⚠️ ZK6 ' + version + ' · Showing All Day data (not enough ' + snapshot.scope + ' draws) · Import ' + snapshot.scope + ' results to improve accuracy'}
        </Text>
      </View>
    );
  }
  const hStr = hLoaded.length > 1
    ? hLoaded[0] + '-' + hLoaded[hLoaded.length - 1]
    : (hLoaded[0] ?? 'H01Y');
  return (
    <View style={[esb.bar, esb.live]}>
      <Text style={esb.text} numberOfLines={1}>
        {'⚡ ZK6 ' + version + ' · ' + boxRows + ' box · ' + pairRows + ' pair · ' + hStr + ' horizons · ' + snapshot.scope}
      </Text>
    </View>
  );
}

const esb = StyleSheet.create({
  bar: {
    marginHorizontal: 16, marginTop: 6, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  live: { backgroundColor: 'rgba(43,255,204,0.08)', borderColor: theme.colors.cyan + '55' },
  warning: { backgroundColor: 'rgba(255,217,61,0.08)', borderColor: theme.colors.gold + '55' },
  demo: { backgroundColor: 'rgba(255,106,43,0.08)', borderColor: theme.colors.amber + '55' },
  text: { fontSize: 9, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold },
});

// ─── Home Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { snapshot, refreshSnapshot, isLoading: snapshotLoading, hitPicks, activePicks } = useSnapshot();
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const { scope, setScope: setScopeRaw } = useScope();
  const setScope = (s: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScopeRaw(s as any);
  };
  const { regenerateSlate, checkSlateLock } = useDataIngestion();

  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'balanced' | 'conservative' | 'aggressive'>('balanced');
  const [detail, setDetail] = useState<PickItem | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMsg, setRegenMsg] = useState('');
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [heatCheckCombo, setHeatCheckCombo] = useState('');
  const [isRegenLoading, setIsRegenLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; isLocked: boolean }>({ visible: false, isLocked: false });

  const currentTier = user?.role === 'admin' ? 'PLUS' : user?.role === 'premium' ? 'PRO' : 'FREE';
  const isFree = currentTier === 'FREE';
  const { showToast } = useToast();

  // ── Daily streak + onboarding init ──
  useEffect(() => {
    (async () => {
      const today = getTodayET();
      const lastOpenDate = await storage.getItem('last_open_date');
      const streakStr = await storage.getItem('daily_streak');
      const currentStreak = parseInt(streakStr || '0', 10);
      let newStreak = 1;
      if (lastOpenDate) {
        const diffMs = new Date(today).getTime() - new Date(lastOpenDate).getTime();
        const diffDays = Math.round(diffMs / 86400000);
        if (diffDays === 0) newStreak = Math.max(currentStreak, 1);
        else if (diffDays === 1) newStreak = currentStreak + 1;
        // else reset to 1
      }
      await storage.setItem('last_open_date', today);
      await storage.setItem('daily_streak', String(newStreak));
      setDailyStreak(newStreak);

      const firstOpen = await storage.getItem('first_open_date');
      if (!firstOpen) await storage.setItem('first_open_date', today);

      const onboardingDone = await storage.getItem('onboarding_complete');
      if (!onboardingDone) setShowOnboarding(true);
    })();
  }, []);

  // ── Histories stats ──
  const { data: historiesStats } = useQuery({
    queryKey: ['histories_stats'],
    queryFn: async () => {
      const rows = await fetchFromSupabase<{ jurisdiction: string }[]>({
        path: '/rest/v1/histories?select=jurisdiction&limit=10000&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)',
      });
      return {
        totalDraws: rows.length,
        activeStates: new Set(rows.map(r => r.jurisdiction)).size,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Today's results for hit streak banner ──
  const todayStr = useMemo(() => getTodayET(), []);
  const { data: todayResults } = useQuery<{ result_digits: string; jurisdiction: string; session: string }[]>({
    queryKey: ['today_results', todayStr],
    queryFn: () => fetchFromSupabase({
      path: `/rest/v1/histories?date_et=eq.${todayStr}&select=result_digits,jurisdiction,session&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)`,
    }),
    staleTime: 5 * 60 * 1000,
  });

  const handlePullRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshSnapshot();
    } catch (err) {
      console.warn('[Home] Pull-refresh failed:', err instanceof Error ? err.message : String(err));
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshSnapshot]);

  const handleRequestRegen = async () => {
    const canonScope = (scope.toLowerCase().replace(/[-\s_]/g, '') || 'allday') as typeof scope;
    const isLocked = await checkSlateLock(canonScope);
    setRegenConfirm({ visible: true, isLocked });
  };

  const handleGenerate = useCallback(async (force?: boolean) => {
    setRegenConfirm({ visible: false, isLocked: false });
    try {
      setIsRegenLoading(true);
      const canonScope = (scope.toLowerCase().replace(/[-\s_]/g, '') || 'allday') as typeof scope;
      const res = await regenerateSlate(canonScope, mode, force === true);
      if (res.status === 'success') {
        showToast('✓ Slate regenerated successfully', 'success');
        queryClient.removeQueries({ queryKey: ['snapshot', scope] });
        await refreshSnapshot();
      } else {
        setRegenMsg(res.message);
        setRegenOpen(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRegenMsg(`Error: ${msg}`);
      setRegenOpen(true);
    } finally {
      setIsRegenLoading(false);
    }
  }, [regenerateSlate, scope, mode, refreshSnapshot, showToast]);

  const handleModeChange = useCallback((newMode: typeof mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
    // Auto-generate on mode change removed for safety; user must use Generate button
  }, []);

  const items = useMemo((): PickItem[] => {
    // Use activePicks (non-hit) from useSnapshot; fall back to snapshot raw picks filtered
    const list = activePicks.length > 0
      ? activePicks
      : (Array.isArray(snapshot?.top_k_straights_json)
        ? (snapshot!.top_k_straights_json as any[]).filter((p: any) => !p?.hitType)
        : []);
    const components = snapshot?.components_json ?? [];

    if (!Array.isArray(list) || list.length === 0) {
      return Array.from({ length: 6 }).map((_, i) => ({
        rank: i + 1, combo: '•••', comboSet: '{•,•,•}', energy: 0,
        signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 }, locked: isFree && i >= 2,
      }));
    }

    return list.slice(0, 6).map((row, idx) => {
      let combo = '---', energy = 0, signals = { BOX: 0, PBURST: 0, CO: 0, DGC: 0 };
      let multiplicity: string | undefined, topPair: string | undefined, bestOrder: string | undefined;
      let drawsSince: number | undefined, timesDrawn: number | undefined, lastSeen: string | undefined;

      if (typeof row === 'string') {
        combo = row;
        const cd = Array.isArray(components) ? components.find((c: any) => c?.combo === combo) : null;
        if (cd) { energy = cd.temperature ?? 0; signals = { ...signals, ...(cd.components ?? {}) }; multiplicity = cd.multiplicity; topPair = cd.topPair; }
      } else {
        const r = row as any;
        combo = r.combo ?? '---';
        energy = typeof r.energy === 'number' ? r.energy
          : typeof r.temperature === 'number' ? r.temperature
          : typeof r.indicator === 'number' ? Math.round(r.indicator * 100) : 0;
        signals = { BOX: Number(r.box ?? 0), PBURST: Number(r.pburst ?? 0), CO: Number(r.co ?? 0), DGC: Number(r.signals?.DGC ?? 0) };
        multiplicity = r.multiplicity as string | undefined;
        topPair = r.topPair;
        bestOrder = r.bestOrder;
        drawsSince = r.drawsSince;
        timesDrawn = r.timesDrawn;
        lastSeen = r.lastSeen;
      }

      return { rank: idx + 1, combo, comboSet: toComboSet(combo), bestOrder, energy, signals, multiplicity, topPair, drawsSince, timesDrawn, lastSeen, locked: isFree && idx >= 2, generatedAt: snapshot?.updated_at_et ?? undefined, snapshotScope: snapshot?.scope ?? undefined };
    });
  }, [activePicks, snapshot, isFree]);

  const hitItems = useMemo((): PickItem[] => {
    return hitPicks.map((row: any, idx) => ({
      rank: row.rank ?? (idx + 1),
      combo: row.combo ?? '---',
      comboSet: row.comboSet ?? toComboSet(row.combo ?? ''),
      energy: row.energy ?? 0,
      signals: { BOX: Number(row.box ?? 0), PBURST: Number(row.pburst ?? 0), CO: Number(row.co ?? 0), DGC: Number(row.signals?.DGC ?? 0) },
      locked: false,
      hitType: row.hitType as 'straight' | 'box',
      hitState: row.hitState,
      hitSession: row.hitSession,
      hitResult: row.hitResult,
    }));
  }, [hitPicks]);

  // ── Hit streak banner ──
  const hitBanner = useMemo(() => {
    if (!todayResults || !Array.isArray(todayResults) || todayResults.length === 0) return null;
    for (const result of todayResults) {
      if (!result.result_digits || result.result_digits.length < 3) continue;
      // Session must match the current slate scope
      const sessionMatches =
        scope === 'allday' ||
        (scope === 'midday' && result.session === 'midday') ||
        (scope === 'evening' && result.session === 'evening');
      if (!sessionMatches) continue;
      const resultSet = toComboSet(result.result_digits);
      for (const pick of items.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••')) {
        if (pick.comboSet === resultSet) {
          return {
            rank: pick.rank,
            jurisdiction: result.jurisdiction,
            session: result.session,
            digits: result.result_digits,
          };
        }
      }
    }
    return null;
  }, [todayResults, items, scope]);

  const avgEnergy = useMemo(() => {
    const unlocked = items.filter(x => !x.locked && x.energy > 0);
    if (!unlocked.length) return 0;
    return Math.round(unlocked.reduce((a, x) => a + x.energy, 0) / unlocked.length);
  }, [items]);

  const hasData = Array.isArray(snapshot?.top_k_straights_json) && (snapshot?.top_k_straights_json?.length ?? 0) > 0;
  const avgColor = energyColor(avgEnergy);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handlePullRefresh} tintColor={theme.colors.primary} />}
        >

        {/* ── Header ── */}
        <LinearGradient
          colors={theme.gradients.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={s.header}
        >
          <View style={s.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>
                Today's <Text style={{ color: theme.colors.cyan }}>Slates</Text> ⚡
              </Text>
              <Text style={s.subtitle}>Your daily slates, powered by ZK6 Engine</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <View style={[
                s.tierBadge,
                { backgroundColor: currentTier === 'FREE' ? theme.colors.free : currentTier === 'PRO' ? theme.colors.premium : theme.colors.admin },
              ]}>
                <Text style={s.tierText}>
                  {currentTier === 'FREE' ? 'Seeker' : currentTier === 'PRO' ? 'Oracle+ ♛' : 'Mystic ♛'}
                </Text>
              </View>
              {dailyStreak > 0 && (
                <View style={s.streakBadge}>
                  <Text style={s.streakText}>🔥 {dailyStreak}d streak</Text>
                </View>
              )}
            </View>
          </View>

          {/* Scope Switcher */}
          <View style={s.scopeRow}>
            {(['midday', 'evening', 'allday'] as const).map(sc => (
              <TouchableOpacity
                key={sc}
                style={[s.scopeBtn, scope === sc && s.scopeBtnOn]}
                onPress={() => setScope(sc)}
              >
                <Text style={[s.scopeBtnText, scope === sc && s.scopeBtnTextOn]}>{SCOPE_LABELS[sc]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mode Switcher */}
          <View style={s.modeRow}>
            {MODE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.modeBtn, mode === opt.key && s.modeBtnOn]}
                onPress={() => handleModeChange(opt.key as any)}
              >
                <Text style={[s.modeBtnText, mode === opt.key && s.modeBtnTextOn]}>{opt.label}</Text>
                <Text style={[s.modeBtnSub, mode === opt.key && { color: theme.colors.purple + 'AA' }]}>{opt.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {/* ── Engine Status Bar ── */}
        <EngineStatusBar snapshot={snapshot} />

        {/* ── Draw Ticker ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 8 }}>
          <DrawTicker scope={scope} />
          <LiveResultsTicker currentPickSets={new Set(items.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••').map(p => p.comboSet))} />
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setHeatCheckCombo(''); setHeatCheckOpen(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: theme.colors.bgElevated, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.borderMed }}
          >
            <Text style={{ fontSize: 16 }}>🔍</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>Heat Check Any Combo</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hit Streak Banner ── */}
        {hitBanner && (
          <View style={s.hitBanner}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.hitBannerTitle}>ZK6 HIT TODAY! {hitBanner.digits} landed in {hitBanner.jurisdiction}</Text>
              <Text style={s.hitBannerSub}>
                {hitBanner.jurisdiction} · {hitBanner.session === 'midday' ? '☀️ Midday' : '🌙 Evening'} · Box Win ✓ (matched any order)
              </Text>
            </View>
          </View>
        )}

        {/* ── Today's Hits ── */}
        {hitItems.length > 0 && (
          <View style={s.hitsSection}>
            <Text style={s.hitsSectionTitle}>🎯 Today's Hits</Text>
            {hitItems.map((pick, i) => (
              <View key={i} style={s.hitRow}>
                <View style={[s.hitTypeBadge, { backgroundColor: pick.hitType === 'straight' ? theme.colors.gold + '22' : theme.colors.cyan + '22', borderColor: pick.hitType === 'straight' ? theme.colors.gold + '66' : theme.colors.cyan + '66' }]}>
                  <Text style={[s.hitTypeBadgeText, { color: pick.hitType === 'straight' ? theme.colors.gold : theme.colors.cyan }]}>
                    {pick.hitType === 'straight' ? '⭐ STRAIGHT' : '🎯 BOX'}
                  </Text>
                </View>
                <Text style={s.hitCombo}>{pick.combo}</Text>
                <Text style={s.hitMeta}>
                  {pick.hitState}{pick.hitSession ? ` · ${pick.hitSession === 'midday' ? '☀️' : '🌙'}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Energy stat strip ── */}
        <View style={s.statStrip}>
          <Text style={[s.statStripNum, { color: avgColor }]}>{avgEnergy}</Text>
          <Text style={s.statStripLabel}>AVG ENERGY</Text>
          <InfoTooltip
            term="Energy Score"
            definition={'0–100 signal strength for your slate.\n\n🔥 BLAZING (80+) — Exceptional convergence\n⚡ HOT (65–79) — Strong signal\n✦ WARM (45–64) — Moderate signal\n❄ COOL (below 45) — Weak signal\n\nHigher = more signals agree this combo is due.'}
            size={14}
          />
          <View style={s.statStripDiv} />
          <Text style={s.statStripVal}>{isFree ? 2 : 6} picks</Text>
          <Text style={s.statStripSep}>·</Text>
          <Text style={[s.statStripVal, { color: theme.colors.cyan }]}>{SCOPE_LABELS[scope] ?? scope}</Text>
          {historiesStats?.totalDraws ? (
            <>
              <Text style={s.statStripSep}>·</Text>
              <Text style={s.statStripVal}>{historiesStats.totalDraws.toLocaleString()} draws</Text>
            </>
          ) : null}
          {historiesStats?.activeStates ? (
            <>
              <Text style={s.statStripSep}>·</Text>
              <Text style={[s.statStripVal, { color: theme.colors.cyan }]}>{historiesStats.activeStates} states</Text>
            </>
          ) : null}
        </View>

        {/* ── K6 Slate ── */}
        <View style={s.slateSection}>
          <View style={s.slateSectionHdr}>
            <Text style={s.slateSectionTitle}>
              K6 <Text style={{ color: theme.colors.cyan }}>Slate</Text>
            </Text>
            {(!hasData || snapshotLoading) && (
              <TouchableOpacity style={s.generateBtn} onPress={handleRequestRegen} disabled={isRegenLoading}>
                <RefreshCw size={14} color={theme.colors.text} />
                <Text style={s.generateBtnText}>{isRegenLoading ? 'Generating…' : 'Generate'}</Text>
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

          {snapshotLoading ? (
            <View style={s.loadingCard}>
              <Text style={s.loadingText}>⚡ Computing your K6 Slate…</Text>
            </View>
          ) : (
            items.map(pick => (
              <PickCard
                key={`${pick.rank}-${pick.combo}`}
                pick={pick}
                onTap={() => !pick.locked && setDetail(pick)}
                onUnlock={() => setPaywallOpen(true)}
              />
            ))
          )}

          {isFree && !snapshotLoading && (
            <View style={s.proGate}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>🏆</Text>
              <Text style={s.proGateTitle}>See all 6 picks — Oracle+ members do</Text>
              <Text style={s.proGateDesc}>
                Picks #3–6 are hidden. Oracle+ unlocks all 6 K6 picks, the optimal straight order for each, unlimited Heat Checks, and deep pattern analytics.
              </Text>
              <TouchableOpacity style={s.proGateBtn} onPress={() => setPaywallOpen(true)}>
                <Text style={s.proGateBtnText}>Upgrade to Oracle+ · $9.99/mo ♛</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 10, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 6 }}>Try 5 days for $4.99 · Cancel anytime</Text>
            </View>
          )}
        </View>

        {/* ── Responsible Play ── */}
        <View style={s.respSection}>
          <Text style={s.respText}>
            ⚠️ <Text style={{ fontWeight: '700' }}>Responsible Play:</Text> HitMaster slate picks are for entertainment and analysis only — not guarantees. Play responsibly.{' '}
            <Text style={{ fontWeight: '700' }}>1-800-GAMBLER</Text>
          </Text>
        </View>

        <View style={{ height: 40 }} />
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
          isPro={currentTier !== 'FREE'}
          onClose={() => setDetail(null)}
          onHeatCheck={(combo) => { setDetail(null); setHeatCheckCombo(combo); setHeatCheckOpen(true); }}
        />
      )}

      <Paywall visible={paywallOpen} onClose={() => setPaywallOpen(false)} />

      <HeatCheckModal
        visible={heatCheckOpen}
        onClose={() => setHeatCheckOpen(false)}
        initialCombo={heatCheckCombo}
        scope={scope}
      />

      <OnboardingModal visible={showOnboarding} onDone={() => setShowOnboarding(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, lineHeight: 26, fontFamily: theme.typography.fontFamily.bold },
  subtitle: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  tierText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  streakBadge: {
    backgroundColor: theme.colors.amber + '18', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: theme.colors.amber + '55',
  },
  streakText: { fontSize: 10, fontWeight: '800', color: theme.colors.amber, fontFamily: theme.typography.fontFamily.monoBold },

  scopeRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 10, padding: 2, gap: 1,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  scopeBtn: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  scopeBtnOn: { backgroundColor: theme.colors.bgElevated },
  scopeBtnText: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '500' },
  scopeBtnTextOn: { color: theme.colors.cyan, fontWeight: '700' },

  modeRow: { flexDirection: 'row', gap: 5 },
  modeBtn: {
    flex: 1, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', backgroundColor: theme.colors.bgElevated,
  },
  modeBtnOn: { borderColor: theme.colors.purple + '88', backgroundColor: theme.colors.purple + '18' },
  modeBtnText: { fontSize: 10, fontWeight: '600', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  modeBtnTextOn: { color: theme.colors.purple },
  modeBtnSub: { fontSize: 8, color: theme.colors.textTertiary + '88', marginTop: 1 },

  hitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: theme.colors.cyan + '18', borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5, borderColor: theme.colors.cyan + '55', padding: 12,
  },
  hitBannerTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold },
  hitBannerSub: { fontSize: 11, color: theme.colors.cyan + 'AA', marginTop: 2 },

  hitsSection: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: 'rgba(255,217,61,0.08)',
    borderRadius: theme.borderRadius.tile,
    borderWidth: 1.5, borderColor: theme.colors.gold + '55', padding: 12,
    gap: 8,
  },
  hitsSectionTitle: { fontSize: 10, fontWeight: '900', color: theme.colors.gold, marginBottom: 4, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hitTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  hitTypeBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  hitCombo: { fontSize: 20, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text, letterSpacing: 4, flex: 1 },
  hitMeta: { fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' },

  statStrip: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    marginHorizontal: 16, marginTop: 12, marginBottom: 2,
    backgroundColor: theme.colors.bgElevated, borderRadius: theme.borderRadius.tile,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  statStripNum: { fontSize: 22, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900', lineHeight: 24 },
  statStripLabel: { fontSize: 9, color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '800', letterSpacing: 1.5 },
  statStripDiv: { width: 1, height: 16, backgroundColor: theme.colors.border, marginHorizontal: 2 },
  statStripVal: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  statStripSep: { fontSize: 10, color: theme.colors.textTertiary },

  slateSection: { paddingHorizontal: 16 },
  slateSectionHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  slateSectionTitle: { fontSize: 11, fontWeight: '900', color: theme.colors.text, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.purple, paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.tile,
  },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  loadingCard: {
    backgroundColor: theme.colors.card, borderRadius: theme.borderRadius.card, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border,
  },
  loadingText: { fontSize: 13, color: theme.colors.textTertiary },

  proGate: {
    borderRadius: theme.borderRadius.card, padding: 22, alignItems: 'center',
    borderWidth: 1.5, borderColor: theme.colors.purple + '66', marginTop: 4, marginBottom: 16,
    backgroundColor: theme.colors.purple + '12',
  },
  proGateTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  proGateDesc: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  proGateBtn: { backgroundColor: theme.colors.purple, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 13 },
  proGateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  respSection: {
    marginHorizontal: 16, padding: 14, borderRadius: theme.borderRadius.tile,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bgElevated, marginTop: 4,
  },
  respText: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: {
    width: '100%', maxWidth: 400, backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: theme.colors.border, padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  modalBtn: {
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.borderMed,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: theme.borderRadius.chip, alignItems: 'center',
  },
  modalBtnText: { color: theme.colors.text, fontWeight: '600' },
});
