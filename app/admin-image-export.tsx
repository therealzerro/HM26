/* ============================================================================
   admin-image-export.tsx — operator-only image export screen
   ----------------------------------------------------------------------------
   Generates 7 PNG files per session (1 slate + 6 picks) for the daily reel
   composition workflow.

     • Public mode  — digits redacted, CTA banner appended (1080×1920 total).
     • Pro mode     — full fidelity, no banner (1080×1920 total).

   INVARIANT 2 carve-out: this screen reads slate_snapshots directly via
   fetchFromSupabase. The carve-out is admin-only, READ-only, and triggered
   exclusively by an explicit operator tap. No engine recomputation, no
   writes, no telemetry. See docs/features/admin-image-export.md.

   Web-only — captureExportImage uses html-to-image. Native (iOS) capture
   would require react-native-view-shot under an EAS dev build; see audit
   ENH-EXPORT-2026-05-23.
   ============================================================================ */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Image as RNImage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { ArrowLeft, Download, AlertCircle, CheckCircle, ImageDown } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { SlatePosterCard } from '@/components/SlatePosterCard';
import { PickPosterCard } from '@/components/PickPosterCard';
import { PublicExportBanner } from '@/components/PublicExportBanner';
import { PickItem } from '@/components/PickCard';
import {
  captureAvailable,
  captureNodeToPng,
  downloadDataUrl,
  downloadAllSequential,
  buildFilename,
  EXPORT_WIDTH,
  EXPORT_HEIGHT,
  BANNER_HEIGHT,
  BANNER_SAFE_BUFFER,
  type ExportType,
  type ExportSession,
} from '@/lib/captureExportImage';

const SESSIONS: ExportSession[] = ['midday', 'evening', 'allday'];
const SESSION_LABELS: Record<ExportSession, string> = {
  midday:  'Midday',
  evening: 'Evening',
  allday:  'All-Day',
};

// Mobile-viewport rendering. The stage outer is 1080×1920 (the actual PNG
// output size). Inside, we render at a logical mobile width (390px — close
// to iPhone 14/15) and let a CSS scale() transform multiply it up to fill
// the output. This is what gives the captured PNG a "mobile app screenshot"
// aesthetic instead of "stretched-out desktop web" — fixed-pixel font sizes
// (e.g. 22px hero digits in PickPosterCard) sit at the same proportion they
// would on a real phone screen.
const STAGE_LOGICAL_WIDTH       = 390;
const STAGE_SCALE               = EXPORT_WIDTH / STAGE_LOGICAL_WIDTH;   // ≈ 2.769
const STAGE_LOGICAL_HEIGHT      = EXPORT_HEIGHT / STAGE_SCALE;          // ≈ 693.33
const LOGICAL_BANNER_HEIGHT     = BANNER_HEIGHT / STAGE_SCALE;          // ≈ 54.17
// Safe buffer below the public CTA banner (Facebook Reels UI overlay zone).
// At STAGE_SCALE this maps to BANNER_SAFE_BUFFER (220px) on the output PNG.
const LOGICAL_SAFE_BUFFER       = BANNER_SAFE_BUFFER / STAGE_SCALE;     // ≈ 79.44

function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

function rowToPickItem(r: any, idx: number, snapshotUpdatedAt?: string, scope?: string): PickItem {
  const combo  = r.combo ?? '---';
  const energy = typeof r.energy === 'number' ? r.energy : typeof r.temperature === 'number' ? r.temperature : 0;
  const hitType = r.hitType === 'straight' || r.hitType === 'box' ? r.hitType : undefined;
  return {
    rank: idx + 1,
    combo,
    comboSet: r.comboSet ?? toComboSet(combo),
    bestOrder: r.bestOrder ?? combo,
    energy,
    signals: {
      BOX:    Number(r.signals?.BOX    ?? r.box    ?? r.components?.BOX    ?? 0),
      PBURST: Number(r.signals?.PBURST ?? r.pburst ?? r.components?.PBURST ?? 0),
      CO:     Number(r.signals?.CO     ?? r.co     ?? r.components?.CO     ?? 0),
      DGC:    Number(r.signals?.DGC    ?? r.components?.DGC                ?? 0),
    },
    multiplicity: r.multiplicity,
    topPair: r.topPair,
    drawsSince: r.drawsSince,
    timesDrawn: r.timesDrawn,
    lastSeen: r.lastSeen,
    locked: false, // Pro/admin export always shows full data
    generatedAt: snapshotUpdatedAt,
    snapshotScope: scope,
    hitType,
    hitState:  r.hitState  ?? r.matched_state    ?? undefined,
    hitSession: r.hitSession ?? r.matched_session ?? undefined,
    hitResult: r.hitResult ?? r.actual_result    ?? undefined,
  };
}

interface ExportItem {
  /** Short label rendered in the preview card ("Slate", "Pick #1"…). */
  label: string;
  /** Filename used when the operator taps Download. */
  filename: string;
  /** PNG data URL captured from the off-screen stage. */
  dataUrl: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; msg: string }
  | { kind: 'generating'; current: number; total: number; label: string }
  | { kind: 'done'; items: ExportItem[] }
  | { kind: 'error'; msg: string };

export default function AdminImageExportScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const navigation = useNavigation();

  // router.back() silently no-ops if there's no prior history (direct URL
  // load, page refresh on web, or first navigation after app launch). Fall
  // back to a direct replace into the admin tab so the operator is never
  // stranded.
  const handleBack = useCallback(() => {
    try {
      const can: boolean = typeof navigation?.canGoBack === 'function' ? navigation.canGoBack() : false;
      if (can) {
        router.back();
      } else {
        router.replace('/(tabs)/admin' as unknown as Parameters<typeof router.replace>[0]);
      }
    } catch {
      router.replace('/(tabs)/admin' as unknown as Parameters<typeof router.replace>[0]);
    }
  }, [navigation, router]);

  const [exportType, setExportType] = useState<ExportType>('public');
  const [session, setSession]       = useState<ExportSession>('midday');
  const [status, setStatus]         = useState<Status>({ kind: 'idle' });

  // The hidden capture stage. We mount the composite views here at exact
  // 1080×1920px so html-to-image reads pixel-perfect output. The wrapper is
  // positioned off-screen so nothing leaks to the visible UI.
  const stageRef = useRef<View | null>(null);
  const [stagePick, setStagePick] = useState<PickItem | null>(null);
  const [stageMode, setStageMode] = useState<'slate' | 'pick'>('slate');
  const [stagePicks, setStagePicks] = useState<PickItem[] | null>(null);

  const runExport = useCallback(async (mode: 'sample' | 'full') => {
    if (!captureAvailable()) {
      setStatus({ kind: 'error', msg: 'Image export is web-only. Open HitMaster on the web (not iOS) to use this feature.' });
      return;
    }
    // Sample: 1 slate + 1 pick (visual review gate before generating the
    // full 7-image set). Full: 1 slate + 6 picks.
    const pickCount = mode === 'sample' ? 1 : 6;
    const totalImages = 1 + pickCount;
    setStatus({ kind: 'loading', msg: `Loading ${SESSION_LABELS[session]} snapshot…` });

    let picks: PickItem[];
    let snapshotUpdatedAt: string | undefined;
    try {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/v_latest_slate_snapshots?select=*&scope=eq.${encodeURIComponent(session)}&mode=neq.zk30&limit=1`,
        method: 'GET',
      });
      const snap = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      if (!snap) {
        setStatus({ kind: 'error', msg: `No active snapshot found for ${SESSION_LABELS[session]}. Generate a slate first.` });
        return;
      }
      const raw = Array.isArray(snap.top_k_straights_json)
        ? snap.top_k_straights_json
        : (typeof snap.top_k_straights_json === 'string'
            ? (() => { try { return JSON.parse(snap.top_k_straights_json); } catch { return []; } })()
            : []);
      snapshotUpdatedAt = snap.updated_at_et ?? snap.updated_at ?? snap.created_at;
      picks = (Array.isArray(raw) ? raw : []).slice(0, 6).map((r: any, i: number) => rowToPickItem(r, i, snapshotUpdatedAt, session));
      if (picks.length === 0) {
        setStatus({ kind: 'error', msg: `Snapshot for ${SESSION_LABELS[session]} has no picks.` });
        return;
      }
    } catch (err: any) {
      setStatus({ kind: 'error', msg: `Snapshot fetch failed: ${String(err?.message ?? err)}` });
      return;
    }

    const date = getTodayET();
    const items: ExportItem[] = [];

    // ── 1) Slate composite ───────────────────────────────────────────────
    setStagePicks(picks);
    setStagePick(null);
    setStageMode('slate');
    setStatus({ kind: 'generating', current: 1, total: totalImages, label: 'Slate' });
    await raf();
    await waitFonts();
    try {
      const node = getStageNode(stageRef);
      if (!node) throw new Error('Capture stage not mounted');
      const slateName = mode === 'sample' ? 'sample-slate' : 'slate';
      const fn = buildFilename({ type: exportType, session, date, name: slateName });
      const dataUrl = await captureNodeToPng(node, fn);
      items.push({ label: mode === 'sample' ? 'Slate (sample)' : 'Slate', filename: fn, dataUrl });
    } catch (err: any) {
      setStatus({ kind: 'error', msg: `Slate capture failed: ${String(err?.message ?? err)}` });
      return;
    }

    // ── 2..) Per-pick composites ─────────────────────────────────────────
    for (let i = 0; i < Math.min(pickCount, picks.length); i++) {
      const pick = picks[i];
      setStagePicks(null);
      setStagePick(pick);
      setStageMode('pick');
      setStatus({ kind: 'generating', current: 2 + i, total: totalImages, label: `Pick #${i + 1}` });
      await raf();
      try {
        const node = getStageNode(stageRef);
        if (!node) throw new Error('Capture stage not mounted');
        const pickName = mode === 'sample' ? `sample-pick-${i + 1}` : `pick-${i + 1}`;
        const fn = buildFilename({ type: exportType, session, date, name: pickName });
        const dataUrl = await captureNodeToPng(node, fn);
        items.push({ label: `Pick #${i + 1}`, filename: fn, dataUrl });
      } catch (err: any) {
        setStatus({ kind: 'error', msg: `Pick #${i + 1} capture failed: ${String(err?.message ?? err)}` });
        return;
      }
    }

    setStagePick(null);
    setStagePicks(null);
    setStatus({ kind: 'done', items });
  }, [exportType, session]);

  const handleDownloadOne = useCallback((item: ExportItem) => {
    downloadDataUrl(item.dataUrl, item.filename);
  }, []);

  const handleDownloadAll = useCallback(async (items: ExportItem[]) => {
    await downloadAllSequential(items.map(it => ({ dataUrl: it.dataUrl, filename: it.filename })));
  }, []);

  const isWeb = Platform.OS === 'web';
  const canRun = isWeb && status.kind !== 'loading' && status.kind !== 'generating';
  const isPublic = exportType === 'public';
  // Logical (mobile-native) heights for the poster region. The output PNG is
  // still 1080×1920; these are what the inner content is laid out at before
  // the STAGE_SCALE transform multiplies them up. Public exports also reserve
  // LOGICAL_SAFE_BUFFER below the banner for the Facebook Reels UI overlay zone.
  const logicalPosterHeight = isPublic
    ? STAGE_LOGICAL_HEIGHT - LOGICAL_BANNER_HEIGHT - LOGICAL_SAFE_BUFFER
    : STAGE_LOGICAL_HEIGHT;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.headerBtn}
          activeOpacity={0.7}
          testID="admin-image-export-back"
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Image Export</Text>
          <Text style={styles.headerSub}>Operator-only · daily reel composer</Text>
        </View>
        <ImageDown size={22} color={colors.cyan} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isWeb && (
          <View style={[styles.notice, { borderColor: colors.amber + '66', backgroundColor: colors.amber + '14' }]}>
            <AlertCircle size={16} color={colors.amber} />
            <Text style={[styles.noticeText, { color: colors.amber }]}>
              Web only. Open HitMaster in a desktop browser to generate exports.
            </Text>
          </View>
        )}

        {/* Export type */}
        <Text style={styles.label}>Export type</Text>
        <View style={styles.radioRow}>
          {(['public', 'pro'] as ExportType[]).map(t => {
            const active = exportType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.radio, active && { borderColor: colors.cyan, backgroundColor: colors.cyan + '12' }]}
                onPress={() => setExportType(t)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioDot, active && { borderColor: colors.cyan, backgroundColor: colors.cyan }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.radioLabel, active && { color: colors.cyan }]}>
                    {t === 'public' ? 'Public (redacted + CTA banner)' : 'Pro (full fidelity)'}
                  </Text>
                  <Text style={styles.radioHint}>
                    {t === 'public'
                      ? 'Block-redacted digits, navy CTA banner at bottom'
                      : 'All digits visible, no banner'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Session */}
        <Text style={[styles.label, { marginTop: 18 }]}>Session</Text>
        <View style={styles.pillRow}>
          {SESSIONS.map(s => {
            const active = session === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.pill, active && { borderColor: colors.cyan, backgroundColor: colors.cyan + '12' }]}
                onPress={() => setSession(s)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, active && { color: colors.cyan }]}>{SESSION_LABELS[s]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sample (2 images) — visual review gate before generating the full set. */}
        <TouchableOpacity
          style={[styles.sampleBtn, !canRun && { opacity: 0.5 }]}
          onPress={canRun ? () => runExport('sample') : undefined}
          activeOpacity={0.85}
          disabled={!canRun}
        >
          <Download size={18} color={colors.cyan} />
          <Text style={[styles.sampleText, { color: colors.cyan }]}>
            {status.kind === 'generating' || status.kind === 'loading' ? 'Generating…' : 'Generate Sample (1 slate + 1 pick)'}
          </Text>
        </TouchableOpacity>

        {/* Full pipeline (7 images). */}
        <TouchableOpacity
          style={[styles.generateBtn, !canRun && { opacity: 0.5 }]}
          onPress={canRun ? () => runExport('full') : undefined}
          activeOpacity={0.85}
          disabled={!canRun}
        >
          <Download size={18} color={colors.background} />
          <Text style={styles.generateText}>
            {status.kind === 'generating' || status.kind === 'loading' ? 'Generating…' : 'Generate Full Set (7 images)'}
          </Text>
        </TouchableOpacity>

        {/* Status */}
        {status.kind === 'loading' && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{status.msg}</Text>
          </View>
        )}
        {status.kind === 'generating' && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              Capturing {status.label} · {status.current}/{status.total}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(status.current / status.total) * 100}%` as any }]} />
            </View>
          </View>
        )}
        {status.kind === 'error' && (
          <View style={[styles.notice, { borderColor: colors.hot + '66', backgroundColor: colors.hot + '14', marginTop: 14 }]}>
            <AlertCircle size={16} color={colors.hot} />
            <Text style={[styles.noticeText, { color: colors.hot }]}>{status.msg}</Text>
          </View>
        )}
        {status.kind === 'done' && (
          <>
            <View style={[styles.notice, { borderColor: colors.success + '66', backgroundColor: colors.success + '14', marginTop: 14 }]}>
              <CheckCircle size={16} color={colors.success} />
              <Text style={[styles.noticeText, { color: colors.success }]}>
                Captured {status.items.length} image{status.items.length === 1 ? '' : 's'}. Tap Download on each preview to save it — your browser will block rapid auto-downloads, so each save needs its own tap.
              </Text>
            </View>

            <View style={styles.previewSectionHeader}>
              <Text style={styles.label}>Previews</Text>
              <TouchableOpacity
                style={styles.downloadAllBtn}
                onPress={() => handleDownloadAll(status.items)}
                activeOpacity={0.85}
              >
                <Download size={14} color={colors.cyan} />
                <Text style={[styles.downloadAllText, { color: colors.cyan }]}>Download all (sequential)</Text>
              </TouchableOpacity>
            </View>

            {/* Slate preview — full-width feature at top. */}
            {status.items.filter(it => /slate/.test(it.filename)).map(item => (
              <PreviewCard
                key={item.filename}
                item={item}
                onDownload={handleDownloadOne}
                colors={colors}
                styles={styles}
                large
              />
            ))}

            {/* Pick previews — 2×3 grid below. */}
            <View style={styles.pickPreviewGrid}>
              {status.items.filter(it => /pick/.test(it.filename)).map(item => (
                <PreviewCard
                  key={item.filename}
                  item={item}
                  onDownload={handleDownloadOne}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Hidden capture stage ──────────────────────────────────────────
          Rendered at exact export dimensions but positioned off-screen.
          html-to-image reads the underlying DOM node via stageRef. */}
      <View
        ref={stageRef as any}
        collapsable={false}
        style={[styles.stage, { width: EXPORT_WIDTH, height: EXPORT_HEIGHT, backgroundColor: colors.background }]}
      >
        {stageMode === 'slate' && stagePicks && (
          <View style={styles.stageScaleWrap}>
            <View style={{ width: STAGE_LOGICAL_WIDTH, height: logicalPosterHeight, padding: 14, backgroundColor: colors.background }}>
              <View style={styles.slateHeader}>
                <Text style={styles.slateBrand}>HITMASTER <Text style={{ color: colors.cyan }}>ZK6</Text></Text>
                <Text style={styles.slateMeta}>
                  {SESSION_LABELS[session].toUpperCase()} · {getTodayET()}
                </Text>
              </View>
              <View style={styles.slateGrid}>
                {[0, 1, 2].map(row => (
                  <View key={row} style={styles.slateRow}>
                    {stagePicks.slice(row * 2, row * 2 + 2).map(p => (
                      <SlatePosterCard key={`stage-${p.rank}`} pick={p} redact={isPublic} />
                    ))}
                  </View>
                ))}
              </View>
              <Text style={styles.slateFooter}>Intelligence is your edge. Use it.</Text>
            </View>
            {isPublic && (
              <>
                <PublicExportBanner height={LOGICAL_BANNER_HEIGHT} />
                <View style={[styles.safeBuffer, { height: LOGICAL_SAFE_BUFFER }]} />
              </>
            )}
          </View>
        )}

        {stageMode === 'pick' && stagePick && (
          <View style={styles.stageScaleWrap}>
            <PickPosterCard
              pick={stagePick}
              scope={session}
              redact={isPublic}
              height={logicalPosterHeight}
            />
            {isPublic && (
              <>
                <PublicExportBanner height={LOGICAL_BANNER_HEIGHT} />
                <View style={[styles.safeBuffer, { height: LOGICAL_SAFE_BUFFER }]} />
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Preview card ────────────────────────────────────────────────────────────
// Inline component (vs. a standalone file) because it's tightly coupled to
// the export screen's styles and is only used here.

interface PreviewCardProps {
  item: ExportItem;
  onDownload: (item: ExportItem) => void;
  colors: ColorTokens;
  styles: ReturnType<typeof makeStyles>;
  large?: boolean;
}

function PreviewCard({ item, onDownload, colors, styles, large = false }: PreviewCardProps) {
  return (
    <View style={[styles.previewCard, large && styles.previewCardLarge]}>
      <RNImage source={{ uri: item.dataUrl }} style={styles.previewImg} resizeMode="contain" />
      <View style={styles.previewMetaRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.previewLabel}>{item.label}</Text>
          <Text style={styles.previewFilename} numberOfLines={1}>{item.filename}</Text>
        </View>
        <TouchableOpacity
          style={styles.previewDownloadBtn}
          onPress={() => onDownload(item)}
          activeOpacity={0.85}
        >
          <Download size={14} color={colors.background} />
          <Text style={styles.previewDownloadText}>Download</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function raf(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 32);
    }
  });
}

async function waitFonts(): Promise<void> {
  try {
    const docAny = globalThis as unknown as { document?: any };
    const fonts = docAny.document?.fonts;
    if (fonts?.ready) await fonts.ready;
  } catch {}
}

function getStageNode(ref: React.MutableRefObject<any>): HTMLElement | null {
  if (Platform.OS !== 'web') return null;
  const cur: any = ref.current;
  if (!cur) return null;
  // react-native-web: View's ref is the underlying DOM node directly.
  if (cur instanceof HTMLElement) return cur;
  // Some RN-Web versions expose getBoundingClientRect on the host node.
  if (typeof cur.getBoundingClientRect === 'function') return cur as HTMLElement;
  return null;
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerBtn: { padding: 6 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1 },
  headerSub:   { fontSize: 10, color: colors.textTertiary, letterSpacing: 0.6, marginTop: 2 },
  scroll: { padding: 16 },

  label: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, letterSpacing: 1.6, marginBottom: 8 },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14,
  },
  noticeText: { fontSize: 12, fontWeight: '700', flex: 1 },

  radioRow: { gap: 8 },
  radio: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border },
  radioLabel: { fontSize: 13, fontWeight: '800', color: colors.text, letterSpacing: 0.4 },
  radioHint:  { fontSize: 10, color: colors.textTertiary, marginTop: 2 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  pillText: { fontSize: 12, fontWeight: '800', color: colors.text, letterSpacing: 1 },

  sampleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.cyan,
    borderRadius: 12, paddingVertical: 12,
    marginTop: 20,
  },
  sampleText: { fontSize: 13, fontWeight: '800', letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.cyan, borderRadius: 12, paddingVertical: 14,
    marginTop: 10,
  },
  generateText: { fontSize: 14, fontWeight: '900', color: colors.background, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold },

  statusBox: {
    marginTop: 14, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
    gap: 8,
  },
  statusText: { fontSize: 12, fontWeight: '700', color: colors.text },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3, backgroundColor: colors.cyan },

  previewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22, marginBottom: 8,
  },
  downloadAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: colors.cyan,
    backgroundColor: 'transparent',
  },
  downloadAllText: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.6,
  },

  pickPreviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  previewCard: {
    width: '47%',
    borderRadius: 10, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card, padding: 8, gap: 8,
  },
  previewCardLarge: { width: '100%' },
  previewImg: { width: '100%', aspectRatio: 1080 / 1920, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.4)' },
  previewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewLabel: { fontSize: 12, fontWeight: '800', color: colors.text, letterSpacing: 0.6 },
  previewFilename: {
    fontSize: 9, color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    marginTop: 2,
  },
  previewDownloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 7, backgroundColor: colors.cyan,
  },
  previewDownloadText: {
    fontSize: 11, fontWeight: '900', color: colors.background, letterSpacing: 0.8,
    fontFamily: theme.typography.fontFamily.monoBold,
  },

  stage: {
    // Laid out at the viewport origin so the browser actually paints it
    // (Chrome/Safari skip paint for elements far outside the viewport, which
    // makes html-to-image emit a blank image). A translate moves the painted
    // layer off-screen after paint, so it's invisible without being culled.
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [{ translateX: 5000 }],
    pointerEvents: 'none',
  },
  // Stage-scale wrapper sits inside the 1080×1920 stage and lays out content
  // at 390 logical px wide. The CSS scale() multiplies it up so the captured
  // PNG looks like a mobile-app screenshot rather than stretched web layout.
  stageScaleWrap: {
    width: STAGE_LOGICAL_WIDTH,
    height: STAGE_LOGICAL_HEIGHT,
    transform: [{ scale: STAGE_SCALE }],
    transformOrigin: '0 0',
    backgroundColor: colors.background,
  },
  // Navy fill below the public CTA banner. Sized at LOGICAL_SAFE_BUFFER per
  // composition; explicit backgroundColor keeps the bottom 220px (output) opaque
  // so html-to-image never emits transparency in the Facebook Reels overlay zone.
  safeBuffer: {
    width: '100%',
    backgroundColor: colors.background,
  },
  // Slate header / footer sized in MOBILE-NATIVE pixels (multiplied ~2.77×
  // by the capture transform). Match the slates screen's chrome scale.
  slateHeader: {
    alignItems: 'center',
    gap: 3,
    paddingBottom: 8,
  },
  slateBrand: {
    fontSize: 14, fontWeight: '900', color: colors.text,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 2.4,
  },
  slateMeta: {
    fontSize: 8, fontWeight: '800', color: colors.cyan,
    letterSpacing: 1.4,
  },
  slateGrid: { flex: 1, gap: 6 },
  slateRow:  { flex: 1, flexDirection: 'row', gap: 6 },
  slateFooter: {
    fontSize: 7, fontWeight: '600', color: colors.textTertiary,
    letterSpacing: 1, textAlign: 'center', paddingTop: 6,
  },
});
