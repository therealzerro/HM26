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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Calendar,
  RefreshCw, Layers, Grid3x3, List, Sparkles, Info, Play, X, TrendingUp,
} from 'lucide-react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { theme } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { CompactTile } from '@/components/zk30/CompactTile';
import { ZK30PickCardRow } from '@/components/zk30/PickCard';
import { ZK30PickDetailModal } from '@/components/zk30/PickDetailModal';
import { ZK30PickItem, ZK30Snapshot } from '@/components/zk30/types';

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

/** Countdown subtitle text. Returns either the time-until-next-09:00-ET or a
 *  "last updated Xh ago" string when today's slate has already dropped. */
function buildCountdownText(snapshotUpdatedAt: string | null): string {
  // Compute now in ET.
  const nowEt = new Date();
  // 09:00 ET cutoff today (anchored in ET so DST doesn't shift it).
  const todayEt = getTodayET();
  const nineAm = new Date(todayEt + 'T09:00:00-05:00');
  // Adjust for DST — easier: just use America/New_York to render hour boundary.
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

export default function ZK30Screen() {
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
  const hitPicks = allPicks.filter((p) => p.hitType);

  // Filter by view mode for body.
  const visiblePicks = viewMode === 'hits' ? hitPicks : allPicks;

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
  const engineV = snapshot?.engine_version ?? '—';
  // Spec format: "May 25, 2026 09:00 ET" — date + time in 24h, both in ET.
  const genTime = snapshot?.updated_at_et
    ? (() => {
        const d = new Date(snapshot.updated_at_et);
        const date = d.toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          timeZone: 'America/New_York',
        });
        const time = d.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false,
          timeZone: 'America/New_York',
        });
        return `${date} ${time} ET`;
      })()
    : '—';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header — back + brand + stepper + countdown + info/refresh */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>
              ZK30  <Text style={[s.headerBrand, { color: brandBlue }]}>·</Text>  TX
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

          {/* Date stepper row — ← {DATE} → */}
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
              <Text style={s.stepperDate}>{slateDateLabel}</Text>
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
        <TouchableOpacity onPress={() => refetch()} style={s.iconBtn} accessibilityLabel="Refresh">
          {isRefetching
            ? <ActivityIndicator size="small" color={brandBlue} />
            : <RefreshCw size={17} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

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
        <View style={s.gridContainer}>
          <View style={s.gridArea}>
            {Array.from({ length: Math.ceil(visiblePicks.length / 5) }).map((_, rowIdx) => (
              <View key={rowIdx} style={s.gridRowFlex}>
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).map((p) => (
                  <CompactTile
                    key={`tile-${p.rank}`}
                    pick={p}
                    brandBlue={brandBlue}
                    onPress={() => setDetail(p)}
                  />
                ))}
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length < 5 &&
                  Array.from({
                    length: 5 - visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length,
                  }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
              </View>
            ))}
          </View>
        </View>
      ) : (
        // List + Hits: ScrollView (rows always scroll regardless of count).
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {visiblePicks.map((p) => (
            <ZK30PickCardRow
              key={`row-${p.rank}`}
              pick={p}
              brandBlue={brandBlue}
              onPress={() => setDetail(p)}
            />
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Detail modal */}
      <ZK30PickDetailModal
        pick={detail}
        brandBlue={brandBlue}
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

  // Group rows into the 4 bands. Order: today, yesterday, week, month.
  const groups = useMemo(() => {
    const out: Record<HitBandKey, ZK30HitRow[]> = { today: [], yesterday: [], week: [], month: [] };
    if (hits) for (const h of hits) out[bandOf(h.slate_date, today)].push(h);
    return out;
  }, [hits, today]);

  // Only Today expanded by default (spec C5).
  const [expanded, setExpanded] = useState<Record<HitBandKey, boolean>>({
    today: true, yesterday: false, week: false, month: false,
  });
  const toggle = (k: HitBandKey) => setExpanded(e => ({ ...e, [k]: !e[k] }));

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

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      {(['today', 'yesterday', 'week', 'month'] as HitBandKey[]).map((band) => {
        const list = groups[band];
        const isOpen = expanded[band];
        return (
          <View key={band} style={[timelineStyles.bandCard, { borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => toggle(band)}
              style={timelineStyles.bandHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={[timelineStyles.bandChevron, { color: list.length > 0 ? brand : colors.textTertiary }]}>
                {isOpen ? '▼' : '▶'}
              </Text>
              <Text style={[timelineStyles.bandLabel, { color: list.length > 0 ? colors.text : colors.textTertiary }]}>
                {BAND_LABELS[band]}
              </Text>
              <Text style={[timelineStyles.bandCount, { color: list.length > 0 ? brand : colors.textTertiary }]}>
                ({list.length})
              </Text>
            </TouchableOpacity>
            {isOpen && list.length > 0 && (
              <View style={{ gap: 6, paddingTop: 4 }}>
                {list.map((r, i) => {
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
                })}
              </View>
            )}
            {isOpen && list.length === 0 && (
              <Text style={[timelineStyles.empty, { color: colors.textTertiary }]}>
                No hits in this window.
              </Text>
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
  colors, brand, hitsToday, slateDate, onTriggerDetection, triggerBusy, triggerStatus, lastRunCaption,
}: {
  colors: ColorTokens; brand: string; hitsToday: number; slateDate: string;
  onTriggerDetection: () => void; triggerBusy: boolean; triggerStatus: string;
  lastRunCaption: string;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Today's at-a-glance */}
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

      {/* Coming-soon roadmap */}
      <View style={[placeholderStyles.card, { borderColor: colors.border }]}>
        <Text style={[placeholderStyles.sectionLabel, { color: colors.textTertiary }]}>COMING SOON</Text>
        {[
          '7-day hit rollup chart',
          'By-session breakdown (Morning / Day / Evening / Night)',
          'Fireball-only vs natural-only split',
          'Best-performing energy band',
          'Cron health (last 14 runs · success/failure)',
        ].map((line, i) => (
          <View key={i} style={placeholderStyles.bullet}>
            <Text style={[placeholderStyles.bulletDot, { color: brand }]}>·</Text>
            <Text style={[placeholderStyles.bulletText, { color: colors.textSecondary }]}>{line}</Text>
          </View>
        ))}
      </View>
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
  bullet: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  bulletDot: { fontSize: 16, fontWeight: '900', lineHeight: 16 },
  bulletText: { fontSize: 11, flex: 1, lineHeight: 16 },
});

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
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 18, fontWeight: '900', color: colors.text,
    letterSpacing: 1, fontFamily: theme.typography.fontFamily.bold,
  },
  headerBrand: { fontSize: 18, fontWeight: '900' },
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
    fontSize: 11, color: colors.textSecondary, fontWeight: '700',
  },
  countdown: {
    fontSize: 9, fontWeight: '700', marginTop: 1, letterSpacing: 0.4,
  },

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
  // Secondary (sections — Results / TBD / TBD)
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
