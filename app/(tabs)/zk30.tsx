// app/(tabs)/zk30.tsx
//
// ARCH-06 v1.2 — Data Ring tile + chrome compression.
//
// Compact: 6×5 grid of CompactTile (data-ring layout) — all 30 picks fit
//   on iPhone SE in one screen, ring shows energy, pips show signals.
// List:    full ZK30PickCardRow with horizontal right-side stack.
// Hits:    filtered; empty state has inline "run detection now" trigger.
//
// Header compressed: meta info (version / hash / gen-time) moved into an
// info popover behind ⓘ. Stale-day shown as a chip in the header, not a
// full-width banner.
//
// View-mode preference persisted in AsyncStorage (`zk30-view-mode`).

import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCw, Layers, Grid3x3, List, Sparkles, Info, Play, X, TrendingUp, Share2,
} from 'lucide-react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { withAdminGate } from '@/components/RequireAdmin';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { theme } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { CompactTile } from '@/components/zk30/CompactTile';
import { ZK30PickCardRow } from '@/components/zk30/PickCard';
import { ZK30PickDetailModal } from '@/components/zk30/PickDetailModal';
import { ZK30PickItem, ZK30Snapshot } from '@/components/zk30/types';
import {
  FailedRunsBanner, CronHealthCard, SevenDayChart,
  SessionBreakdown, FireballNaturalSplit,
} from '@/components/zk30/ResultsAnalytics';
import { TexasOutline } from '@/lib/zk30/svg/TexasOutline';
import { getNextDraw, formatTimeUntil } from '@/lib/zk30/txDrawSchedule';
import { ZK30_THEME } from '@/lib/theme/zk30Theme';
import { captureSlate, shareCapturedSlate, copySlateHash } from '@/lib/zk30/shareSlate';
import { HitCelebration, type CelebrationKind } from '@/components/zk30/HitCelebration';

type ViewMode = 'compact' | 'list' | 'hits' | 'results';
const PRIMARY_MODES: readonly ViewMode[] = ['compact', 'list', 'hits'] as const;
const VIEW_MODE_KEY = 'zk30-view-mode';

// ─── Data fetch (strict per-date — stepper drives selection) ───────────────

async function fetchSnapshotForDate(date: string): Promise<ZK30Snapshot | null> {
  const rows = await fetchFromSupabase<ZK30Snapshot[]>({
    path: `/rest/v1/slate_snapshots_zk30?slate_date=eq.${date}` +
          `&deleted_at=is.null&order=updated_at_et.desc&limit=1&select=*`,
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// 30-day calendar of dates with at least one slate. Backs the date-picker
// modal's availability dots — greys out days operator can't navigate to.
async function fetchAvailableDates(): Promise<Set<string>> {
  const today = getTodayET();
  const start = new Date(today + 'T00:00:00');
  start.setDate(start.getDate() - 30);
  const startStr = start.toLocaleDateString('en-CA');
  const rows = await fetchFromSupabase<Array<{ slate_date: string }>>({
    path: `/rest/v1/slate_snapshots_zk30?slate_date=gte.${startStr}` +
          `&deleted_at=is.null&select=slate_date&limit=1000`,
  });
  const set = new Set<string>();
  if (Array.isArray(rows)) for (const r of rows) if (r.slate_date) set.add(r.slate_date);
  return set;
}

// Phase B2 — 7-day performance numbers for the header ribbon. NATURAL ONLY
// per ARCH-08; fireball hits are intentionally excluded so the headline
// metric isn't inflated for non-TX-Pick3 users.
async function fetchPerformanceStats(): Promise<{
  matches7d: number;
  picks7d: number;
  hitRatePct: number;
  streakDays: number;
}> {
  const today = getTodayET();
  const start7 = addDaysET(today, -6); // inclusive 7-day window
  const start30 = addDaysET(today, -29); // streak walk needs more history

  const [hits, picks] = await Promise.all([
    // All natural-hit AT rows in the last 30 days — needed for both 7d hit
    // rate AND the up-to-30-day streak walk.
    fetchFromSupabase<Array<{ slate_date: string; combo: string }>>({
      path: `/rest/v1/adaptive_tracking_zk30` +
            `?slate_date=gte.${start30}` +
            `&or=(hit_straight.eq.true,hit_box.eq.true)` +
            `&select=slate_date,combo&limit=1000`,
    }),
    fetchFromSupabase<Array<{ slate_date: string }>>({
      path: `/rest/v1/daily_intelligence_zk30` +
            `?slate_date=gte.${start7}&select=slate_date&limit=1000`,
    }),
  ]);

  // matches_7d = distinct (slate_date, combo) tuples with natural hit in the
  // last 7 days. Dedup at this granularity because a single pick can match
  // multiple sessions per day; we only want one credit per pick per day.
  const hitsArr = Array.isArray(hits) ? hits : [];
  const picksArr = Array.isArray(picks) ? picks : [];
  const sevenDayKeys = new Set<string>();
  for (const h of hitsArr) {
    if (h.slate_date >= start7) sevenDayKeys.add(`${h.slate_date}|${h.combo}`);
  }
  const matches7d = sevenDayKeys.size;
  const picks7d = picksArr.length;
  const hitRatePct = picks7d > 0 ? Math.round((matches7d / picks7d) * 1000) / 10 : 0;

  // Streak — walk back from today through consecutive days that had ≥1
  // natural hit. Sundays don't break the streak because TX skips them
  // (treat absence-of-draws as continuation).
  const datesWithHits = new Set(hitsArr.map(h => h.slate_date));
  let streakDays = 0;
  let cursor = today;
  for (let i = 0; i < 30; i++) {
    if (datesWithHits.has(cursor)) streakDays++;
    else {
      const isSunday = new Date(cursor + 'T12:00:00Z').getUTCDay() === 0;
      if (!isSunday) break;
    }
    cursor = addDaysET(cursor, -1);
  }

  return { matches7d, picks7d, hitRatePct, streakDays };
}

// Last edge-zk30 hit-detection run — backs the "Last run" caption beneath the
// trigger button. Filtered by run_source so we don't pick up ZK6 runs.
async function fetchLastDetectionRun(): Promise<{
  run_at: string; hits_found: number; date: string;
} | null> {
  const rows = await fetchFromSupabase<Array<{ run_at: string; hits_found: number; date: string }>>({
    path: `/rest/v1/hit_detection_runs?run_source=eq.edge-zk30` +
          `&order=run_at.desc&limit=1&select=run_at,hits_found,date`,
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function addDaysET(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Short weekday + 24h time for the slate-hash chip (e.g. "Mon 09:00 ET"). */
function formatGenShort(updatedAtEt: string | null | undefined): string {
  if (!updatedAtEt) return '—';
  const d = new Date(updatedAtEt);
  const wkday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/New_York' });
  // 12hr with AM/PM per operator convention — "Mon 8:14 PM ET" reads
  // naturally; the 24hr "Mon 20:14 ET" was an internal-math artifact
  // that leaked into a display string.
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
  });
  return `${wkday} ${time} ET`;
}

/** Countdown subtitle text. Returns either the time-until-next-09:00-ET or a
 *  "last updated Xh ago" string when today's slate has already dropped. */
function buildCountdownText(snapshotUpdatedAt: string | null): string {
  // 09:00 ET cutoff anchored via America/New_York so DST doesn't shift it.
  const nowEt = new Date();
  const etHourNow = parseInt(nowEt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  const etMinNow = parseInt(nowEt.toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }), 10);
  const minsSinceMidnight = etHourNow * 60 + etMinNow;
  const cutoff = 9 * 60;
  if (minsSinceMidnight < cutoff) {
    const left = cutoff - minsSinceMidnight;
    const h = Math.floor(left / 60);
    const m = left % 60;
    return `Next slate: ${h}h ${m}m`;
  }
  if (snapshotUpdatedAt) {
    const ageMs = Date.now() - new Date(snapshotUpdatedAt).getTime();
    const ageHr = Math.max(0, Math.round(ageMs / 3_600_000));
    return ageHr <= 0 ? 'Slate ready · just updated' : `Slate ready · last updated ${ageHr}h ago`;
  }
  return 'Slate ready';
}

function parsePicks(raw: ZK30PickItem[] | string | null | undefined): ZK30PickItem[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ─── Screen ────────────────────────────────────────────────────────────────

// BRAND-06: operator instrumentation — route-gated like the other operator
// screens (the tab-bar entry is also admin-only in _layout.tsx, but the route
// itself was reachable by direct URL/deep link without this).
function ZK30Screen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const s = useMemo(() => makeS(colors), [colors]);

  // Blue is the ZK30 brand accent — swap for ZK6's purple.
  const brandBlue = colors.dataBlue;

  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [detail, setDetail] = useState<ZK30PickItem | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [hitTriggerBusy, setHitTriggerBusy] = useState(false);
  const [hitTriggerStatus, setHitTriggerStatus] = useState<string>('');

  // selectedDate drives every query in this screen. Default = today (ET).
  // Stepper, picker modal, and Today pill all flow through this.
  const today = getTodayET();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const isToday = selectedDate === today;

  // 1-minute clock tick — drives the "Next slate" countdown.
  const [tickKey, setTickKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickKey(k => (k + 1) % 1000), 60_000);
    return () => clearInterval(id);
  }, []);

  // 5s debounce ref for the hit-detection trigger button.
  const lastTriggerRef = useRef<number>(0);

  // Phase C3 — Share Slate flow. The slate capture region wraps the
  // masthead + hash chip + draw chip + perf band + tab row + body content
  // via captureRootRef; pressing the Share button opens the action sheet
  // and each option flips captureOverlay to render the right pre-capture
  // chrome (watermark only / watermark + redaction layer) before snap.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [captureOverlay, setCaptureOverlay] = useState<'none' | 'pro' | 'redacted'>('none');
  const captureRootRef = useRef<View | null>(null);

  // Load persisted view mode on mount.
  useEffect(() => {
    storage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === 'compact' || v === 'list' || v === 'hits' || v === 'results') {
        setViewMode(v as ViewMode);
      }
    });
  }, []);
  const changeViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    storage.setItem(VIEW_MODE_KEY, m).catch(() => {});
  }, []);

  const { data: snapshot, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['zk30-snapshot', selectedDate],
    queryFn: () => fetchSnapshotForDate(selectedDate),
    staleTime: 5 * 60 * 1000,
  });

  // Set of dates with at least one slate in the past 30 days. Backs the
  // date-picker availability dots + the "→" disabled state.
  const { data: availableDates } = useQuery({
    queryKey: ['zk30-available-dates'],
    queryFn: fetchAvailableDates,
    staleTime: 5 * 60 * 1000,
  });

  // Last run of run-hit-detection-zk30 — drives the "Last run: …" caption.
  const { data: lastDetectionRun } = useQuery({
    queryKey: ['zk30-last-detection-run', tickKey],
    queryFn: fetchLastDetectionRun,
    staleTime: 30 * 1000,
  });

  // Phase B2 — header performance ribbon. 5min stale time matches the
  // typical operator review cadence; manual refresh via the screen's
  // refresh button invalidates this implicitly.
  const { data: perfStats } = useQuery({
    queryKey: ['zk30-perf-stats-7d'],
    queryFn: fetchPerformanceStats,
    staleTime: 5 * 60 * 1000,
  });

  // Refetch on focus so post-09:00-ET drop appears when operator returns.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['zk30-snapshot', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['zk30-available-dates'] });
    }, [queryClient, selectedDate]),
  );

  // Stepper helpers. Step forward is disabled when no later slate exists.
  const stepBack    = useCallback(() => setSelectedDate(d => addDaysET(d, -1)), []);
  const stepForward = useCallback(() => setSelectedDate(d => addDaysET(d, +1)), []);
  const jumpToToday = useCallback(() => setSelectedDate(today), [today]);
  const canStepForward = useMemo(() => {
    if (isToday) return false;
    if (!availableDates) return true;
    // Allow forward step to any later date that exists.
    const next = addDaysET(selectedDate, +1);
    return availableDates.has(next) || next === today;
  }, [availableDates, selectedDate, isToday, today]);

  // Inline hit-detection trigger. 5-second debounce so a double-tap can't
  // queue a second invocation (each run is ~20s; queueing wastes budget and
  // confuses the busy state). Runs against `selectedDate` so the operator
  // can re-detect a past date from the stepper without leaving the screen.
  const triggerHitDetection = useCallback(async () => {
    const now = Date.now();
    if (now - lastTriggerRef.current < 5_000) {
      setHitTriggerStatus('⏳ wait a moment…');
      return;
    }
    lastTriggerRef.current = now;
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setHitTriggerStatus('✗ config missing'); return; }
    setHitTriggerBusy(true);
    setHitTriggerStatus('Detecting…');
    try {
      const res = await fetch(`${url}/functions/v1/run-hit-detection-zk30`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: selectedDate }),
      });
      const text = await res.text();
      if (!res.ok) {
        setHitTriggerStatus(`✗ ${res.status}`);
      } else {
        try {
          const json = JSON.parse(text);
          const hits = typeof json?.hitsFound === 'number' ? json.hitsFound : 0;
          setHitTriggerStatus(`✓ Hit detection complete · ${hits} hit${hits !== 1 ? 's' : ''}`);
          queryClient.invalidateQueries({ queryKey: ['zk30-snapshot', selectedDate] });
          queryClient.invalidateQueries({ queryKey: ['zk30-last-detection-run'] });
          queryClient.invalidateQueries({ queryKey: ['zk30-hits-history'] });
        } catch {
          setHitTriggerStatus('✓ Hit detection complete');
        }
      }
    } catch (e) {
      setHitTriggerStatus(`✗ ${String(e instanceof Error ? e.message : e).slice(0, 40)}`);
    } finally {
      setHitTriggerBusy(false);
    }
  }, [queryClient, selectedDate]);

  // Phase C3 — Share handlers. Pro flow: set overlay → wait 1 frame →
  // capture → share → reset. Redacted: same but overlay='redacted' so the
  // CTA scrim and ?-?-? mask are visible in the capture. Hash: direct
  // clipboard write, no capture.
  const handleShare = useCallback(async (mode: 'pro' | 'redacted') => {
    if (shareBusy || !captureRootRef.current) return;
    setShareOpen(false);
    setShareBusy(true);
    setCaptureOverlay(mode);
    try {
      // One animation frame to let the overlay render before we snap. RN
      // doesn't expose requestAnimationFrame on every platform cleanly,
      // so a short setTimeout is the portable equivalent.
      await new Promise<void>(resolve => setTimeout(resolve, 80));
      // hash8 is derived later in the render path; pull the first 8 chars
      // directly from the snapshot for the filename so the callback doesn't
      // forward-reference a render-cycle binding.
      const hashHead = (snapshot?.snapshot_hash ?? '').slice(0, 8).toLowerCase() || 'na';
      const uri = await captureSlate({
        viewRef: captureRootRef,
        fileName: `zk30-${selectedDate}-${mode}-${hashHead}`,
      });
      await shareCapturedSlate(uri);
    } catch (e) {
      console.warn('[zk30 share] capture failed:', String(e));
    } finally {
      setCaptureOverlay('none');
      setShareBusy(false);
    }
  }, [shareBusy, selectedDate, snapshot]);

  const handleCopyHash = useCallback(async () => {
    setShareOpen(false);
    const full = snapshot?.snapshot_hash ?? '';
    if (!full) return;
    await copySlateHash(full);
    setHitTriggerStatus(`✓ Hash copied · ${full.slice(0, 8)}…`);
  }, [snapshot]);

  // Format last-run for the caption under the trigger button. "Last run: 7:42 PM
  // ET · 1 hit found" per spec; pivots gracefully when the table is empty.
  const lastRunCaption = useMemo(() => {
    if (!lastDetectionRun) return '';
    const t = new Date(lastDetectionRun.run_at).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });
    const n = lastDetectionRun.hits_found ?? 0;
    return `Last run: ${t} ET · ${n} hit${n !== 1 ? 's' : ''} found`;
  }, [lastDetectionRun]);

  const allPicks = parsePicks(snapshot?.top_k_straights_json).slice(0, 30);
  // ARCH-08: HITS badge counts NATURAL hits only. Fireball hits are
  // secondary — see fireballHitPicks for the parenthetical callout.
  const hitPicks = allPicks.filter((p) => !!p.hitType);
  const fireballHitPicks = allPicks.filter((p) => !!p.fireballHitType);

  // Phase D1 — slate drop reveal. Stagger-fade rows on FIRST mount per
  // slate hash; subsequent re-renders (refetch, date stepper navigation
  // back-and-forth) render instantly. Track seen hashes in a ref so the
  // set survives re-renders without triggering them.
  const seenSlateHashesRef = useRef<Set<string>>(new Set());
  const currentSlateKey = `${selectedDate}|${snapshot?.snapshot_hash ?? ''}`;
  const isFirstReveal = useMemo(() => {
    if (!snapshot || !snapshot.snapshot_hash) return false;
    return !seenSlateHashesRef.current.has(currentSlateKey);
  }, [snapshot, currentSlateKey]);
  // Mark as seen post-render so the reveal fires once per session per slate.
  useEffect(() => {
    if (isFirstReveal) seenSlateHashesRef.current.add(currentSlateKey);
  }, [isFirstReveal, currentSlateKey]);

  // Phase D2 — hit celebration. Track prev → curr transitions in the two
  // hit-count channels. When N → N+1 fires, mount HitCelebration with the
  // newly-matched pick. Fireball-only N+1 uses the 'fireball' (quieter)
  // variant per ARCH-08; natural N+1 uses confetti.
  const prevHitsRef = useRef<{ nat: number; fb: number }>({ nat: 0, fb: 0 });
  const [celebration, setCelebration] = useState<{
    kind: CelebrationKind; combo: string;
  } | null>(null);
  useEffect(() => {
    const prev = prevHitsRef.current;
    const natUp = hitPicks.length > prev.nat;
    const fbUp = fireballHitPicks.length > prev.fb;
    if (natUp) {
      // Natural newcomer is the one in hitPicks not previously counted —
      // use the last pick (most recently appended) as the matched one.
      const winner = hitPicks[hitPicks.length - 1];
      const kind: CelebrationKind = winner?.hitType === 'straight' ? 'natural-straight' : 'natural-box';
      setCelebration({ kind, combo: winner?.bestOrder ?? winner?.combo ?? '???' });
    } else if (fbUp) {
      const winner = fireballHitPicks[fireballHitPicks.length - 1];
      setCelebration({ kind: 'fireball', combo: winner?.bestOrder ?? winner?.combo ?? '???' });
    }
    prevHitsRef.current = { nat: hitPicks.length, fb: fireballHitPicks.length };
  }, [hitPicks.length, fireballHitPicks.length, hitPicks, fireballHitPicks]);

  // Filter by view mode for body. List and compact still show all 30; Hits
  // tab is governed entirely by HitsTimelineView (historical query, not
  // snapshot filter).
  const visiblePicks = allPicks;

  // ─── Header subline metadata ─────────────────────────────────────────────
  const slateDateLabel = formatDateLong(selectedDate);
  const hash8 = (snapshot?.snapshot_hash ?? '').slice(0, 8);
  // Countdown subtitle — hidden on past-date views (irrelevant context). The
  // tickKey dependency triggers re-render every 60s so the string stays fresh.
  const countdownText = useMemo(
    () => (isToday ? buildCountdownText(snapshot?.updated_at_et ?? null) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isToday, snapshot?.updated_at_et, tickKey],
  );

  // Phase B4 — next-TX-draw countdown chip text. tickKey rebinds every 60s
  // so the chip stays fresh; hidden on past-date views.
  const nextDrawText = useMemo(() => {
    if (!isToday) return '';
    const n = getNextDraw();
    if (!n) return '';
    return `⏱  Next TX draw in ${formatTimeUntil(n)}  ·  ${n.session.toUpperCase()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, tickKey]);
  const engineV = snapshot?.engine_version ?? '—';
  // Display format: "May 25, 2026 9:00 PM ET" — date + 12hr time, both in ET.
  const genTime = snapshot?.updated_at_et
    ? (() => {
        const d = new Date(snapshot.updated_at_et);
        const date = d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          timeZone: 'America/New_York',
        });
        const time = d.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: 'America/New_York',
        });
        return `${date} ${time} ET`;
      })()
    : '—';

  return (
    <View ref={captureRootRef} collapsable={false} style={[s.container, { paddingTop: insets.top }]}>
      {/* Header — back + brand + stepper + countdown + info/refresh */}
      {/* Hero masthead (Phase A1). 3 stacked lines:
              1. "ZK30 · SINGLE-STATE MODE" — small caps brand kicker
              2. "⭐ TEXAS" — large jurisdiction focal point (swap glyph + name
                 per state when expanding to SC/OH/NJ/NY/FL in v2.0)
              3. ← date · scope · sessions → — date stepper row
          Back + info + refresh icons preserved on left/right. */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={[s.mastheadKicker, { color: brandBlue }]}>
            ZK30  ·  SINGLE-STATE MODE
          </Text>

          <View style={s.mastheadTitleRow}>
            <Text style={s.mastheadTitle}>
              <Text style={{ color: ZK30_THEME.accentTX }}>⭐</Text>  TEXAS
            </Text>
            {!isToday && (
              <TouchableOpacity
                onPress={jumpToToday}
                style={[s.todayPill, { backgroundColor: brandBlue + '20', borderColor: brandBlue + '88' }]}
                accessibilityLabel="Jump to today"
                accessibilityRole="button"
              >
                <Text style={[s.todayPillText, { color: brandBlue }]}>TODAY</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Subline + date stepper — ← date · ALL-DAY · 4 SESSIONS → */}
          <View style={s.stepperRow}>
            <TouchableOpacity onPress={stepBack} hitSlop={8} accessibilityLabel="Previous day">
              <ChevronLeft size={14} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDatePickerOpen(true)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Pick date"
              style={s.stepperDateBtn}
            >
              <Calendar size={11} color={colors.textTertiary} />
              <Text style={s.stepperDate} numberOfLines={1}>
                {slateDateLabel}
                <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>
                  {'  ·  ALL-DAY  ·  4 SESSIONS (M/D/E/N)'}
                </Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={stepForward}
              hitSlop={8}
              disabled={!canStepForward}
              accessibilityLabel="Next day"
              accessibilityState={{ disabled: !canStepForward }}
            >
              <ChevronRight size={14} color={canStepForward ? colors.textSecondary : colors.border} />
            </TouchableOpacity>
          </View>

          {countdownText !== '' && (
            <Text style={[s.countdown, { color: colors.textTertiary }]}>{countdownText}</Text>
          )}
        </View>

        <TouchableOpacity onPress={() => setInfoOpen(true)} style={s.iconBtn} accessibilityLabel="Slate info">
          <Info size={17} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShareOpen(true)}
          style={s.iconBtn}
          accessibilityLabel="Share slate"
          accessibilityRole="button"
        >
          {shareBusy
            ? <ActivityIndicator size="small" color={brandBlue} />
            : <Share2 size={17} color={colors.textSecondary} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => refetch()} style={s.iconBtn} accessibilityLabel="Refresh">
          {isRefetching
            ? <ActivityIndicator size="small" color={brandBlue} />
            : <RefreshCw size={17} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      {/* Slate hash chip (Phase A3) — sits below the masthead, above the
          tab row. Tap opens the same metadata modal the (i) icon does so
          operators can drill into the slate without hunting for the icon. */}
      <TouchableOpacity
        onPress={() => setInfoOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open slate metadata"
        style={s.hashChipWrap}
        hitSlop={6}
      >
        <Text style={s.hashChip}>
          slate  ·  {hash8 || '——'}  ·  gen {formatGenShort(snapshot?.updated_at_et)}
        </Text>
      </TouchableOpacity>

      {/* Phase B4 — next-draw countdown chip. Hidden on past-date views so
          operators reviewing history don't see a misleading "next draw"
          label that doesn't apply to the displayed slate. */}
      {isToday && nextDrawText !== '' && (
        <View style={s.drawChipRow}>
          <Text style={s.drawChip}>{nextDrawText}</Text>
        </View>
      )}

      {/* Phase B2 — 7-day performance band. Three segments separated by
          vertical dividers. Natural-only per ARCH-08. */}
      {perfStats && (
        <View style={[s.perfBand, { borderColor: colors.border }]}>
          <View style={s.perfSeg}>
            <Text style={[s.perfLabel, { color: colors.textTertiary }]}>7-DAY HIT RATE</Text>
            <Text style={[s.perfNum, { color: colors.text }]}>
              {perfStats.hitRatePct.toFixed(1)}<Text style={{ fontSize: 11 }}>%</Text>
            </Text>
          </View>
          <View style={[s.perfDivider, { backgroundColor: colors.border }]} />
          <View style={s.perfSeg}>
            <Text style={[s.perfLabel, { color: colors.textTertiary }]}>MATCHES</Text>
            <Text style={[s.perfNum, { color: colors.text }]}>{perfStats.matches7d}</Text>
          </View>
          <View style={[s.perfDivider, { backgroundColor: colors.border }]} />
          <View style={s.perfSeg}>
            <Text style={[s.perfLabel, { color: colors.textTertiary }]}>STREAK</Text>
            <Text style={[
              s.perfNum,
              { color: perfStats.streakDays > 0 ? colors.success : colors.textTertiary },
            ]}>
              {perfStats.streakDays > 0
                ? <>ON <Text style={{ fontSize: 11 }}>{perfStats.streakDays}d</Text></>
                : <>0</>}
            </Text>
          </View>
        </View>
      )}

      {/* Primary view-mode chips — data shapes */}
      <View style={s.modeRow}>
        <ModeChip
          active={viewMode === 'compact'}
          onPress={() => changeViewMode('compact')}
          Icon={Grid3x3}
          label="COMPACT"
          count={allPicks.length}
          colors={colors}
          brand={brandBlue}
        />
        <ModeChip
          active={viewMode === 'list'}
          onPress={() => changeViewMode('list')}
          Icon={List}
          label="LIST"
          count={allPicks.length}
          colors={colors}
          brand={brandBlue}
        />
        <ModeChip
          active={viewMode === 'hits'}
          onPress={() => changeViewMode('hits')}
          Icon={Sparkles}
          label="HITS"
          count={hitPicks.length}
          colors={colors}
          brand={brandBlue}
          highlight={hitPicks.length > 0}
        />
      </View>

      {/* Secondary chips — sections (compact: smaller chip height to save vertical) */}
      <View style={s.modeRowSecondary}>
        <ModeChip
          active={viewMode === 'results'}
          onPress={() => changeViewMode('results')}
          Icon={TrendingUp}
          label="RESULTS"
          colors={colors}
          brand={brandBlue}
          compact
        />
      </View>

      {/* Body */}
      {isPending ? (
        <View style={s.center}>
          <ActivityIndicator color={brandBlue} size="large" />
          <Text style={[s.loadingText, { color: brandBlue }]}>Loading today&apos;s slate…</Text>
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={[s.errorText, { color: colors.error }]}>Failed to load slate</Text>
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: brandBlue }]} onPress={() => refetch()}>
            <Text style={s.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !snapshot ? (
        <View style={s.center}>
          <EmptyState
            icon={Layers}
            title={isToday ? 'No slate yet' : 'No slate for this date'}
            message={
              isToday
                ? 'Next drop: 09:00 ET (Mon–Sat). Regenerate manually from Admin.'
                : 'No snapshot was generated for ' + slateDateLabel + '. Step back to a covered day or generate from Admin.'
            }
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!isToday && (
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: brandBlue }]}
                onPress={stepBack}
              >
                <Text style={[s.secondaryBtnText, { color: brandBlue }]}>← Previous day</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: brandBlue }]}
              onPress={() => router.push('/(tabs)/admin')}
            >
              <Text style={s.primaryBtnText}>Open Admin</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : viewMode === 'hits' ? (
        <HitsTimelineView
          colors={colors}
          brand={brandBlue}
          today={today}
          onTriggerDetection={triggerHitDetection}
          triggerBusy={hitTriggerBusy}
          triggerStatus={hitTriggerStatus}
        />
      ) : viewMode === 'results' ? (
        <ResultsPlaceholder
          colors={colors}
          brand={brandBlue}
          hitsToday={hitPicks.length}
          fireballHitsToday={fireballHitPicks.length}
          slateDate={slateDateLabel}
          onTriggerDetection={triggerHitDetection}
          triggerBusy={hitTriggerBusy}
          triggerStatus={hitTriggerStatus}
          lastRunCaption={lastRunCaption}
        />
      ) : viewMode === 'compact' ? (
        // No ScrollView in compact mode — pure flexbox so the 5×6 grid claims
        // all available vertical space. Tiles get flex:1 per row + row gets
        // flex:1 per column = equal-share auto-sizing tiles.
        // Phase D3 — keyed on selectedDate so reanimated cross-dissolves
        // (200ms exit + 200ms enter) between slates when the stepper moves.
        <Animated.View
          key={`compact-${selectedDate}`}
          style={s.gridContainer}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          {/* TX watermark (Phase A2) — sits behind the grid at 6% opacity.
              pointerEvents=none so tile taps still register. Compact-only;
              the LIST view gets its own watermark inside the ScrollView. */}
          <View style={s.watermarkLayer} pointerEvents="none">
            <TexasOutline size={260} color={brandBlue} opacity={0.06} />
          </View>
          <View style={s.gridArea}>
            {Array.from({ length: Math.ceil(visiblePicks.length / 5) }).map((_, rowIdx) => (
              <View key={rowIdx} style={s.gridRowFlex}>
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).map((p) => (
                  // Phase D1 — stagger fade-in per row when this slate hash
                  // hasn't been seen yet. delay = rowIdx × 100ms.
                  <Animated.View
                    key={`tile-${p.rank}`}
                    style={{ flex: 1 }}
                    entering={isFirstReveal ? FadeIn.delay(rowIdx * 100).duration(250) : undefined}
                  >
                    <CompactTile
                      pick={p}
                      brandBlue={brandBlue}
                      onPress={() => setDetail(p)}
                    />
                  </Animated.View>
                ))}
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length < 5 &&
                  Array.from({
                    length: 5 - visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length,
                  }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
              </View>
            ))}
          </View>
        </Animated.View>
      ) : (
        // List + Hits: ScrollView (rows always scroll regardless of count).
        // Watermark only on LIST per Phase A2 (HITS view has its own dense
        // content that would compete with a behind-layer silhouette).
        // Phase D3 — date-keyed cross-dissolve, same as compact above.
        <Animated.View
          key={`list-${selectedDate}-${viewMode}`}
          style={{ flex: 1, position: 'relative' }}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          {viewMode === 'list' && (
            <View style={s.watermarkLayer} pointerEvents="none">
              <TexasOutline size={280} color={brandBlue} opacity={0.06} />
            </View>
          )}
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
          >
            {visiblePicks.map((p, idx) => {
              // Same stagger pattern as compact — list shows 1 pick per row
              // so the delay is per-pick / 5 to mirror the compact cadence.
              const delay = Math.floor(idx / 5) * 100;
              return (
                <Animated.View
                  key={`row-${p.rank}`}
                  entering={isFirstReveal ? FadeIn.delay(delay).duration(250) : undefined}
                >
                  <ZK30PickCardRow
                    pick={p}
                    brandBlue={brandBlue}
                    onPress={() => setDetail(p)}
                  />
                </Animated.View>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* Detail modal — slateDate passed so the fireball detail lookup
          against adaptive_tracking_zk30 can scope to the right day. */}
      <ZK30PickDetailModal
        pick={detail}
        brandBlue={brandBlue}
        slateDate={selectedDate}
        onClose={() => setDetail(null)}
      />

      {/* Date picker modal — last 30 days, availability dots, tap to jump. */}
      <ZK30DatePickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        onPick={(d) => { setSelectedDate(d); setDatePickerOpen(false); }}
        selected={selectedDate}
        today={today}
        availableDates={availableDates ?? new Set()}
        brandBlue={brandBlue}
        colors={colors}
      />

      {/* Phase C3 — Share Slate action sheet. 3 options: Pro PNG, Redacted
          PNG (with funnel CTA overlay), Copy slate hash. Wired through the
          share/clipboard helpers in lib/zk30/shareSlate.ts. */}
      <Modal transparent animationType="fade" visible={shareOpen} onRequestClose={() => setShareOpen(false)}>
        <TouchableOpacity style={s.popBackdrop} activeOpacity={1} onPress={() => setShareOpen(false)}>
          <View style={[s.popCard, { borderColor: brandBlue + '55', minWidth: 280 }]}>
            <View style={s.popHeader}>
              <Text style={[s.popTitle, { color: brandBlue }]}>SHARE SLATE</Text>
              <TouchableOpacity onPress={() => setShareOpen(false)} style={s.popClose}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ShareSheetRow
              colors={colors}
              brand={brandBlue}
              title="Share Pro version"
              sub="Full slate as PNG with watermark"
              onPress={() => handleShare('pro')}
            />
            <ShareSheetRow
              colors={colors}
              brand={brandBlue}
              title="Share Redacted version"
              sub="Picks obscured + funnel CTA — for public posts"
              onPress={() => handleShare('redacted')}
            />
            <ShareSheetRow
              colors={colors}
              brand={brandBlue}
              title="Copy slate hash"
              sub={(snapshot?.snapshot_hash ?? '——').slice(0, 16)}
              onPress={handleCopyHash}
              mono
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Phase D2 — hit celebration overlay. Auto-dismisses after 4s via
          the component's internal timer; parent only manages the mount. */}
      {celebration && (
        <HitCelebration
          kind={celebration.kind}
          combo={celebration.combo}
          onDismiss={() => setCelebration(null)}
        />
      )}

      {/* Capture-mode overlays. Rendered INSIDE captureRootRef so they
          appear in the snapshot but stay absent from the normal UI. */}
      {captureOverlay !== 'none' && (
        <View style={s.captureWatermark} pointerEvents="none">
          <Text style={s.captureWatermarkText}>
            HITMASTER  ·  ZK30  ·  #{hash8 || '——'}  ·  {selectedDate}
          </Text>
        </View>
      )}
      {captureOverlay === 'redacted' && (
        <View style={s.redactionScrim} pointerEvents="none">
          <View style={s.redactionPanel}>
            <Text style={s.redactionHeadline}>FULL PICKS IN PRO GROUP</Text>
            <Text style={s.redactionCta}>JOIN FREE — link in bio</Text>
          </View>
        </View>
      )}

      {/* Info popover — replaces the always-visible meta strip */}
      <Modal transparent animationType="fade" visible={infoOpen} onRequestClose={() => setInfoOpen(false)}>
        <TouchableOpacity style={s.popBackdrop} activeOpacity={1} onPress={() => setInfoOpen(false)}>
          <View style={[s.popCard, { borderColor: brandBlue + '55' }]}>
            <View style={s.popHeader}>
              <Text style={[s.popTitle, { color: brandBlue }]}>SLATE METADATA</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)} style={s.popClose}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <PopKV label="Jurisdiction"   value="TX" colors={colors} />
            <PopKV label="Scope"          value="allday" colors={colors} />
            <PopKV label="Mode"           value="balanced" colors={colors} />
            <PopKV label="Engine"         value={engineV} colors={colors} />
            <PopKV label="Slate date"     value={slateDateLabel} colors={colors} />
            <PopKV label="Snapshot hash"  value={hash8 || '——'} colors={colors} mono />
            <PopKV label="Generated"      value={genTime} colors={colors} />
            <PopKV label="Pick count"     value={String(allPicks.length)} colors={colors} />
            <PopKV label="Hits annotated" value={String(hitPicks.length)} colors={colors} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Hits timeline (Hits tab — historical 30-day grouped view) ────────────
//
// Spec C5: query adaptive_tracking_zk30 (matched_session IS NOT NULL =
// "actually matched a draw"), group by Today / Yesterday / This week /
// Earlier this month. Only Today is expanded by default; other bands stay
// collapsed so the surface stays compact even on a long hit streak.

interface ZK30HitRow {
  slate_date: string;
  combo: string;
  combo_set: string;
  hit_straight: boolean;
  hit_box: boolean;
  hit_fireball_straight: boolean;
  hit_fireball_box: boolean;
  matched_session: string | null;
  matched_result: string | null;
  matched_fireball: string | null;
  result_at: string | null;
  rank: number;
}

async function fetchZK30Hits(): Promise<ZK30HitRow[]> {
  const today = getTodayET();
  const start = new Date(today + 'T00:00:00');
  start.setDate(start.getDate() - 30);
  const startStr = start.toLocaleDateString('en-CA');
  const rows = await fetchFromSupabase<ZK30HitRow[]>({
    path: `/rest/v1/adaptive_tracking_zk30?matched_session=not.is.null` +
          `&slate_date=gte.${startStr}` +
          `&select=slate_date,combo,combo_set,rank,hit_straight,hit_box,hit_fireball_straight,hit_fireball_box,matched_session,matched_result,matched_fireball,result_at` +
          `&order=slate_date.desc,result_at.desc&limit=200`,
  });
  return Array.isArray(rows) ? rows : [];
}

type HitBandKey = 'today' | 'yesterday' | 'week' | 'month';

function bandOf(slateDate: string, today: string): HitBandKey {
  // Day-delta in ET. Both sides parsed at noon to dodge DST edge cases.
  const a = new Date(today + 'T12:00:00').getTime();
  const b = new Date(slateDate + 'T12:00:00').getTime();
  const delta = Math.round((a - b) / 86_400_000);
  if (delta <= 0) return 'today';
  if (delta === 1) return 'yesterday';
  if (delta <= 7)  return 'week';
  return 'month';
}

const BAND_LABELS: Record<HitBandKey, string> = {
  today:     'Today',
  yesterday: 'Yesterday',
  week:      'This week',
  month:     'Earlier this month',
};

// ARCH-08: classify an AT row by channel. A row counts as "natural" if any
// natural flag is set; otherwise "fireball" if any fireball flag is set.
// Rows with both natural and fireball flags appear in the natural bucket
// only (natural-primary rule).
function isNaturalRow(r: ZK30HitRow): boolean {
  return r.hit_straight || r.hit_box;
}
function isFireballOnlyRow(r: ZK30HitRow): boolean {
  return !isNaturalRow(r) && (r.hit_fireball_straight || r.hit_fireball_box);
}

function hitTypeOf(r: ZK30HitRow): 'straight' | 'box' | 'fireball_straight' | 'fireball_box' {
  if (r.hit_straight) return 'straight';
  if (r.hit_box) return 'box';
  if (r.hit_fireball_straight) return 'fireball_straight';
  return 'fireball_box';
}

function hitTypeShort(t: ReturnType<typeof hitTypeOf>): string {
  switch (t) {
    case 'straight':          return 'STRAIGHT';
    case 'box':               return 'BOX';
    case 'fireball_straight': return '🔥 STRAIGHT';
    case 'fireball_box':      return '🔥 BOX';
  }
}

function hitTypeColor(t: ReturnType<typeof hitTypeOf>, colors: ColorTokens): string {
  switch (t) {
    case 'straight':          return colors.gold;
    case 'box':               return colors.success;
    case 'fireball_straight': return colors.orange;
    case 'fireball_box':      return colors.amber;
  }
}

function HitsTimelineView({
  colors, brand, today, onTriggerDetection, triggerBusy, triggerStatus,
}: {
  colors: ColorTokens; brand: string; today: string;
  onTriggerDetection: () => void; triggerBusy: boolean; triggerStatus: string;
}) {
  const { data: hits, isPending } = useQuery({
    queryKey: ['zk30-hits-history'],
    queryFn: fetchZK30Hits,
    staleTime: 60 * 1000,
  });

  // Group rows into the 4 bands, then within each band split natural vs
  // fireball-only (ARCH-08). Each band carries its own pair of arrays so
  // the renderer can show natural inline + a collapsible fireball sub-band.
  const groups = useMemo(() => {
    const out: Record<HitBandKey, { natural: ZK30HitRow[]; fireball: ZK30HitRow[] }> = {
      today:     { natural: [], fireball: [] },
      yesterday: { natural: [], fireball: [] },
      week:      { natural: [], fireball: [] },
      month:     { natural: [], fireball: [] },
    };
    if (hits) for (const h of hits) {
      const band = bandOf(h.slate_date, today);
      if (isNaturalRow(h)) out[band].natural.push(h);
      else if (isFireballOnlyRow(h)) out[band].fireball.push(h);
    }
    return out;
  }, [hits, today]);

  // Only Today expanded by default (spec C5). Fireball sub-bands collapse by
  // default on every day-band (ARCH-08 secondary visual rule).
  const [expanded, setExpanded] = useState<Record<HitBandKey, boolean>>({
    today: true, yesterday: false, week: false, month: false,
  });
  const [fbExpanded, setFbExpanded] = useState<Record<HitBandKey, boolean>>({
    today: false, yesterday: false, week: false, month: false,
  });
  const toggle = (k: HitBandKey) => setExpanded(e => ({ ...e, [k]: !e[k] }));
  const toggleFb = (k: HitBandKey) => setFbExpanded(e => ({ ...e, [k]: !e[k] }));

  if (isPending) {
    return (
      <View style={timelineStyles.center}>
        <ActivityIndicator color={brand} />
      </View>
    );
  }
  const totalHits = (hits ?? []).length;

  if (totalHits === 0) {
    return (
      <View style={timelineStyles.center}>
        <EmptyState
          icon={Sparkles}
          title="No hits in the 30-day window"
          message="Nightly detection runs at 23:30 ET. Trigger it now to score the current slate against any draws that have landed."
        />
        <TouchableOpacity
          disabled={triggerBusy}
          onPress={onTriggerDetection}
          style={{
            paddingHorizontal: 24, paddingVertical: 11, borderRadius: 10, marginTop: 8,
            backgroundColor: brand, flexDirection: 'row', gap: 8,
          }}
        >
          {triggerBusy ? <ActivityIndicator size="small" color="#fff" /> : <Play size={14} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
            {triggerBusy ? 'Running…' : 'Run Hit Detection Now'}
          </Text>
        </TouchableOpacity>
        {triggerStatus !== '' && (
          <Text style={[{ fontSize: 11, fontWeight: '700', marginTop: 6 },
            { color: triggerStatus.startsWith('✓') ? colors.success
                   : triggerStatus.startsWith('⏳') ? colors.gold
                   : triggerStatus.startsWith('Detecting') ? colors.textSecondary
                   : colors.error }]}>
            {triggerStatus}
          </Text>
        )}
      </View>
    );
  }

  // Single row renderer — reused for natural + fireball sub-lists.
  const renderRow = (r: ZK30HitRow, i: number) => {
    const t = hitTypeOf(r);
    return (
      <View key={`${r.slate_date}-${r.rank}-${i}`} style={[timelineStyles.row, { borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <View style={timelineStyles.rowTop}>
            <Text style={timelineStyles.combo}>{r.combo}</Text>
            <Text style={[timelineStyles.hitType, { color: hitTypeColor(t, colors) }]}>
              {hitTypeShort(t)}
            </Text>
          </View>
          <Text style={[timelineStyles.rowMeta, { color: colors.textSecondary }]}>
            {r.slate_date}  ·  {(r.matched_session ?? 'session').toUpperCase()}
            {r.matched_result ? `  ·  draw ${r.matched_result}` : ''}
            {r.matched_fireball ? `  + fb ${r.matched_fireball}` : ''}
          </Text>
        </View>
        <Text style={[timelineStyles.rank, { color: colors.textTertiary }]}>#{r.rank}</Text>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      {(['today', 'yesterday', 'week', 'month'] as HitBandKey[]).map((band) => {
        const { natural, fireball } = groups[band];
        const totalN = natural.length;
        const totalF = fireball.length;
        const totalAny = totalN + totalF;
        const isOpen = expanded[band];
        const isFbOpen = fbExpanded[band];
        return (
          <View key={band} style={[timelineStyles.bandCard, { borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => toggle(band)}
              style={timelineStyles.bandHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={[timelineStyles.bandChevron, { color: totalAny > 0 ? brand : colors.textTertiary }]}>
                {isOpen ? '▼' : '▶'}
              </Text>
              <Text style={[timelineStyles.bandLabel, { color: totalAny > 0 ? colors.text : colors.textTertiary }]}>
                {BAND_LABELS[band]}
              </Text>
              <Text style={[timelineStyles.bandCount, { color: totalN > 0 ? brand : colors.textTertiary }]}>
                ({totalN})
                {totalF > 0 && (
                  <Text style={{ color: colors.orange }}>{` + ${totalF} 🔥`}</Text>
                )}
              </Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={{ paddingTop: 4, gap: 8 }}>
                {/* Natural sub-list — always inline (primary per ARCH-08) */}
                {totalN > 0 ? (
                  <View style={{ gap: 6 }}>{natural.map(renderRow)}</View>
                ) : (
                  <Text style={[timelineStyles.empty, { color: colors.textTertiary }]}>
                    No natural matches in this window.
                  </Text>
                )}

                {/* Fireball sub-band — collapsible, "TX-only" tag */}
                {totalF > 0 && (
                  <View style={[timelineStyles.fbBand, { borderColor: colors.border }]}>
                    <TouchableOpacity
                      onPress={() => toggleFb(band)}
                      style={timelineStyles.bandHeader}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isFbOpen }}
                    >
                      <Text style={[timelineStyles.bandChevron, { color: colors.orange }]}>
                        {isFbOpen ? '▼' : '▶'}
                      </Text>
                      {/* Split-color label: channel half stays orange per ARCH-08
                          (fireball channel color); "TX-only" suffix uses TX red
                          per Phase C2 jurisdictional accent. */}
                      <Text style={timelineStyles.fbBandLabel}>
                        <Text style={{ color: colors.orange }}>🔥 FIREBALL</Text>
                        <Text style={{ color: ZK30_THEME.accentTX }}>{'  ·  TX-only'}</Text>
                      </Text>
                      <Text style={[timelineStyles.bandCount, { color: colors.orange }]}>
                        ({totalF})
                      </Text>
                    </TouchableOpacity>
                    {isFbOpen && (
                      <View style={{ gap: 6, paddingTop: 4 }}>{fireball.map(renderRow)}</View>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const timelineStyles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  bandCard: {
    borderWidth: 1, borderRadius: 10,
    padding: 10, gap: 4,
  },
  bandHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  bandChevron: { fontSize: 10, fontWeight: '900', width: 12 },
  bandLabel:   { fontSize: 12, fontWeight: '900', letterSpacing: 0.5, flex: 1 },
  bandCount:   { fontSize: 11, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 6,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  combo: { fontSize: 14, fontWeight: '900', letterSpacing: 1.4, fontFamily: theme.typography.fontFamily.monoBold },
  hitType: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  rowMeta: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  rank: { fontSize: 10, fontWeight: '700', width: 28, textAlign: 'right' },
  empty: { fontSize: 11, fontStyle: 'italic', paddingVertical: 4 },
  // ARCH-08: nested fireball sub-band container — dotted left rule signals
  // hierarchy, lower contrast so natural rows stay primary visually.
  fbBand: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    paddingTop: 4,
    paddingBottom: 4,
    marginTop: 4,
    gap: 4,
  },
  fbBandLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, flex: 1 },
});

// ─── Date picker modal ────────────────────────────────────────────────────
//
// Last-30-days list with availability dots — operators almost always step or
// pick a recent day, so a 30-row vertical list is faster than a full calendar
// grid. Days with no slate render in muted text and are non-tappable.

function ZK30DatePickerModal({
  visible, onClose, onPick, selected, today, availableDates, brandBlue, colors,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (d: string) => void;
  selected: string;
  today: string;
  availableDates: Set<string>;
  brandBlue: string;
  colors: ColorTokens;
}) {
  const days = useMemo(() => {
    const out: { date: string; label: string; has: boolean; isToday: boolean; isSel: boolean }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = addDaysET(today, -i);
      out.push({
        date: d,
        label: formatDateLong(d),
        has: availableDates.has(d) || d === today, // today always tappable (may be next-drop slot)
        isToday: d === today,
        isSel: d === selected,
      });
    }
    return out;
  }, [today, selected, availableDates]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={dpStyles.backdrop} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            dpStyles.card,
            { backgroundColor: colors.bgElevated, borderColor: brandBlue + '55' },
          ]}
          // Stop tap-through so picking inside doesn't close the modal twice.
          onStartShouldSetResponder={() => true}
        >
          <View style={dpStyles.header}>
            <Text style={[dpStyles.title, { color: brandBlue }]}>PICK DATE</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 360 }}>
            {days.map((d) => (
              <TouchableOpacity
                key={d.date}
                disabled={!d.has}
                onPress={() => onPick(d.date)}
                style={[
                  dpStyles.row,
                  { borderBottomColor: colors.border },
                  d.isSel && { backgroundColor: brandBlue + '15' },
                ]}
                accessibilityState={{ disabled: !d.has, selected: d.isSel }}
              >
                <View
                  style={[
                    dpStyles.dot,
                    { backgroundColor: d.has ? colors.success : colors.border },
                  ]}
                />
                <Text style={[dpStyles.dateText, { color: d.has ? colors.text : colors.textTertiary }]}>
                  {d.label}
                </Text>
                {d.isToday && (
                  <Text style={[dpStyles.flag, { color: brandBlue }]}>TODAY</Text>
                )}
                {d.isSel && !d.isToday && (
                  <Text style={[dpStyles.flag, { color: brandBlue }]}>SELECTED</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-start', alignItems: 'center', paddingTop: 96, paddingHorizontal: 20,
  },
  card: {
    width: '100%', maxWidth: 360,
    borderRadius: 12, borderWidth: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 8, marginBottom: 4,
  },
  title: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 6, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  dateText: { flex: 1, fontSize: 13, fontWeight: '600' },
  flag: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});

// ─── Section subcomponents (Results placeholder) ──────────────────────────

function ResultsPlaceholder({
  colors, brand, hitsToday, fireballHitsToday, slateDate,
  onTriggerDetection, triggerBusy, triggerStatus, lastRunCaption,
}: {
  colors: ColorTokens; brand: string;
  hitsToday: number;          // ARCH-08: NATURAL hits only
  fireballHitsToday: number;  // fireball-only callout
  slateDate: string;
  onTriggerDetection: () => void; triggerBusy: boolean; triggerStatus: string;
  lastRunCaption: string;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Today's at-a-glance — ARCH-08 natural primary; fireball secondary
          callout below when there are any fireball-only picks. HITS and RATE
          are NEVER inflated by fireball — most users can't claim fireball
          prizes (non-TX jurisdictions). */}
      <View style={[placeholderStyles.card, { borderColor: brand + '44' }]}>
        <Text style={[placeholderStyles.sectionLabel, { color: brand }]}>TODAY  ·  {slateDate}</Text>
        <View style={placeholderStyles.statsRow}>
          <View style={placeholderStyles.statBlock}>
            <Text style={[placeholderStyles.statNum, { color: hitsToday > 0 ? colors.gold : colors.textTertiary }]}>
              {hitsToday}
            </Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>HITS</Text>
          </View>
          <View style={[placeholderStyles.statBlock, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 }]}>
            <Text style={[placeholderStyles.statNum, { color: colors.text }]}>30</Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>PICKS</Text>
          </View>
          <View style={[placeholderStyles.statBlock, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 }]}>
            <Text style={[placeholderStyles.statNum, { color: colors.text }]}>
              {hitsToday > 0 ? Math.round((hitsToday / 30) * 100) : 0}<Text style={{ fontSize: 13 }}>%</Text>
            </Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>RATE</Text>
          </View>
        </View>
        {fireballHitsToday > 0 && (
          <View style={{
            marginTop: 4,
            paddingTop: 8,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.orange, letterSpacing: 0.4 }}>
              {`+ ${fireballHitsToday} FIREBALL`}
              <Text style={{ color: ZK30_THEME.accentTX }}>{'  ·  TX-only'}</Text>
            </Text>
          </View>
        )}
        <TouchableOpacity
          disabled={triggerBusy}
          onPress={onTriggerDetection}
          style={[placeholderStyles.runBtn, { backgroundColor: brand + '15', borderColor: brand + '88' }]}
        >
          {triggerBusy && <ActivityIndicator size="small" color={brand} />}
          <Text style={[placeholderStyles.runBtnText, { color: brand }]}>
            {triggerBusy ? 'Running…' : 'Run Hit Detection Now'}
          </Text>
        </TouchableOpacity>
        {triggerStatus !== '' && (
          <Text style={[{ fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },
            { color: triggerStatus.startsWith('✓') ? colors.success
                   : triggerStatus.startsWith('⏳') ? colors.gold
                   : triggerStatus.startsWith('Detecting') ? colors.textSecondary
                   : colors.error }]}>
            {triggerStatus}
          </Text>
        )}
        {lastRunCaption !== '' && (
          <Text style={[{ fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
            { color: colors.textTertiary }]}>
            {lastRunCaption}
          </Text>
        )}
      </View>

      {/* Phase D analytics (D1–D4). FailedRunsBanner pinned at the top of
          the analytics stack so cron failures surface before the cards. */}
      <FailedRunsBanner colors={colors} />
      <CronHealthCard       colors={colors} brand={brand} />
      <SevenDayChart        colors={colors} brand={brand} />
      <SessionBreakdown     colors={colors} brand={brand} />
      <FireballNaturalSplit colors={colors} brand={brand} />
    </ScrollView>
  );
}

const placeholderStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderRadius: 12,
    padding: 14, gap: 10,
  },
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  statsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 18, paddingVertical: 4 },
  statBlock: { alignItems: 'flex-start' },
  statNum: { fontSize: 28, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  runBtn: {
    flexDirection: 'row', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  runBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});

// Phase C3 — share-sheet row. Single button with title + subline; tapping
// fires the parent's handler (capture+share or copy).
function ShareSheetRow({
  colors, brand, title, sub, onPress, mono,
}: {
  colors: ColorTokens; brand: string;
  title: string; sub: string; onPress: () => void; mono?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: 0.2 }}>{title}</Text>
      <Text style={{
        fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginTop: 2,
        fontFamily: mono ? theme.typography.fontFamily.mono : undefined,
      }}>{sub}</Text>
    </TouchableOpacity>
  );
}

function PopKV({ label, value, colors, mono }: { label: string; value: string; colors: ColorTokens; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{
        fontSize: 12, fontWeight: '700', color: colors.text,
        fontFamily: mono ? theme.typography.fontFamily.mono : undefined,
      }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Mode chip subcomponent ────────────────────────────────────────────────

interface ChipProps {
  active: boolean;
  onPress: () => void;
  Icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  count?: number;
  colors: ColorTokens;
  brand: string;
  highlight?: boolean;
  compact?: boolean;
}
function ModeChip({ active, onPress, Icon, label, count, colors, brand, highlight, compact }: ChipProps) {
  const color = active ? brand : colors.textTertiary;
  const padV = compact ? 5 : 8;
  const iconSize = compact ? 11 : 12;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.chip,
        {
          paddingVertical: padV,
          backgroundColor: active ? brand + '18' : 'transparent',
          borderColor: active ? brand + '88' : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} view${typeof count === 'number' ? `, ${count} picks` : ''}`}
    >
      <Icon size={iconSize} color={color} />
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
      {typeof count === 'number' && (
        <View
          style={[
            chipStyles.count,
            {
              backgroundColor: active ? brand + '33' : colors.surfaceLight,
              borderColor: highlight && count > 0 ? colors.gold + '88' : 'transparent',
              borderWidth: highlight && count > 0 ? 1 : 0,
            },
          ]}
        >
          <Text style={[chipStyles.countText, { color: highlight && count > 0 ? colors.gold : color }]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  count: {
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 99,
    alignItems: 'center',
  },
  countText: { fontSize: 9, fontWeight: '900' },
});

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface2,
  },
  iconBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  // Phase A1 masthead — 3 stacked lines: kicker, jurisdiction, subline.
  mastheadKicker: {
    fontSize: 9, fontWeight: '900',
    letterSpacing: 2, textTransform: 'uppercase',
    marginBottom: 1,
  },
  mastheadTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mastheadTitle: {
    fontSize: 26, fontWeight: '900',
    color: colors.text, letterSpacing: 1.5,
    fontFamily: theme.typography.fontFamily.bold,
    lineHeight: 30,
  },
  headerSub: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '600',
    marginTop: 1,
  },
  stalePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
  },
  stalePillText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  todayPill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  todayPillText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 2,
  },
  stepperDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  stepperDate: {
    fontSize: 12, color: colors.textSecondary, fontWeight: '700',
  },
  countdown: {
    fontSize: 9, fontWeight: '700', marginTop: 1, letterSpacing: 0.4,
  },

  // Phase A3 — slate hash chip below the masthead, above the tab row.
  hashChipWrap: {
    alignItems: 'center', paddingTop: 4, paddingBottom: 2,
  },
  hashChip: {
    fontSize: 10,
    color: '#64748b', // slate-500, intentionally dim
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Phase A2 — TX watermark layer, absolute-positioned behind the picks.
  watermarkLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },

  // Phase C3 — capture-mode overlays (visible only during snap).
  captureWatermark: {
    position: 'absolute',
    right: 8, bottom: 60,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
  },
  captureWatermarkText: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: theme.typography.fontFamily.mono,
  },
  redactionScrim: {
    // Covers the picks area only (below the header chrome, above the tab
    // bar). The funnel CTA panel sits centered inside it.
    position: 'absolute',
    top: 250, left: 12, right: 12, bottom: 60,
    backgroundColor: 'rgba(10,6,19,0.92)',
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12,
  },
  redactionPanel: {
    alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 18,
  },
  redactionHeadline: {
    fontSize: 18, fontWeight: '900', color: '#fff',
    letterSpacing: 1, textAlign: 'center',
  },
  redactionCta: {
    fontSize: 13, fontWeight: '700', color: ZK30_THEME.primary,
    letterSpacing: 0.4, textAlign: 'center',
  },

  // Phase B4 — next-draw chip row, sits between hash chip and perf band.
  drawChipRow: { alignItems: 'center', paddingTop: 2, paddingBottom: 2 },
  drawChip: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.3,
    color: '#94a3b8', // slate-400 — softer than text, brighter than tertiary
  },

  // Phase B2 — 7-day performance ribbon. Single line, 3 segments + 2 dividers.
  perfBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 2,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  perfSeg: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  perfDivider: { width: StyleSheet.hairlineWidth, marginVertical: 4 },
  perfLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  perfNum:   { fontSize: 16, fontWeight: '900', letterSpacing: 0.4 },

  statusText: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  // Info popover
  popBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 8,
  },
  popCard: {
    minWidth: 260,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 1,
  },
  popHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  popTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  popClose: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },

  // View-mode chips — primary (data shapes)
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
    gap: 6,
  },
  // Secondary chip row — Results only (TBD slots removed in Phase A)
  modeRowSecondary: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingTop: 0, paddingBottom: 8,
    gap: 6,
  },

  // States
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  loadingText: { fontSize: 13, marginTop: 8 },
  errorText: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    paddingHorizontal: 24, paddingVertical: 11,
    borderRadius: 10, marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5,
    marginTop: 8,
  },
  secondaryBtnText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

  // Body
  scroll: { flex: 1 },
  listContent: { padding: 10, gap: 8 },

  // Compact grid — pure flexbox, fills available vertical space.
  gridContainer: { flex: 1, paddingHorizontal: 8, paddingVertical: 8 },
  gridArea: { flex: 1, gap: 6 },
  gridRowFlex: { flex: 1, flexDirection: 'row', gap: 6 },
});

export default withAdminGate(ZK30Screen);
