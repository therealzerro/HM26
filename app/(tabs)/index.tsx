/* ============================================================================
   v6 PATCH — Home screen, Option A (aggressive cleanup)
   ============================================================================
   FILE:        app/(tabs)/index.tsx
   STRATEGY:    Strip the home screen to title → scope → slate. Move EVERYTHING
                else (mode switcher, tickers, heat check, engine status,
                responsible play) into a single "⋯" overflow bottom-sheet.

   REPLACES:    Full file replacement. Copy this entire file over the existing
                app/(tabs)/index.tsx. All imports referenced below already
                exist in the repo (we removed unused ones — DrawTicker and
                LiveResultsTicker are now only used inside the overflow sheet).

   PRESERVED:   Onboarding modal, daily streak, hit streak banner, hit picks
                section, generate flow, pick detail modal, paywall.

   REMOVED FROM ABOVE-THE-FOLD:
                - Mode switcher row              → overflow sheet
                - EngineStatusBar                → overflow sheet (collapsed)
                - DrawTicker + LiveResultsTicker → overflow sheet
                - Heat Check Any Combo button    → overflow sheet
                - Stat strip (5+ inline values)  → single big AVG ENERGY value
                - Responsible Play disclaimer    → overflow sheet
   ============================================================================ */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
} from 'react-native';
import { NeonRefreshControl as RefreshControl } from '@/components/NeonRefreshControl';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw, MoreHorizontal, Search, X } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, heatColor, type ColorTokens } from '@/lib/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { useAuth } from '@/hooks/useAuth';
import { DrawTicker } from '@/components/DrawTicker';
import { PickCard, PickItem } from '@/components/PickCard';
import { PickDetailModal } from '@/components/PickDetailModal';
import { router } from 'expo-router';
import { HeatCheckModal } from '@/components/HeatCheckModal';
import { HeatCheckFAB } from '@/components/HeatCheckFAB';
import { HitCelebrationOverlay } from '@/components/HitCelebrationOverlay';
import { LockedPicksSummary } from '@/components/LockedPicksSummary';
import { LoadingPhrase } from '@/components/LoadingPhrase';
import { CosmicBackground } from '@/components/CosmicBackground';
import { TrialOfferBanner } from '@/components/TrialOfferBanner';
import { BudgetPlanner } from '@/components/BudgetPlanner';
import { LastHitPill } from '@/components/LastHitPill';
import { DailyRecapCard } from '@/components/DailyRecapCard';
import { useCoffeeMode } from '@/hooks/useCoffeeMode';
import { scopeAccent } from '@/lib/scopeAccent';
import { EnergySparkline } from '@/components/EnergySparkline';
import { useToast } from '@/components/Toast';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { getTodayET } from '@/lib/dateUtils';
import { RegenConfirmationModal } from '@/components/RegenConfirmationModal';
import { ScopeSegment } from '@/components/ScopeSegment';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HitCard } from '@/components/HitCard';
import { FreshnessLine } from '@/components/FreshnessLine';
import { BrandMark } from '@/components/BrandMark';
import { useCountUp } from '@/hooks/useCountUp';

function toComboSet(combo: string) { return '{' + combo.split('').sort().join(',') + '}'; }
function energyColor(e: number, colors: ColorTokens) {
  return heatColor(e, colors);
}

const SCOPE_LABELS: Record<string, string> = {
  midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All Day',
};

// Streak milestone tiers (enhancements §3.1). Cleared via celebration toast
// the first time the user's streak hits the milestone today.
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 90] as const;

// BRAND-05 (2026-07-23): the hero band and Oracle+ gate no longer show a
// stored match-rate percentage. The old BACKTEST_HIT_RATE (72.4) was the
// evening-only number from a 2026-05-27 backtest inside the BUG-162 hit
// inflation era — provenance unsound, and it rendered as a global rate.
// The hero column now shows today's verified match count instead.
// SCRUB-01 (2026-05-27): production is balanced-only during deep live testing.
// Mode picker removed from consumer overflow sheet. The `mode` prop remains
// threaded through the component tree for signature stability; always 'balanced'.

function useDrawCountdown(scope: string): string {
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    const targets: [number, number][] =
      scope === 'midday'  ? [[12, 0]]  :
      scope === 'evening' ? [[19, 30]] :
      [[12, 0], [19, 30]];
    const tick = () => {
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      let closest = Infinity;
      for (const [h, m] of targets) {
        const t = new Date(nowET);
        t.setHours(h, m, 0, 0);
        if (t <= nowET) t.setDate(t.getDate() + 1);
        const diff = t.getTime() - nowET.getTime();
        if (diff < closest) closest = diff;
      }
      if (!isFinite(closest)) { setText(''); return; }
      const hr = Math.floor(closest / 3_600_000);
      const mn = Math.floor((closest % 3_600_000) / 60_000);
      const sc = Math.floor((closest % 60_000) / 1_000);
      setText(hr > 0 ? `${hr}h ${mn}m` : `${mn}m ${sc}s`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [scope]);
  return text;
}

// ─── Onboarding (enhancements §7.1: + free-preview screen) ──────────────
type OnboardingScreen =
  | { kind: 'text'; emoji: string; title: string; body: string; btn: string }
  | { kind: 'preview'; emoji: string; title: string; body: string; btn: string };

const ONBOARDING_BASE: OnboardingScreen[] = [
  { kind: 'text', emoji: '🏆', title: 'Welcome to HitMaster', body: 'Your daily numerical pattern analysis. The ZK6™ Engine analyzes years of public draw data to surface your highest-signal combinations.', btn: 'Next →' },
  { kind: 'text', emoji: '⚡', title: 'Your Daily K6 Slate', body: 'Each morning your K6 Slate is powered by 3 signals — Frequency, Momentum, and Pattern — ranked by Energy Score.', btn: 'Next →' },
  { kind: 'text', emoji: '🌟', title: 'Join 2,400+ Members', body: 'Members across 18 states use HitMaster daily. Upgrade to Oracle+ to see all 6 signals.', btn: 'Next →' },
  { kind: 'preview', emoji: '👇', title: 'Your free preview', body: 'A preview of today\'s ZK6 signals — yours on the free tier. Oracle+ unlocks all 6.', btn: 'See My Signals' },
];

interface PreviewPick { rank: number; combo: string; energy: number }

function OnboardingModal({
  visible,
  onDone,
  previewPicks,
}: {
  visible: boolean;
  onDone: () => void;
  previewPicks: PreviewPick[];
}) {
  const { colors } = useTheme();
  const ob = useMemo(() => makeOb(colors), [colors]);
  // If we have no preview picks (snapshot not loaded yet), drop the
  // preview screen so we don't show an empty placeholder.
  const screens = useMemo<OnboardingScreen[]>(
    () => (previewPicks.length > 0 ? ONBOARDING_BASE : ONBOARDING_BASE.filter(s => s.kind !== 'preview')),
    [previewPicks.length],
  );
  const [step, setStep] = useState(0);
  const screen = screens[Math.min(step, screens.length - 1)];
  const next = async () => {
    if (step < screens.length - 1) setStep(s => s + 1);
    else { await storage.setItem('onboarding_complete', 'true'); onDone(); }
  };
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={ob.backdrop}>
        <LinearGradient colors={[colors.bgElevated, colors.background]} style={ob.card}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{screen.emoji}</Text>
          <Text style={ob.title}>{screen.title}</Text>
          <Text style={ob.body}>{screen.body}</Text>
          {screen.kind === 'preview' && (
            <View style={ob.previewWrap}>
              {previewPicks.slice(0, 2).map(p => (
                <View key={p.rank} style={ob.previewPill}>
                  <Text style={ob.previewRank}>#{p.rank}</Text>
                  <Text style={ob.previewCombo}>{p.combo}</Text>
                  <Text style={ob.previewEnergy}>{p.energy}°</Text>
                </View>
              ))}
            </View>
          )}
          <View style={ob.dots}>{screens.map((_, i) => <View key={i} style={[ob.dot, i === step && ob.dotActive]} />)}</View>
          <TouchableOpacity style={ob.btn} onPress={next}><Text style={ob.btnText}>{screen.btn}</Text></TouchableOpacity>
          {step > 0 && <TouchableOpacity onPress={onDone} style={{ marginTop: 10 }}><Text style={{ fontSize: 12, color: colors.textTertiary }}>Skip</Text></TouchableOpacity>}
        </LinearGradient>
      </View>
    </Modal>
  );
}
const makeOb = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 380, borderRadius: theme.borderRadius.xxl, padding: 28, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '44' },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.purple, width: 18 },
  btn: { backgroundColor: colors.purple, borderRadius: 13, paddingHorizontal: 28, paddingVertical: 13, width: '100%', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  previewWrap: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 18 },
  previewPill: { flex: 1, alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.tile, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.cyan + '55' },
  previewRank: { fontSize: 10, fontWeight: '900', color: colors.cyan, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  previewCombo: { fontSize: 24, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 4 },
  previewEnergy: { fontSize: 11, color: colors.gold, marginTop: 4, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700' },
});

// ─── Overflow sheet — everything that used to clutter the top ─────────────
function OverflowSheet({
  visible, onClose, mode, setMode, onHeatCheck, snapshot, scope,
}: any) {
  const { colors } = useTheme();
  const os = useMemo(() => makeOs(colors), [colors]);
  const meta = snapshot?.horizons_present_json as Record<string, any> | undefined;
  const version = (meta?._engineVersion as string) ?? 'v2.0';
  const rawStats = meta?._dataStats;
  const boxRows = rawStats?.boxRowsUsed ?? 0;
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={os.backdrop} onPress={onClose}>
        <Pressable style={os.sheet} onPress={e => e.stopPropagation()}>
          <View style={os.handle} />
          <View style={os.headerRow}>
            <Text style={os.heading}>More</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          {/* SCRUB-01 (2026-05-27): Engine mode picker removed; production is balanced-only. */}
          <Text style={os.sectionTitle}>Live data</Text>
          <DrawTicker scope={scope} />
          <TouchableOpacity style={os.actionRow} onPress={() => { onClose(); setTimeout(onHeatCheck, 200); }}>
            {/* DESIGN-02 T2: lucide icon instead of 🔍 emoji in this mixed row */}
            <Search size={16} color={colors.text} />
            <Text style={os.actionLabel}>Signal Check any combo</Text>
          </TouchableOpacity>

          <Text style={os.sectionTitle}>Engine</Text>
          <Text style={os.statusLine}>
            {boxRows > 0
              ? `⚡ ZK6 ${version} · ${boxRows} box rows · scope: ${scope}`
              : `🔶 Sample data only — import draws in Results tab`}
          </Text>

          <Text style={os.sectionTitle}>About</Text>
          <Text style={os.disclaimer}>
            HitMaster signals are for analytical research only — not guarantees. Use responsibly.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const makeOs = (colors: ColorTokens) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: theme.borderRadius.sheet, borderTopRightRadius: theme.borderRadius.sheet, padding: 20, paddingBottom: 36, gap: 12, borderTopWidth: 1.5, borderColor: colors.purple + '44' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 18, fontWeight: '900', color: colors.text },
  sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: colors.textTertiary, marginTop: 8, fontFamily: theme.typography.fontFamily.monoBold },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.card },
  modeBtnOn: { borderColor: colors.purple + '88', backgroundColor: colors.purple + '18' },
  modeBtnText: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  modeBtnTextOn: { color: colors.purple },
  modeBtnSub: { fontSize: 9, color: colors.textTertiary + '88', marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  actionLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  statusLine: { fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, lineHeight: 17 },
  disclaimer: { fontSize: 11, color: colors.textTertiary, lineHeight: 18 },
});

// ─── Home Screen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { snapshot, refreshSnapshot, isLoading: snapshotLoading } = useSnapshot();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { scope, setScope: setScopeRaw } = useScope();
  const { enabled: coffeeMode } = useCoffeeMode();
  const setScope = (s: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setScopeRaw(s as any); };
  const { regenerateSlate, checkSlateLock } = useDataIngestion();
  const insets = useSafeAreaInsets();

  // SCRUB-01: mode state kept for downstream signature compat; always 'balanced'.
  const [mode, setMode] = useState<'balanced'>('balanced');
  const [detail, setDetail] = useState<PickItem | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenMsg, setRegenMsg] = useState('');
  const [heatCheckOpen, setHeatCheckOpen] = useState(false);
  const [isRegenLoading, setIsRegenLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dailyStreak, setDailyStreak] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState<{ visible: boolean; isLocked: boolean }>({ visible: false, isLocked: false });
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [trialOfferDismissed, setTrialOfferDismissed] = useState(false);
  const { showToast } = useToast();

  const currentTier = user?.role === 'admin' ? 'PLUS' : user?.role === 'premium' ? 'PRO' : 'FREE';
  const isFree = currentTier === 'FREE';

  // streak + onboarding init (enhancements §3.1: + monthly freeze + milestone toasts)
  useEffect(() => {
    (async () => {
      const today = getTodayET();
      const currentMonth = today.slice(0, 7); // YYYY-MM

      const lastOpenDate = await storage.getItem('last_open_date');
      const streakStr = await storage.getItem('daily_streak');
      const freezeMonthStr = await storage.getItem('streak_freeze_last_grant');
      const freezesAvailStr = await storage.getItem('streak_freezes_available');

      const prevStreak = parseInt(streakStr || '0', 10);
      let freezesAvail = parseInt(freezesAvailStr || '0', 10);

      // Grant 1 freeze at the start of each new month (cap 1 — non-stacking).
      if (freezeMonthStr !== currentMonth) {
        freezesAvail = 1;
        await storage.setItem('streak_freeze_last_grant', currentMonth);
      }

      let newStreak = 1;
      let usedFreeze = false;
      if (lastOpenDate) {
        const diffDays = Math.round(
          (new Date(today + 'T12:00:00').getTime() - new Date(lastOpenDate + 'T12:00:00').getTime()) / 86400000,
        );
        if (diffDays === 0) {
          newStreak = Math.max(prevStreak, 1);
        } else if (diffDays === 1) {
          newStreak = prevStreak + 1;
        } else if (diffDays === 2 && freezesAvail > 0 && prevStreak > 0) {
          // 1 missed day, freeze covers it
          newStreak = prevStreak + 1;
          freezesAvail -= 1;
          usedFreeze = true;
        }
      }

      await storage.setItem('last_open_date', today);
      await storage.setItem('daily_streak', String(newStreak));
      await storage.setItem('streak_freezes_available', String(freezesAvail));
      setDailyStreak(newStreak);

      if (usedFreeze) {
        showToast(`❄️ Streak freeze used — your ${newStreak}-day streak is safe!`, 'success');
      }
      // Milestone celebration toast — only when crossing a milestone today
      const milestoneMsg = STREAK_MILESTONES.find(m => m === newStreak && m > prevStreak);
      if (milestoneMsg) {
        const msg =
          newStreak === 3 ? '🔥 3-day streak! Keep it going.'
          : newStreak === 7 ? '🔥 1 week streak!'
          : newStreak === 14 ? '🔥 2 week streak!'
          : newStreak === 30 ? '🔥 1 month streak — legend.'
          : newStreak === 60 ? '🔥 60-day streak!'
          : newStreak === 90 ? '🔥 90-day streak!'
          : `🔥 ${newStreak}-day streak!`;
        setTimeout(() => showToast(msg, 'success'), usedFreeze ? 1800 : 200);
      }

      const firstOpen = await storage.getItem('first_open_date');
      if (!firstOpen) await storage.setItem('first_open_date', today);
      const onboardingDone = await storage.getItem('onboarding_complete');
      if (!onboardingDone) setShowOnboarding(true);
    })();
  }, [showToast]);

  const nextStreakMilestone = useMemo(
    () => STREAK_MILESTONES.find(m => m > dailyStreak) ?? null,
    [dailyStreak],
  );

  const todayStr = useMemo(() => getTodayET(), []);
  const { data: todayResults } = useQuery<{ result_digits: string; jurisdiction: string; session: string }[]>({
    queryKey: ['today_results', todayStr],
    queryFn: () => fetchFromSupabase({ path: `/rest/v1/histories?date_et=eq.${todayStr}&select=result_digits,jurisdiction,session&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)` }),
    staleTime: 5 * 60 * 1000,
  });

  // 30-day energy series for the EnergySparkline (enhancements §5.5).
  // Pulls per-(date, scope) snapshots for the user's current scope; takes
  // the latest snapshot per date and computes mean K6 energy for that day.
  const energySinceDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);
  const { data: energySnaps = [] } = useQuery<Array<{ slate_date: string; updated_at_et: string; top_k_straights_json: any }>>({
    queryKey: ['energy_sparkline', scope, energySinceDate],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?select=slate_date,updated_at_et,top_k_straights_json&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&mode=eq.balanced&slate_date=gte.${energySinceDate}&top_k_straights_json=not.is.null&order=slate_date.asc,updated_at_et.desc`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 10 * 60 * 1000,
  });
  const energySeries = useMemo(() => {
    // most-recent snapshot wins per slate_date (input is asc by date, desc by updated_at within date)
    const seen = new Set<string>();
    const series: number[] = [];
    for (const snap of energySnaps) {
      if (seen.has(snap.slate_date)) continue;
      seen.add(snap.slate_date);
      const picks = Array.isArray(snap.top_k_straights_json)
        ? snap.top_k_straights_json
        : (typeof snap.top_k_straights_json === 'string' ? (() => { try { return JSON.parse(snap.top_k_straights_json); } catch { return []; } })() : []);
      const energies = picks
        .map((p: any) => Number(p?.energy ?? p?.temperature ?? 0))
        .filter((v: number) => Number.isFinite(v) && v > 0);
      if (energies.length === 0) continue;
      const avg = Math.round(energies.reduce((a: number, b: number) => a + b, 0) / energies.length);
      series.push(avg);
    }
    return series;
  }, [energySnaps]);

  // Track Record band + Hit-rate hero — count today's K6 hits.
  //
  // BUG-140 (2026-05-13): switched from `daily_intelligence?on_slate=eq.true`
  // to `adaptive_tracking`. The prior query gated on `on_slate=true`, which
  // BUG-139's regen flow turns FALSE on combos that hit earlier but were then
  // excluded from the new K6 (today's 916/924 became rank-31/32 "hit orphans"
  // with on_slate=false). Result: Track Record band showed 0 hits even though
  // the engine clearly had 3 box hits earlier in the day.
  //
  // adaptive_tracking is keyed by slate_hash, so hit rows survive regens.
  // De-dupe by combo so multi-state matches (916 hit in WI AND ME,NH,VT)
  // still count as one hit. Scope/session matching: allday matches any
  // session; midday/evening match strictly.
  const { data: todayHits = 0 } = useQuery<number>({
    queryKey: ['track_record_today_hits_adaptive_v4', todayStr],
    queryFn: async () => {
      const rows = await fetchFromSupabase<{
        scope: string | null;
        combo: string | null;
        matched_session: string | null;
        matched_state: string | null;
        hit_box: boolean | null;
        hit_straight: boolean | null;
      }[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=eq.${todayStr}&or=(hit_box.eq.true,hit_straight.eq.true)&mode=eq.balanced&select=scope,combo,matched_session,matched_state,hit_box,hit_straight&limit=200`,
      });
      // BUG-141 (2026-05-13): multi-state matches each count as a hit. Today
      // 916 hit in BOTH WI and ME,NH,VT → 2 distinct hits in the band, not 1.
      // Matches BUG-138's display semantics (2 HitCards stacked on Home) and
      // Slates Hits tab. De-dupe key includes matched_state so 916/WI and
      // 916/ME,NH,VT count separately; only true duplicates (same combo,
      // same scope, same state) collapse.
      const uniqHitKeys = new Set<string>();
      for (const r of rows || []) {
        if (!r.combo) continue;
        const s = (r.scope ?? '').toLowerCase();
        const sess = (r.matched_session ?? '').toLowerCase();
        // allday matches any session; midday/evening match strictly.
        if (s !== 'allday' && sess && s !== sess) continue;
        uniqHitKeys.add(`${s}|${r.combo}|${r.matched_state ?? ''}`);
      }
      return uniqHitKeys.size;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handlePullRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await refreshSnapshot(); } finally { setIsRefreshing(false); }
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
        showToast('✓ Slate regenerated', 'success');
        queryClient.removeQueries({ queryKey: ['snapshot'] });
        await refreshSnapshot();
      } else { setRegenMsg(res.message); setRegenOpen(true); }
    } catch (err) {
      setRegenMsg(`Error: ${err instanceof Error ? err.message : String(err)}`); setRegenOpen(true);
    } finally { setIsRegenLoading(false); }
  }, [regenerateSlate, scope, mode, refreshSnapshot, showToast]);

  const items = useMemo((): PickItem[] => {
    // Always include hit picks — they stay on the slate with a green BOX HIT /
    // STRAIGHT HIT stamp instead of being filtered out. PickCard handles the
    // banner for the list view; the coffee-mode 2×3 grid below renders its own
    // overlay using the same hitType field.
    const list = Array.isArray(snapshot?.top_k_straights_json)
      ? (snapshot!.top_k_straights_json as any[])
      : [];
    if (!Array.isArray(list) || list.length === 0) {
      return Array.from({ length: 6 }).map((_, i) => ({
        rank: i + 1, combo: '•••', comboSet: '{•,•,•}', energy: 0,
        signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 }, locked: isFree && i < 4,
      }));
    }
    return list.slice(0, 6).map((row, idx) => {
      const r = row as any;
      const combo = r.combo ?? '---';
      const energy = typeof r.energy === 'number' ? r.energy : typeof r.temperature === 'number' ? r.temperature : 0;
      const hitType = r.hitType === 'straight' || r.hitType === 'box' ? r.hitType : undefined;
      return {
        rank: idx + 1, combo, comboSet: toComboSet(combo), bestOrder: r.bestOrder, energy,
        signals: { BOX: Number(r.box ?? 0), PBURST: Number(r.pburst ?? 0), CO: Number(r.co ?? 0), DGC: Number(r.signals?.DGC ?? 0) },
        multiplicity: r.multiplicity, topPair: r.topPair, drawsSince: r.drawsSince,
        timesDrawn: r.timesDrawn, lastSeen: r.lastSeen,
        locked: isFree && idx < 4,
        generatedAt: snapshot?.updated_at_et ?? undefined, snapshotScope: snapshot?.scope ?? undefined,
        hitType,
        hitState: r.hitState ?? r.matched_state ?? undefined,
        hitSession: r.hitSession ?? r.matched_session ?? undefined,
        hitResult: r.hitResult ?? r.actual_result ?? undefined,
        hitDate: r.hitDate ?? r.slate_date ?? snapshot?.slate_date ?? undefined,
      };
    });
  }, [snapshot, isFree]);

  // BUG-138 — Home's "TODAY'S HITS" section used to source from
  // useSnapshot().hitPicks (filter of snapshot picks where p.hitType truthy).
  // Same regen-empty anti-pattern as BUG-137: after a mid-day regen the
  // active snapshot's picks exclude already-drawn box-sets, so hitType is
  // never set on the K6 that replaced them, and the section rendered empty
  // even on days with real hits (e.g. 2026-05-13 allday had 916/WI +
  // 916/ME,NH,VT + 924/GA all box-hit but Home showed nothing). Now sources
  // from adaptive_tracking which preserves hits across regens AND stores
  // each multi-state match as its own row → one HitCard per matched_state
  // surfaces multi-state visibly (916 renders twice: once for WI, once for
  // ME,NH,VT).
  const adaptiveScopeFilter = scope === 'allday' ? 'allday' : scope;
  const { data: adaptiveHitRows = [] } = useQuery<any[]>({
    queryKey: ['home_today_hits_adaptive', todayStr, adaptiveScopeFilter],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=eq.${todayStr}&scope=eq.${encodeURIComponent(adaptiveScopeFilter)}&or=(hit_box.eq.true,hit_straight.eq.true)&mode=eq.balanced&select=rank,combo,combo_set,hit_box,hit_straight,matched_state,matched_session,actual_result,energy_score&order=rank.asc.nullslast&limit=50`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 60 * 1000,
  });

  const hitItems = useMemo((): PickItem[] => {
    return adaptiveHitRows.map((row: any, idx) => ({
      rank: row.rank ?? (idx + 1),
      combo: row.combo ?? '---',
      comboSet: row.combo_set ?? toComboSet(row.combo ?? ''),
      energy: Math.round(row.energy_score ?? 0),
      signals: { BOX: 0, PBURST: 0, CO: 0, DGC: 0 },
      locked: false,
      hitType: (row.hit_straight ? 'straight' : 'box') as 'straight' | 'box',
      hitState: row.matched_state ?? undefined,
      hitSession: row.matched_session ?? undefined,
      hitResult: row.actual_result ?? undefined,
      hitDate: todayStr,
    }));
  }, [adaptiveHitRows, todayStr]);

  // §2.4 freshness logic moved to components/FreshnessLine.tsx (design.md step 5).

  const hitBanner = useMemo(() => {
    if (!todayResults || !Array.isArray(todayResults) || todayResults.length === 0) return null;
    for (const result of todayResults) {
      if (!result.result_digits || result.result_digits.length < 3) continue;
      const sessionMatches = scope === 'allday' || result.session === scope;
      if (!sessionMatches) continue;
      const resultSet = toComboSet(result.result_digits);
      for (const pick of items.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••')) {
        if (pick.comboSet === resultSet) {
          return { rank: pick.rank, jurisdiction: result.jurisdiction, session: result.session, digits: result.result_digits, hitType: pick.hitType as 'straight' | 'box' | undefined };
        }
      }
    }
    return null;
  }, [todayResults, items, scope]);

  // Trial extension on hit (enhancements §6.2) — for Free users, detect
  // when one of their visible (unlocked) picks is in today's hit set.
  // High-value moment for the upsell ask: the engine just delivered.
  const visibleHit = useMemo(() => {
    if (!isFree || hitItems.length === 0) return null;
    const visibleCombos = new Set(items.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••').map(p => p.combo));
    const match = hitItems.find(h => visibleCombos.has(h.combo));
    return match ?? null;
  }, [isFree, items, hitItems]);
  useEffect(() => {
    if (!visibleHit) return;
    const key = `trial_offer_dismissed_${todayStr}`;
    storage.getItem(key).then(v => setTrialOfferDismissed(!!v));
  }, [visibleHit, todayStr]);
  const handleDismissTrialOffer = useCallback(() => {
    storage.setItem(`trial_offer_dismissed_${todayStr}`, '1');
    setTrialOfferDismissed(true);
  }, [todayStr]);

  // Win celebration trigger (enhancements §4.1) — fire once per ET day on
  // the first open after a hit lands. Storage key = today's ET date so a
  // hit that arrives later in the day still triggers if the user hasn't
  // opened the app since.
  useEffect(() => {
    if (!hitBanner) return;
    const key = `hit_celebrated_${todayStr}`;
    storage.getItem(key).then(stored => {
      if (stored) return;
      setCelebrationVisible(true);
      storage.setItem(key, '1');
    });
  }, [hitBanner, todayStr]);

  // Loss explanation card (enhancements §1.5) — when today's slate has no
  // K6 hits but draws have happened in the current scope, find the closest
  // K6 pick (2 of 3 digits shared) and surface it. Frames a miss as "we
  // were close" rather than silence after a miss.
  const lossCard = useMemo(() => {
    if (hitItems.length > 0) return null; // we hit — banner takes over
    if (!todayResults || todayResults.length === 0) return null;

    const matchingDraws = todayResults.filter(r =>
      scope === 'allday' || r.session === scope
    );
    if (matchingDraws.length === 0) return null;

    const picks = items.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••');
    let best: { pick: typeof picks[number]; closeCalls: typeof matchingDraws } | null = null;

    for (const p of picks) {
      const pickDigits = new Set(p.combo.split(''));
      const closeCalls = matchingDraws.filter(d => {
        const drawDigits = new Set(d.result_digits.split(''));
        let shared = 0;
        pickDigits.forEach(x => { if (drawDigits.has(x)) shared++; });
        return shared === 2;
      });
      if (closeCalls.length === 0) continue;
      if (!best || closeCalls.length > best.closeCalls.length) {
        best = { pick: p, closeCalls };
      }
    }

    return best;
  }, [hitItems, todayResults, items, scope]);

  // Slate confidence ribbon (enhancements §2.5) — count K6 picks with
  // energy ≥ 70 to set honest expectations on hard days. Counts ALL real
  // picks regardless of lock state so the rating reflects engine output,
  // not what the user can see at their tier.
  const slateConfidence = useMemo(() => {
    const real = items.filter(p => p.combo !== '---' && p.combo !== '•••');
    if (real.length === 0) return null;
    const strong = real.filter(p => p.energy >= 70).length;
    if (strong === real.length) return { label: 'HIGH CONFIDENCE', tier: 'high' as const, color: colors.cyan, sub: undefined as string | undefined };
    if (strong >= 4) return { label: 'MEDIUM CONFIDENCE', tier: 'medium' as const, color: colors.gold, sub: undefined };
    return { label: 'LOW CONFIDENCE', tier: 'low' as const, color: colors.amber, sub: 'Thin slate — heavy cooldown overlap today' };
  }, [items]);

  const avgEnergy = useMemo(() => {
    const unlocked = items.filter(x => !x.locked && x.energy > 0);
    if (!unlocked.length) return 0;
    return Math.round(unlocked.reduce((a, x) => a + x.energy, 0) / unlocked.length);
  }, [items]);

  const hasData = Array.isArray(snapshot?.top_k_straights_json) && (snapshot?.top_k_straights_json?.length ?? 0) > 0;
  const avgColor = energyColor(avgEnergy, colors);
  const nextDrawIn = useDrawCountdown(scope);
  // DESIGN-02 T2 (2.1): hero verified-match count animates 0→n (~600ms
  // ease-out); returns the target immediately under Reduce Motion.
  const todayHitsDisplay = useCountUp(todayHits);

  // ── Coffee mode (enhancements §3.5) — ultra-minimal Home ────────────────
  if (coffeeMode) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <CosmicBackground />
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingHorizontal: theme.layout.screenInset, paddingTop: 12, paddingBottom: 32 }}>
          {/* Scope segmented (shared ScopeSegment — design.md step 1) */}
          <ScopeSegment value={scope as any} onChange={setScope as any} size="tall" style={{ marginBottom: 14 }} />
          {nextDrawIn && (
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 9, fontWeight: '900', color: colors.purple, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold }}>NEXT DRAW</Text>
              <Text style={{ fontSize: 22, fontWeight: '900', color: colors.purple, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 2 }}>{nextDrawIn}</Text>
            </View>
          )}
          {/* 6 K6 tiles — 2×3 grid */}
          {snapshotLoading ? (
            <View style={s.loadingCard}><LoadingPhrase style={s.loadingText} /></View>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {items.map(pick => {
                const tc = energyColor(pick.energy, colors);
                const locked = pick.locked;
                const isHit = !!pick.hitType;
                const isStraightHit = pick.hitType === 'straight';
                const hitLabel = isStraightHit ? 'STRAIGHT MATCH' : 'MATCH';
                // Gold stamp for straight matches, green for box matches.
                const stampC  = isStraightHit ? colors.gold : colors.success;
                const borderC = isHit ? stampC : tc + '55';
                const shadowC = isHit ? stampC : tc;
                return (
                  <TouchableOpacity
                    key={`coffee-${pick.rank}-${pick.combo}`}
                    onPress={() => locked ? router.push('/paywall') : setDetail(pick)}
                    activeOpacity={0.85}
                    style={{ width: '48%', backgroundColor: colors.card, borderRadius: theme.borderRadius.lg, borderWidth: isHit ? 2 : 1.5, borderColor: borderC, padding: 14, alignItems: 'center', shadowColor: shadowC, shadowOpacity: isHit ? 0.8 : 0.35, shadowRadius: isHit ? 14 : 10, shadowOffset: { width: 0, height: 0 }, overflow: 'hidden' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 6 }}>#{pick.rank}</Text>
                    <Text
                      style={{ fontSize: 30, fontWeight: '900', color: locked ? colors.textTertiary : tc, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 4, marginBottom: 6 }}
                      maxFontSizeMultiplier={1.3}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {locked ? '• • •' : (pick.bestOrder ?? pick.combo).split('').join(' ')}
                    </Text>
                    {isHit && !locked && (
                      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 2, borderColor: stampC, backgroundColor: stampC + '22', transform: [{ rotate: '-8deg' }], shadowColor: stampC, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, alignItems: 'center' }}>
                          <Text style={{ fontSize: 18, fontWeight: '900', color: stampC, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.5, textShadowColor: stampC + 'aa', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                            {hitLabel}
                          </Text>
                          {pick.hitResult ? (
                            <Text style={{ fontSize: 10, fontWeight: '900', color: stampC, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1, marginTop: 1 }} numberOfLines={1}>
                              {pick.hitResult}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    )}
                    {!locked ? (
                      <Text style={{ fontSize: 10, fontWeight: '900', color: tc, letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold }}>ENERGY {pick.energy}</Text>
                    ) : (
                      <Text style={{ fontSize: 9, fontWeight: '900', color: colors.gold, letterSpacing: 0.8, fontFamily: theme.typography.fontFamily.monoBold }}>♛ ORACLE+</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
        {/* Modals still available */}
        {detail && (
          <PickDetailModal pick={detail} scope={scope} isPro={currentTier !== 'FREE'}
            onClose={() => setDetail(null)} onHeatCheck={() => { setDetail(null); setHeatCheckOpen(true); }} />
        )}
        <HeatCheckModal visible={heatCheckOpen} onClose={() => setHeatCheckOpen(false)} initialCombo="" scope={scope} />
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <CosmicBackground />
      <ScrollView
        style={s.scroll} contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handlePullRefresh} tintColor={colors.primary} />}
      >
        {/* ── Header (shared ScreenHeader — design.md step 3) ── */}
        <ScreenHeader
          title={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <BrandMark size="sm" />
              <Text style={s.title}>Today's <Text style={{ color: colors.cyan }}>Signals</Text> ⚡</Text>
            </View>
          }
          subtitle={<FreshnessLine snapshot={snapshot} />}
          rightSlot={
            <>
              <View style={[s.tierBadge, { backgroundColor: currentTier === 'FREE' ? colors.free : currentTier === 'PRO' ? colors.premium : colors.admin }]}>
                <Text style={s.tierText}>{currentTier === 'FREE' ? 'Seeker' : currentTier === 'PRO' ? 'Oracle+ ♛' : 'Mystic ♛'}</Text>
              </View>
              {dailyStreak > 0 && (
                <View style={s.streakBadge}>
                  <Text style={s.streakText}>🔥 {dailyStreak}d</Text>
                  {nextStreakMilestone && (
                    <Text style={s.streakNext}>· next {nextStreakMilestone}</Text>
                  )}
                </View>
              )}
              <TouchableOpacity onPress={() => setOverflowOpen(true)} style={s.overflowBtn}>
                <MoreHorizontal size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </>
          }
        >
          <ScopeSegment value={scope as any} onChange={setScope as any} size="compact" />
        </ScreenHeader>

        {/* §4.2 — last-hit pill (suppressed if no hit in last 7 days) */}
        <LastHitPill />

        {/* §3.3 — daily recap card (after 8 PM ET when hits exist) */}
        <DailyRecapCard />

        {/* ── Unified hero: avg energy · hit rate · next draw (enhancements §1.3) ── */}
        <View style={s.heroStat}>
          <View style={s.heroCol}>
            <Text style={[s.heroColNum, { color: avgColor }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{avgEnergy}</Text>
            <Text style={s.heroColLabel}>AVG ENERGY</Text>
            <Text style={s.heroColMeta}>{isFree ? '2 of 6' : '6 signals'}</Text>
            <Text style={[s.heroColMeta, { color: scopeAccent(scope), fontWeight: '700' }]}>{SCOPE_LABELS[scope] ?? scope}</Text>
          </View>
          <View style={s.heroDivider} />
          <View style={s.heroCol}>
            <Text style={[s.heroColNum, { color: colors.cyan }]} maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{todayHitsDisplay}</Text>
            <Text style={s.heroColLabel}>{todayHits === 1 ? 'MATCH TODAY' : 'MATCHES TODAY'}</Text>
            <Text style={s.heroColMeta}>verified vs official draws</Text>
          </View>
          {nextDrawIn ? (
            <>
              <View style={s.heroDivider} />
              <View style={s.countdownBox}>
                <Text style={s.countdownLabel}>NEXT DRAW</Text>
                <Text style={s.countdownTime}>{nextDrawIn}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* ── 30-day energy sparkline (enhancements §5.5) ── */}
        {energySeries.length >= 2 && (
          <EnergySparkline series={energySeries} highlight={avgEnergy} scopeLabel={SCOPE_LABELS[scope] ?? scope} />
        )}

        {/* ── Hit Streak Banner (high-signal, keep above slate) ── */}
        {hitBanner && (
          <View style={s.hitBanner}>
            <Text style={{ fontSize: 22 }}>🔥</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.hitBannerTitle}>ZK6 MATCH TODAY · {hitBanner.digits} in {hitBanner.jurisdiction}</Text>
              <Text style={s.hitBannerSub}>{hitBanner.session === 'midday' ? '☀️ Midday' : '🌙 Evening'} · {hitBanner.hitType === 'straight' ? 'Straight match ✓' : 'Match ✓'}</Text>
            </View>
          </View>
        )}

        {/* ── Loss explanation card (enhancements §1.5) ── */}
        {!hitBanner && lossCard && (
          <View style={s.lossCard}>
            <Text style={s.lossTitle}>Today's slate didn't match — here's what got close.</Text>
            <Text style={s.lossBody}>
              <Text style={s.lossBold}>Signal #{lossCard.pick.rank} ({lossCard.pick.combo})</Text> shared 2 of 3 digits with {lossCard.closeCalls.length} {lossCard.closeCalls.length === 1 ? 'draw' : 'draws'} today: {lossCard.closeCalls.slice(0, 4).map(d => `${d.jurisdiction} ${d.session} (${d.result_digits})`).join(', ')}{lossCard.closeCalls.length > 4 ? '…' : '.'}
            </Text>
            <Text style={s.lossFooter}>Tomorrow's slate will avoid recently-drawn box-sets.</Text>
          </View>
        )}

        {/* ── Today's Hits (shared HitCard — design.md step 4) ── */}
        {hitItems.length > 0 && (
          <View style={s.hitsSectionWrap}>
            <Text style={s.hitsSectionTitle}>🎯 TODAY'S MATCHES</Text>
            {hitItems.map((pick, i) => (
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

        {/* ── Trial offer on visible-pick hit (enhancements §6.2) ── */}
        {visibleHit && !trialOfferDismissed && (
          <TrialOfferBanner
            pickRank={visibleHit.rank}
            pickCombo={visibleHit.combo}
            hitType={visibleHit.hitType}
            onUpgrade={() => router.push('/paywall')}
            onDismiss={handleDismissTrialOffer}
          />
        )}


        {/* ── ZK6 PICKS — THE HERO ── */}
        <View style={s.slateSection}>
          <View style={s.slateSectionHdr}>
            <Text style={s.slateSectionTitle}>ZK6 <Text style={{ color: colors.cyan }}>PICKS</Text></Text>
            {slateConfidence && !snapshotLoading && (
              <View style={[s.confPill, { borderColor: slateConfidence.color + '66', backgroundColor: slateConfidence.color + '14' }]}>
                <Text style={[s.confPillText, { color: slateConfidence.color }]}>{slateConfidence.label}</Text>
              </View>
            )}
            {(!hasData || snapshotLoading) && (
              <TouchableOpacity style={s.generateBtn} onPress={handleRequestRegen} disabled={isRegenLoading}>
                {/* DESIGN-02 T2 (2.7): icon matches the '#fff' label on purple */}
                <RefreshCw size={14} color="#fff" />
                <Text style={s.generateBtnText}>{isRegenLoading ? 'Generating…' : 'Generate'}</Text>
              </TouchableOpacity>
            )}
          </View>
          {slateConfidence?.sub && (
            <Text style={s.confSub}>{slateConfidence.sub}</Text>
          )}

          <RegenConfirmationModal
            visible={regenConfirm.visible} isLocked={regenConfirm.isLocked} scope={scope}
            onClose={() => setRegenConfirm({ visible: false, isLocked: false })} onConfirm={handleGenerate}
          />

          {snapshotLoading ? (
            <View style={s.loadingCard}><LoadingPhrase style={s.loadingText} /></View>
          ) : (() => {
            const locked = items.filter(p => p.locked);
            const unlocked = items.filter(p => !p.locked);
            const handleAdTap = (_rank: number) => {
              showToast('👁 Watch-to-unlock launches soon — upgrade for instant access', 'info');
              router.push('/paywall');
            };
            return (
              <>
                {locked.length > 0 && (
                  <LockedPicksSummary lockedPicks={locked} onUnlock={() => router.push('/paywall')} onWatchAd={handleAdTap} />
                )}
                {unlocked.map(pick => (
                  <PickCard key={`${pick.rank}-${pick.combo}`} pick={pick} onTap={() => setDetail(pick)} onUnlock={() => router.push('/paywall')} />
                ))}
              </>
            );
          })()}

          {isFree && !snapshotLoading && (
            <View style={s.proGate}>
              <Text style={s.proGateLocked}>{items.filter(p => p.locked).length} of 6 signals hidden</Text>
              <Text style={s.proGateTitle}>You saw the free tier</Text>
              <Text style={s.proGateDesc}>Oracle+ unlocks the full K6 slate — plus the optimal straight order and deep analytics.</Text>
              <TouchableOpacity style={s.proGateBtn} onPress={() => router.push('/paywall')}>
                <Text style={s.proGateBtnText}>Upgrade · $9.99/mo ♛</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Budget planner (enhancements §4.5) — converts visible picks into actionable play guidance */}
        {!snapshotLoading && <BudgetPlanner picks={items} scope={scope} />}

        <View style={{ height: 40 }} />
      </ScrollView>

      <OverflowSheet
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        mode={mode} setMode={setMode}
        onHeatCheck={() => setHeatCheckOpen(true)}
        snapshot={snapshot} scope={scope}
      />

      <Modal transparent visible={regenOpen} animationType="fade" onRequestClose={() => setRegenOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Regenerate Slate</Text>
            <Text style={s.modalBody}>{regenMsg}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={() => setRegenOpen(false)}><Text style={s.modalBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {detail && (
        <PickDetailModal pick={detail} scope={scope} isPro={currentTier !== 'FREE'}
          onClose={() => setDetail(null)} onHeatCheck={() => { setDetail(null); setHeatCheckOpen(true); }} />
      )}
      <HeatCheckModal visible={heatCheckOpen} onClose={() => setHeatCheckOpen(false)} initialCombo="" scope={scope} />
      <HeatCheckFAB onPress={() => setHeatCheckOpen(true)} />
      <OnboardingModal
        visible={showOnboarding}
        onDone={() => setShowOnboarding(false)}
        previewPicks={items
          .filter(p => p.combo !== '---' && p.combo !== '•••' && p.energy > 0)
          .slice(-2)
          .map(p => ({ rank: p.rank, combo: p.combo, energy: p.energy }))}
      />
      {hitBanner && (
        <HitCelebrationOverlay
          visible={celebrationVisible}
          onDismiss={() => setCelebrationVisible(false)}
          rank={hitBanner.rank}
          digits={hitBanner.digits}
          jurisdiction={hitBanner.jurisdiction}
          session={hitBanner.session}
          hitType={hitBanner.hitType}
        />
      )}
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  // header layout moved to components/ScreenHeader.tsx (design.md step 3).
  // title/subtitle styles stay here because they're still consumed locally.
  title: { fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 26, fontFamily: theme.typography.fontFamily.bold },
  subtitle: { fontSize: 12, color: colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  tierText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.amber + '18', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.amber + '55' },
  streakText: { fontSize: 10, fontWeight: '800', color: colors.amber, fontFamily: theme.typography.fontFamily.monoBold },
  streakNext: { fontSize: 9, color: colors.amber + 'AA', fontFamily: theme.typography.fontFamily.mono },
  overflowBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },

  // scope tab styles moved to components/ScopeSegment.tsx (design.md step 1)

  heroStat: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: theme.layout.screenInset, marginTop: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.tile, borderWidth: 1, borderColor: colors.border },
  heroCol: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  heroColNum: { fontSize: 22, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, lineHeight: 24, letterSpacing: -0.7 },
  heroColLabel: { fontSize: 8, fontWeight: '900', color: colors.cyan, letterSpacing: 1.4, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 1 },
  heroColMeta: { fontSize: 9, color: colors.textSecondary, marginTop: 0, textAlign: 'center' },
  heroDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 3 },

  countdownBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purple + '18', borderRadius: 7, borderWidth: 1, borderColor: colors.purple + '44', paddingHorizontal: 7, paddingVertical: 3, minWidth: 56 },
  countdownLabel: { fontSize: 7, fontWeight: '900', color: colors.purple, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  countdownTime: { fontSize: 11, fontWeight: '900', color: colors.purple, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 1 },

  hitBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: theme.layout.screenInset, marginTop: 12, backgroundColor: colors.cyan + '18', borderRadius: theme.borderRadius.lg, borderWidth: 1.5, borderColor: colors.cyan + '55', padding: 12 },
  hitBannerTitle: { fontSize: 13, fontWeight: '800', color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold },
  hitBannerSub: { fontSize: 11, color: colors.cyan + 'AA', marginTop: 2 },

  lossCard: { marginHorizontal: theme.layout.screenInset, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.card, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, gap: 6 },
  lossTitle: { fontSize: 13, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  lossBody: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  lossBold: { color: colors.text, fontWeight: '800', fontFamily: theme.typography.fontFamily.monoBold },
  lossFooter: { fontSize: 11, color: colors.textTertiary, marginTop: 2, fontStyle: 'italic' },

  // hits row/badge moved to components/HitCard.tsx + components/HitBadge.tsx (design.md step 4).
  // Section wrapper stays — provides the screen-edge inset + title spacing.
  hitsSectionWrap: { marginHorizontal: theme.layout.screenInset, marginTop: 12, gap: 8 },
  hitsSectionTitle: { fontSize: 10, fontWeight: '900', color: colors.gold, marginBottom: 2, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },

  slateSection: { paddingHorizontal: theme.layout.screenInset, marginTop: 16 },
  slateSectionHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  slateSectionTitle: { fontSize: 12, fontWeight: '900', color: colors.text, letterSpacing: 2, fontFamily: theme.typography.fontFamily.monoBold },
  confPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  confPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold },
  confSub: { fontSize: 11, color: colors.textTertiary, marginTop: -6, marginBottom: 10 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.purple, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  loadingCard: { backgroundColor: colors.card, borderRadius: theme.borderRadius.card, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  loadingText: { fontSize: 13, color: colors.textTertiary },

  proGate: { borderRadius: theme.borderRadius.card, padding: 22, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '66', marginTop: 8, marginBottom: 16, backgroundColor: colors.purple + '12' },
  proGateLocked: { fontSize: 11, fontWeight: '900', color: colors.purple, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  proGateTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6 },
  proGateDesc: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  proGateBtn: { backgroundColor: colors.purple, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 13 },
  proGateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: colors.bgElevated, borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: colors.border, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
  modalBody: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
  modalBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderMed, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { color: colors.text, fontWeight: '600' },
});
