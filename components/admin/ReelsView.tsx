/**
 * ReelsView — MKT-04 in-app reel publishing (GROWTH · 🎬 Reels).
 *
 * The reel pipelines (npm run reel:allday / reel:verify) end by uploading
 * their finals to the public `marketing-reels` bucket and registering them in
 * marketing_reels (scripts/publish-reels.ts). This view lists those rows so
 * the operator can post a reel from any device without touching the repo:
 * contact-sheet preview (no video player dependency — the sheet IS the
 * storyboard), caption edit behind the full brandLint engine, then the same
 * assisted handoff contract as PublishView: caption → clipboard, video file →
 * OS share sheet (native) or browser download + group tab (web), handoff
 * logged via fb-publish log_assist (same-day duplicate-caption trail), row
 * flipped to 'posted' through the admin-ops gateway.
 *
 * Surface discipline (Brand Rehab v2): reels carry full digits, so the lanes
 * here are the group/cross ASSIST lanes only — there is deliberately no page
 * (API) lane. Cross-posts hard-gate on the Two-Question NO/NO ack, same as
 * PublishView; digit-bearing reels honestly fail Q1 and stay in the groups.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Linking } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { lintCaption } from '@/lib/social/brandLint';
import { SURFACE_TIER } from '@/lib/social/captions';
import { fbPublish } from '@/lib/social/fbPublishClient';
import {
  MarketingReel, ReelKind, REEL_KIND_AUDIENCE, fetchReels, reelPublicUrl,
  markReelPosted, shareReelToApps, saveReelToPhotos,
  fetchReelBlob, canWebShareVideo, webShareReel, downloadReelBlobWeb,
  shareAssetToApps, fetchAssetBlob, canWebSharePdf, webShareFile, downloadBlobWeb,
} from '@/lib/marketingReels';
import { Pill, SectionTitle, Card, useSt, timeAgo } from './AdminShared';
import { buildSocialBrief, type SocialBriefData } from '@/lib/social/socialBrief';
import { SocialBriefCard } from '@/components/social/SocialBriefCard';
import { raf, waitFonts } from '@/lib/social/publishImages';
import {
  captureAvailable, captureNodeToPngNatural, downloadDataUrl, resolveWebNode,
  shareToPhotosAvailable, shareDataUrlToApps, saveDataUrlToPhotos,
} from '@/lib/captureExportImage';
import { getTodayET } from '@/lib/dateUtils';
import { POSTING_SESSIONS, SCHEDULE_SKIP_ORDER } from '@/constants/postingSchedule';
import {
  SOCIAL_PLATFORMS, PLATFORM_IDS, platformCaption, platformLink,
  platformAcceptsAudience,
  type SocialPlatform,
} from '@/constants/socialPlatforms';

type Target = 'free' | 'pro' | 'cross';

const KIND_UI: Record<ReelKind, { icon: string; label: string; defaultTarget: Target; sheetAspect: number }> = {
  // sheetAspect = frames × (270/480) — the assemblers hstack fixed 270×480 frames.
  allday_pro: { icon: '💎', label: 'All-Day · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
  allday_free: { icon: '👥', label: 'All-Day · Free', defaultTarget: 'free', sheetAspect: 6 * (270 / 480) },
  verify: { icon: '🧾', label: 'Receipts · Verify', defaultTarget: 'free', sheetAspect: 4 * (270 / 480) },
  // MKT-13 session wave, MKT-26 free half.
  //
  // ⚠ THE FREE ROWS DEFAULT TO 'free', AND GETTING THAT WRONG IS A BUSINESS BUG,
  // NOT A COSMETIC ONE. These reels exist to be a conversion teaser: the board
  // shown, the digits masked. Landing one in the PRO group hands paying members a
  // deliberately incomplete version of what they already bought — and the default
  // target is what the operator taps through without reading, so the wrong
  // default is the one that actually ships.
  midday_pro: { icon: '☀️', label: 'Midday · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
  evening_pro: { icon: '🌙', label: 'Evening · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
  midday_free: { icon: '☀️', label: 'Midday · Free', defaultTarget: 'free', sheetAspect: 6 * (270 / 480) },
  evening_free: { icon: '🌙', label: 'Evening · Free', defaultTarget: 'free', sheetAspect: 6 * (270 / 480) },
  // MKT-16 — the public reel. Default target 'cross' is the point, not a
  // convenience: this cut exists for surfaces we do NOT own, its caption is
  // tier-1 copy, and cross-post is the target class that forces the
  // Two-Question NO/NO ack. Landing it in a group by default would waste the
  // one reel written for strangers on rooms that already have better cuts.
  allday_public: { icon: '📡', label: 'All-Day · Public', defaultTarget: 'cross', sheetAspect: 6 * (270 / 480) },
  // MKT-40 — the grading half of the public pair. Verify's contact sheet is 4
  // frames wide (open / board / hold / close), same as verify's.
  verify_public: { icon: '🧾', label: 'Verify · Public', defaultTarget: 'cross', sheetAspect: 4 * (270 / 480) },
  // MKT-62 — the SAME-DAY midday verify. Default 'free' is the ruling, not a
  // convenience: this kind exists to close the free member's covered-board loop
  // the same afternoon; cross-post is barred (real digits + state attribution,
  // no masked build). Contact sheet 5 frames (open / covered / lifted / hold / close).
  verify_midday: { icon: '⏱️', label: 'Midday · Same-Day Verify', defaultTarget: 'free', sheetAspect: 5 * (270 / 480) },
};

/** A kind with no UI entry would crash the whole Reels tab on `ui.defaultTarget`
 *  rather than degrading to one unrenderable card. Fall back instead. */
const FALLBACK_KIND_UI = { icon: '🎬', label: 'Reel', defaultTarget: 'pro' as Target, sheetAspect: 6 * (270 / 480) };

// Daily posting schedule — data shared with the captions PDF's page-1 card
// via constants/postingSchedule.ts (structured mirror of the canonical
// POSTING_SCHEDULE.txt). Kinds arrive as plain strings there, so lookups
// below go through KIND_UI with the fallback.

const TARGET_UI: Record<Target, { label: string; name: string }> = {
  free: { label: '👥 Free Group', name: 'free group' },
  pro: { label: '💎 Pro Group', name: 'pro group' },
  cross: { label: '🔁 Cross-Post', name: 'cross-post' },
};

/** Same rationale as PublishView.openInNewTab — expo-linking navigates the
 *  CURRENT tab on web; window.open is the only way to keep the app open. */
function openInNewTab(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url);
  }
}

interface GroupUrls { free?: string; pro?: string }

/**
 * MKT-15 — one assisted handoff row per registered platform.
 *
 * Assisted ONLY: save the mp4 to the camera roll, copy a platform-shaped
 * caption, open the app, finish by hand. There is no send button because there
 * is no API — and no URL scheme can attach a video, so the deep link only
 * chooses the landing screen. The clipboard is the part that actually saves
 * work.
 *
 * A disabled platform still renders, greyed, WITH ITS REASON. Hiding it would
 * make a deliberate ruling (Instagram) look like an oversight, and would hide
 * that the four public surfaces are waiting on Phase 2 rather than missing.
 */
function PlatformHandoffRow({
  platform: p, reel, caption, captionAudience, videoUrl, filename, freeGroupUrl, onLogged,
}: {
  platform: SocialPlatform;
  reel: MarketingReel;
  caption: string;
  /** Which room the loaded draft was WRITTEN for — gates tier-4 platforms. */
  captionAudience: 'free' | 'pro' | 'public';
  videoUrl: string;
  filename: string;
  /** MKT-37: substitution target for platform content sets ({free_group_url}). */
  freeGroupUrl?: string;
  onLogged: () => void;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // MKT-37: platforms with a dedicated content set (YouTube) rotate on the
  // reel's CONTENT date — the same dayOfYear convention as the caption
  // engine, never the render clock.
  const dayNum = useMemo(() => {
    const d = new Date(`${reel.reel_date}T12:00:00Z`);
    const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
    return Math.floor((d.getTime() - jan1) / 86_400_000);
  }, [reel.reel_date]);
  const shaped = platformCaption(p, caption, { dayNum, freeGroupUrl, kind: reel.kind });
  const lint = lintCaption(shaped.clipboard, p.tier);
  const gateOk = !p.requiresTwoQuestion || (q1No && q2No);
  // MKT-24: the audience gate is separate from `enabled` — the PLATFORM is fine,
  // this CAPTION is the wrong one for it. Shown with its reason so a refusal
  // reads as a ruling rather than a broken row.
  const accepts = platformAcceptsAudience(p, captionAudience);
  // MKT-37: a tier-1 (public) platform taking a NON-public CUT is the exact
  // mismatch the *_public build exists to prevent — free/pro cuts carry real
  // digits and tier-2 vocabulary and cannot honestly clear Q1. WARN, not
  // block (the operator may have a reason); the 7/30-31 YouTube posts are
  // why this line exists.
  const kindMismatch = p.tier === 1 && !String(reel.kind).endsWith('_public');
  // MKT-15 close (2026-09-02): a platform may declare the reel kinds it takes.
  // YouTube = allday_public ONLY by the operator's standing condition. This is
  // a hard block (unlike kindMismatch's warn): the lane has one cut, one post.
  const kindBarred = Array.isArray(p.kinds) && !p.kinds.includes(String(reel.kind));
  const canSend = p.enabled && !kindBarred && accepts.ok && !busy && gateOk && lint.ok && shaped.clipboard.trim().length > 0;
  const link = platformLink(p, {
    text: shaped.clipboard, title: shaped.title, url: videoUrl,
  });

  const log = useCallback(async () => {
    // platform rides in imageMeta — social_posts.platform is a generated column
    // over it, so this is the field that populates the log (see the MKT-15
    // migration for why it is generated rather than plain).
    await fbPublish.logAssist({
      caption: shaped.clipboard, tier: p.tier, kind: 'reel',
      targetName: p.label,
      imageMeta: {
        files: [filename], video: true, platform: p.id,
        reel_kind: reel.kind, reel_date: reel.reel_date, assisted: 'social_handoff',
      },
    }).catch((e: any) => { console.log('[reels] platform logAssist failed:', e); });
    onLogged();
  }, [shaped.clipboard, p, filename, reel, onLogged]);

  // One tap running all three in sequence — the operator's stated preference.
  // Save FIRST: it is the step that can fail (permissions), and failing before
  // the app opens is far better than opening a composer with nothing to attach.
  const runAll = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Saving video to Photos…');
    try {
      await saveReelToPhotos(videoUrl, filename);
      await Clipboard.setStringAsync(shaped.clipboard);
      openInNewTab(link);
      await log();
      setMsg(`💾 Saved to Photos · caption copied · ${p.label} opened. Attach the video from your camera roll, paste, post.`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [videoUrl, filename, shaped.clipboard, link, log, p.label]);

  const copyOnly = useCallback(async () => {
    await Clipboard.setStringAsync(shaped.clipboard);
    setMsg('📋 Caption copied.');
  }, [shaped.clipboard]);

  return (
    <Card style={{ padding: 10, marginTop: 8, opacity: p.enabled ? 1 : 0.55 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14 }}>{p.icon}</Text>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, flex: 1 }}>{p.label}</Text>
        <Pill label={`tier ${p.tier}`} color={colors.textTertiary} />
        {!p.enabled
          ? <Pill label="disabled" color={colors.textTertiary} />
          : !accepts.ok
            ? <Pill label="wrong draft" color={colors.orange} />
            : <Pill label={lint.ok ? '✓ lint' : `${lint.violations.filter(v => v.blocking).length} blocking`} color={lint.ok ? colors.success : colors.error} />}
      </View>

      {!p.enabled ? (
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6, lineHeight: 15 }}>{p.disabledReason}</Text>
      ) : kindBarred ? (
        <Text style={{ fontSize: 10, color: colors.orange, marginTop: 6, lineHeight: 15 }}>
          🚫 {p.label} takes {p.kinds!.join(' / ')} only (operator ruling 2026-09-02). This row is {String(reel.kind)}.
        </Text>
      ) : !accepts.ok ? (
        <Text style={{ fontSize: 10, color: colors.orange, marginTop: 6, lineHeight: 15 }}>
          🚫 {accepts.reason}
          {reel.caption_pro != null ? ' Switch the target above to 💎 Pro to load it.' : ''}
        </Text>
      ) : (
        <>
          {shaped.title != null && (
            <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }} numberOfLines={2}>
              <Text style={{ fontWeight: '800' }}>Title: </Text>{shaped.title}
            </Text>
          )}
          <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4, lineHeight: 15 }} numberOfLines={4}>
            {shaped.clipboard}
          </Text>
          <Text style={{ fontSize: 9, color: shaped.truncated ? colors.orange : colors.textTertiary, marginTop: 4 }}>
            {shaped.clipboard.length}/{p.maxLen} chars{shaped.truncated ? ' · TRUNCATED to fit' : ''}
            {p.deepLink ? '' : ' · opens the app (no compose deep link)'}
          </Text>
          {lint.violations.filter(v => v.blocking).map((v, i) => (
            <Text key={i} style={{ fontSize: 9, color: colors.error, marginTop: 2 }}>⛔ “{v.term}” ({v.rule})</Text>
          ))}

          {kindMismatch && (
            <Text style={{ fontSize: 9, color: colors.orange, marginTop: 6, lineHeight: 14 }}>
              ⚠ This is the {reel.kind} cut — it carries real digits and tier-2 vocabulary and cannot
              clear Q1 on a public surface. The public build (allday_public: placeholder digits,
              relabelled) exists for exactly this platform.
            </Text>
          )}

          {p.requiresTwoQuestion && (
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }} onPress={() => setQ1No(v => !v)}>
                <Text style={{ fontSize: 13 }}>{q1No ? '☑️' : '⬜'}</Text>
                <Text style={{ fontSize: 9, color: colors.text, flex: 1 }}>Q1 — NO 3-digit numbers visible in any frame</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => setQ2No(v => !v)}>
                <Text style={{ fontSize: 13 }}>{q2No ? '☑️' : '⬜'}</Text>
                <Text style={{ fontSize: 9, color: colors.text, flex: 1 }}>Q2 — NO forbidden vocabulary rendered or spoken</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {Platform.OS !== 'web' ? (
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: canSend ? 1 : 0.5 }]} disabled={!canSend} onPress={runAll}>
                <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : `💾 Save + Copy + Open ${p.label}`}</Text>
              </TouchableOpacity>
            ) : (
              // Web deliberately does NOT duplicate the transient-activation
              // dance: use the reel's own Prepare/Download above for the file.
              <>
                <TouchableOpacity style={[st.btnGhost, { opacity: gateOk ? 1 : 0.5 }]} disabled={!gateOk} onPress={copyOnly}>
                  <Text style={st.btnGhostText}>📋 Copy caption</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnGhost, { opacity: gateOk ? 1 : 0.5 }]} disabled={!gateOk} onPress={() => { openInNewTab(link); void log(); }}>
                  <Text style={st.btnGhostText}>↗ Open {p.label}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {msg && <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 6, lineHeight: 14 }}>{msg}</Text>}
        </>
      )}
    </Card>
  );
}

function ReelCard({ reel, urls, onPosted, expanded, onToggle }: {
  reel: MarketingReel; urls: GroupUrls; onPosted: () => void;
  /** Accordion state lives in the parent: with up to seven reels a day, seven
   *  fully-expanded cards (each with its platform rows) was a wall of scroll.
   *  Collapsed = one tappable summary row; all posting logic renders only when
   *  expanded. Hooks stay unconditional — only the JSX branches. */
  expanded: boolean; onToggle: () => void;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const ui = KIND_UI[reel.kind] ?? FALLBACK_KIND_UI;

  const [caption, setCaption] = useState(reel.caption);
  const [target, setTarget] = useState<Target>(ui.defaultTarget);
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // MKT-15 rows collapsed by default — they are the long tail of the card
  // (one row per registered platform, disabled ones included by design).
  const [showPlatforms, setShowPlatforms] = useState(false);
  // Web lane: the mp4 is fetched into memory FIRST (step 1) so the share /
  // download / group-tab actions each run inside a fresh tap's transient
  // activation — gesture-sensitive APIs silently no-op otherwise.
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const webCanShare = Platform.OS === 'web' && canWebShareVideo();

  const tier = SURFACE_TIER[target];
  const lint = lintCaption(caption, tier);
  const videoUrl = reelPublicUrl(reel.video_path);
  const filename = reel.video_path.split('/').pop() ?? `${reel.kind}_${reel.reel_date}.mp4`;
  const crossBlocked = target === 'cross' && (!q1No || !q2No);
  const canSend = !busy && caption.trim().length > 0 && lint.ok && !crossBlocked;

  const logAndMark = useCallback(async (): Promise<string> => {
    const r = await fbPublish.logAssist({
      caption, tier, kind: 'reel',
      targetName: TARGET_UI[target].name,
      imageMeta: { files: [filename], video: true, reel_kind: reel.kind, reel_date: reel.reel_date },
    });
    try {
      await markReelPosted(reel.id, TARGET_UI[target].name);
      onPosted();
    } catch (e) {
      // The handoff already happened and is logged — a failed status flip is
      // bookkeeping, not a lost post. Surface it without failing the action.
      console.log('[reels] markReelPosted failed:', e);
    }
    return r.duplicateToday
      ? ` ⚠️ This exact caption was already used today (${r.duplicates.map((d: any) => d.target_name).join(', ')}) — vary it before posting elsewhere.`
      : '';
  }, [caption, tier, target, filename, reel, onPosted]);

  // PRIMARY native path: the FB app frequently drops a share-sheet video
  // (composer opens without it), so the dependable flow is camera roll →
  // attach inside Facebook. Copies caption, saves the mp4 to Photos, opens
  // the destination group, logs the handoff.
  const saveAndOpen = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Saving video to Photos…');
    try {
      await Clipboard.setStringAsync(caption);
      await saveReelToPhotos(videoUrl, filename);
      const dest = (target === 'pro' ? urls.pro : urls.free) || 'https://www.facebook.com/groups/';
      if (target !== 'cross') openInNewTab(dest);
      const dupNote = await logAndMark();
      setMsg(`💾 Video saved to Photos · caption copied${target !== 'cross' ? ' · group opened' : ''}. In Facebook: attach the video from your camera roll, paste, post.${dupNote}`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [caption, videoUrl, filename, target, urls, logAndMark]);

  const shareNative = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Fetching video…');
    try {
      await Clipboard.setStringAsync(caption);
      await shareReelToApps(videoUrl, filename);
      const dupNote = await logAndMark();
      setMsg(`📋 Caption copied + video handed over. If Facebook's composer opens WITHOUT the video, use Save to Photos instead.${dupNote}`);
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg('Share cancelled.');
      else setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [caption, videoUrl, filename, logAndMark]);

  // ── Web lane ──
  // Step 1: fetch only — no gesture-sensitive API, so it may take as long as
  // the network needs without costing us the later tap's activation.
  const prepareVideo = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Fetching video…');
    try {
      const blob = await fetchReelBlob(videoUrl);
      setVideoBlob(blob);
      setMsg(`✅ Video ready (${(blob.size / 1e6).toFixed(1)}MB) — now Save/Share or Download below.`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [videoUrl]);

  // Step 2a (mobile web): native sheet with the actual file — on iPhone the
  // sheet's "Save Video" writes it to Photos; Facebook is a direct target too.
  // Clipboard + share fire immediately on the tap, before any await.
  const saveShareWeb = useCallback(async () => {
    if (!videoBlob) return;
    setBusy(true);
    try {
      Clipboard.setStringAsync(caption).catch(() => {});
      await webShareReel(videoBlob, filename);
      const dupNote = await logAndMark();
      setMsg(`💾 Caption copied. In the sheet: "Save Video" puts it in Photos, or share straight into Facebook — then paste, post.${dupNote}`);
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg('Share cancelled — the video stays prepared.');
      else setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [videoBlob, caption, filename, logAndMark]);

  // Step 2b (desktop web): object-URL download, synchronous inside the tap.
  const downloadWeb = useCallback(async () => {
    if (!videoBlob) return;
    setBusy(true);
    try {
      downloadReelBlobWeb(videoBlob, filename);
      Clipboard.setStringAsync(caption).catch(() => {});
      const dupNote = await logAndMark();
      setMsg(`⬇️ Video downloading · caption copied. Attach the mp4 in the composer, paste, post.${dupNote}`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [videoBlob, caption, filename, logAndMark]);

  // Its own button so window.open runs synchronously inside the tap — bundling
  // it after an await was exactly what the popup blocker ate.
  const openGroup = useCallback(() => {
    openInNewTab((target === 'pro' ? urls.pro : urls.free) || 'https://www.facebook.com/groups/');
  }, [target, urls]);

  // Collapsed: one summary row — everything the operator needs to decide
  // whether to open it (which reel, posted where, how stale), nothing else.
  if (!expanded) {
    return (
      <TouchableOpacity onPress={onToggle}>
        <Card style={{ padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 16 }}>{ui.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text }}>{ui.label}</Text>
            <Text style={{ fontSize: 9, color: colors.textTertiary }}>
              {reel.reel_date}{reel.duration_s ? ` · ${reel.duration_s}s` : ''} · uploaded {timeAgo(reel.created_at)}
            </Text>
          </View>
          {reel.status === 'posted'
            ? <Pill label={`✓ ${reel.target_name ?? 'posted'}`} color={colors.success} />
            : <Pill label="ready" color={colors.gold} />}
          <Text style={{ fontSize: 12, color: colors.textTertiary }}>▸</Text>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <Card style={{ padding: 12, marginBottom: 14 }}>
      {/* header — tapping it collapses the card back to its summary row */}
      <TouchableOpacity onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 16 }}>{ui.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>{ui.label}</Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>
            {reel.reel_date}{reel.duration_s ? ` · ${reel.duration_s}s` : ''} · uploaded {timeAgo(reel.created_at)}
          </Text>
        </View>
        {reel.status === 'posted'
          ? <Pill label={`✓ posted → ${reel.target_name ?? '?'}${reel.posted_at ? ` · ${timeAgo(reel.posted_at)}` : ''}`} color={colors.success} />
          : <Pill label="ready" color={colors.gold} />}
        <Text style={{ fontSize: 12, color: colors.textTertiary }}>▾</Text>
      </TouchableOpacity>

      {/* contact-sheet storyboard + watch links */}
      {reel.sheet_path && (
        <ExpoImage
          source={{ uri: reelPublicUrl(reel.sheet_path) }}
          style={{ width: '100%', aspectRatio: ui.sheetAspect, borderRadius: 8, backgroundColor: colors.surfaceLight, marginBottom: 8 }}
          contentFit="contain"
        />
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <TouchableOpacity style={st.btnGhost} onPress={() => openInNewTab(videoUrl)}>
          <Text style={st.btnGhostText}>▶ Watch 9:16</Text>
        </TouchableOpacity>
        {reel.video_1x1_path && (
          <TouchableOpacity style={st.btnGhost} onPress={() => openInNewTab(reelPublicUrl(reel.video_1x1_path!))}>
            <Text style={st.btnGhostText}>▶ 1:1 cut</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* target — rows carrying a pro draft (verify) swap the caption to the
          matching variant on switch: free draft is qualitative, pro draft has
          the real numbers (MKT-05b). Allday rows keep the edit in place. */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {(Object.keys(TARGET_UI) as Target[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[st.optBtn, target === t && st.optBtnOn]}
            onPress={() => {
              setTarget(t); setQ1No(false); setQ2No(false); setMsg(null);
              if (reel.caption_pro) setCaption(t === 'pro' ? reel.caption_pro : reel.caption);
            }}
          >
            <Text style={[st.optBtnText, target === t && st.optBtnTextOn]}>{TARGET_UI[t].label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {reel.caption_pro != null && (
        <Text style={{ fontSize: 9, color: colors.textTertiary, marginBottom: 6, marginTop: -2 }}>
          This reel has two caption drafts — switching Free/Pro loads the matching one (Pro carries the real numbers).
        </Text>
      )}

      {/* caption + lint */}
      <TextInput
        style={[st.csvInput, { minHeight: 90, height: undefined, fontSize: 12, lineHeight: 17 }]}
        value={caption}
        onChangeText={setCaption}
        multiline
        textAlignVertical="top"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <Pill label={`tier ${tier}`} color={colors.textTertiary} />
        <Pill label={lint.ok ? '✓ lint clean' : `${lint.violations.filter(v => v.blocking).length} blocking`} color={lint.ok ? colors.success : colors.error} />
      </View>
      {lint.violations.length > 0 && (
        <Card style={{ padding: 8, marginTop: 6, backgroundColor: colors.errorLight, borderColor: colors.error + '33' }}>
          {lint.violations.map((v, i) => (
            <Text key={i} style={{ fontSize: 10, color: v.blocking ? colors.error : colors.orange, lineHeight: 15 }}>
              {v.blocking ? '⛔' : '⚠️'} “{v.term}” ({v.rule}){v.suggestion ? ` → ${v.suggestion}` : ''}
            </Text>
          ))}
        </Card>
      )}

      {/* Two-Question filter — v2 brief mandates the NO/NO ack for cross-posts
          (content leaving surfaces we control). Reels carry full digits, so a
          cross-post honestly fails Q1 — that is the filter working. */}
      {target === 'cross' && (
        <Card style={{ padding: 10, marginTop: 8, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: colors.gold, marginBottom: 6 }}>TWO-QUESTION FILTER — both must be NO to cross-post</Text>
          {!String(reel.kind).endsWith('_public') && (
            // MKT-37: kind guard at the handoff — a non-public cut on a
            // surface we don't control carries real digits and cannot
            // honestly clear Q1. WARN, not block.
            <Text style={{ fontSize: 9, color: colors.orange, marginBottom: 6, lineHeight: 14 }}>
              ⚠ This is the {reel.kind} cut. It carries real digits, so Q1 cannot honestly be NO —
              the public build (allday_public) is the one made for surfaces we don’t control.
            </Text>
          )}
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }} onPress={() => setQ1No(v => !v)}>
            <Text style={{ fontSize: 14 }}>{q1No ? '☑️' : '⬜'}</Text>
            <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q1 — NO 3-digit numbers are visible in any frame of the video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} onPress={() => setQ2No(v => !v)}>
            <Text style={{ fontSize: 14 }}>{q2No ? '☑️' : '⬜'}</Text>
            <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q2 — NO forbidden vocabulary is rendered or spoken in the video</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* actions — assisted lane only (Groups have no publish API). Native
          primary = Save to Photos: the FB composer reliably attaches from the
          camera roll but often drops a share-sheet video. Web = two steps:
          Prepare fetches the mp4, then Save/Share / Download / Group each run
          on a fresh tap (transient activation — see web-lane note above). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {Platform.OS !== 'web' ? (
          <>
            <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: canSend ? 1 : 0.5 }]} disabled={!canSend} onPress={saveAndOpen}>
              <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : '💾 Save to Photos + Open Group'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.btnGhost, { opacity: canSend ? 1 : 0.5 }]} disabled={!canSend} onPress={shareNative}>
              <Text style={st.btnGhostText}>📤 Share…</Text>
            </TouchableOpacity>
          </>
        ) : videoBlob === null ? (
          <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: busy ? 0.5 : 1 }]} disabled={busy} onPress={prepareVideo}>
            <Text style={st.btnPrimaryText}>{busy ? '⏳ Fetching…' : '⬇️ Prepare Video (step 1 of 2)'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            {webCanShare && (
              <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: canSend ? 1 : 0.5 }]} disabled={!canSend} onPress={saveShareWeb}>
                <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : '💾 Save / Share Video'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[webCanShare ? st.btnGhost : st.btnPrimary, !webCanShare && { flex: 1 }, { opacity: canSend ? 1 : 0.5 }]}
              disabled={!canSend}
              onPress={downloadWeb}
            >
              <Text style={webCanShare ? st.btnGhostText : st.btnPrimaryText}>⬇️ Download mp4</Text>
            </TouchableOpacity>
            {target !== 'cross' && (
              <TouchableOpacity style={st.btnGhost} onPress={openGroup}>
                <Text style={st.btnGhostText}>↗ Group</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {msg && <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 8, lineHeight: 15 }}>{msg}</Text>}

      {/* MKT-15 — assisted handoff to the other platforms. Same lane as the FB
          rows above (save → copy → open → finish by hand), one row per
          registered platform, disabled ones shown with their reason. Behind a
          disclosure: with seven reels a day, seven always-open platform lists
          (~49 rows) buried the Facebook lane the operator uses every morning. */}
      <TouchableOpacity
        onPress={() => setShowPlatforms(v => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}
      >
        <Text style={{ fontSize: 10, color: colors.textTertiary }}>{showPlatforms ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1 }}>
          OTHER PLATFORMS — ASSISTED HANDOFF ({PLATFORM_IDS.filter(id => SOCIAL_PLATFORMS[id].enabled).length} enabled of {PLATFORM_IDS.length})
        </Text>
      </TouchableOpacity>
      {showPlatforms && PLATFORM_IDS.map(id => (
        <PlatformHandoffRow
          key={id}
          platform={SOCIAL_PLATFORMS[id]}
          reel={reel}
          caption={caption}
          // Which draft is LOADED, not which kind this is: a verify row switched
          // to Pro is carrying the pro draft and is legitimately Pro-room copy.
          // Derived from the toggle rather than by comparing text, so an operator
          // edit to the pro draft does not silently re-classify it as free.
          captionAudience={target === 'pro' && reel.caption_pro != null ? 'pro' : REEL_KIND_AUDIENCE[reel.kind]}
          videoUrl={videoUrl}
          filename={filename}
          freeGroupUrl={urls.free}
          onLogged={onPosted}
        />
      ))}
    </Card>
  );
}

/**
 * Social brief PNG export, in the posting flow instead of a detour through the
 * Publish console — the reel and the brief card go to the same rooms in the
 * same session. Variants mirror PublishView's generateBriefImage exactly:
 * public (aggregate only, no digits), free group (Pro CTA footer), pro group
 * (MKT-50 depth panels). Capture = same offscreen-stage pattern; translate
 * (not extreme offset) keeps the node painted so the PNG isn't blank.
 */
const BRIEF_TIERS = [
  { key: 'pro', label: '💎 Pro', variant: 'group', groupTier: 'pro' },
  { key: 'free', label: '👥 Free', variant: 'group', groupTier: 'free' },
  { key: 'public', label: '📡 Public', variant: 'public', groupTier: undefined },
] as const;
type BriefTier = (typeof BRIEF_TIERS)[number];

/**
 * MKT-33 captions sheet — the reel card's save/share lane applied to the PDF.
 *
 * Native: straight to the OS share sheet. A PDF has no camera-roll destination
 * (MediaLibrary rejects non-media), so the sheet IS its save path — "Save to
 * Files", Books, Mail.
 *
 * Web: two-step for the same reason the video lane is two-step — the fetch
 * outlives the tap's transient activation, so Prepare loads the blob and the
 * follow-up buttons each run inside a fresh gesture.
 */
function CaptionsPdfExport({ url, filename }: { url: string; filename: string }) {
  const { colors } = useTheme();
  const st = useSt();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const webCanShare = Platform.OS === 'web' && canWebSharePdf();

  const shareNative = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Fetching PDF…');
    try {
      await shareAssetToApps(url, filename, 'application/pdf');
      setMsg('📤 Handed to the share sheet — "Save to Files" keeps a copy on the device.');
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg('Share cancelled.');
      else setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [url, filename]);

  const prepare = useCallback(async () => {
    setBusy(true);
    setMsg('⏳ Fetching PDF…');
    try {
      const b = await fetchAssetBlob(url, 'Captions PDF');
      setPdfBlob(b);
      setMsg(`✅ PDF ready (${(b.size / 1e6).toFixed(2)}MB) — now Save/Share or Download.`);
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [url]);

  const saveShareWeb = useCallback(async () => {
    if (!pdfBlob) return;
    setBusy(true);
    try {
      await webShareFile(pdfBlob, filename, 'application/pdf');
      setMsg('💾 In the sheet: "Save to Files" stores it on the device.');
    } catch (e: any) {
      if (e?.name === 'AbortError') setMsg('Share cancelled — the PDF stays prepared.');
      else setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [pdfBlob, filename]);

  const download = useCallback(() => {
    if (!pdfBlob) return;
    downloadBlobWeb(pdfBlob, filename);
    setMsg(`⬇️ ${filename} downloading.`);
  }, [pdfBlob, filename]);

  return (
    <Card style={{ padding: 10, marginBottom: 10 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button">
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>
          🧾 Captions sheet — PDF {open ? '▾' : '▸'}
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, lineHeight: 13, marginBottom: 8 }}>
            Every caption from today’s run in one sheet, plus the page-1 posting schedule.
            {Platform.OS === 'web'
              ? ' Prepare loads the file, then Save/Share hands it to the OS sheet or Download writes it to disk.'
              : ' Share hands the file to the OS sheet — “Save to Files” keeps a copy on the device.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <TouchableOpacity style={st.btnGhost} onPress={() => openInNewTab(url)}>
              <Text style={st.btnGhostText}>👁 Open</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' ? (
              <TouchableOpacity style={[st.btnPrimary, busy && { opacity: 0.5 }]} disabled={busy} onPress={shareNative}>
                <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : '📤 Share PDF…'}</Text>
              </TouchableOpacity>
            ) : !pdfBlob ? (
              <TouchableOpacity style={[st.btnPrimary, busy && { opacity: 0.5 }]} disabled={busy} onPress={prepare}>
                <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : '① Prepare PDF'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                {webCanShare && (
                  <TouchableOpacity style={[st.btnPrimary, busy && { opacity: 0.5 }]} disabled={busy} onPress={saveShareWeb}>
                    <Text style={st.btnPrimaryText}>{busy ? '⏳ …' : '💾 Save / Share PDF'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={webCanShare ? st.btnGhost : st.btnPrimary} onPress={download}>
                  <Text style={webCanShare ? st.btnGhostText : st.btnPrimaryText}>⬇ Download PDF</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {msg && <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>{msg}</Text>}
        </View>
      )}
    </Card>
  );
}

function SocialBriefExport() {
  const { colors } = useTheme();
  const st = useSt();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [briefData, setBriefData] = useState<SocialBriefData | null>(null);
  const [render, setRender] = useState<{ variant: 'public' | 'group'; groupTier?: 'free' | 'pro' } | null>(null);
  const [img, setImg] = useState<{ label: string; filename: string; dataUrl: string } | null>(null);
  const briefRef = useRef<View | null>(null);
  const canShare = useMemo(() => shareToPhotosAvailable(), []);

  const generate = useCallback(async (t: BriefTier, fresh?: SocialBriefData | null) => {
    if (busy) return;
    if (!captureAvailable()) { setMsg('❌ Image capture is unavailable in this runtime.'); return; }
    setBusy(t.key); setImg(null); setMsg('Assembling brief data…');
    try {
      // Data is variant-independent, so one build serves all three tiers; the
      // ↻ button rebuilds when draws have landed since.
      const data = fresh ?? briefData ?? await buildSocialBrief();
      setBriefData(data);
      setRender({ variant: t.variant, groupTier: t.groupTier });
      setMsg('Rendering card…');
      await raf(); await waitFonts(); await raf();
      const node = Platform.OS === 'web' ? resolveWebNode(briefRef) : briefRef.current;
      if (!node) throw new Error('Brief capture stage not mounted');
      const dataUrl = await captureNodeToPngNatural(node, 2);
      const filename = `hm-brief-${t.key}-${getTodayET()}.png`;
      setImg({ label: t.label, filename, dataUrl });
      if (Platform.OS === 'web') {
        downloadDataUrl(dataUrl, filename);
        setMsg(`✅ ${t.label} brief downloaded — ${filename}. Save / Share hands the same PNG to the OS sheet.`);
      } else {
        // AWAITED, unlike downloadDataUrl's fire-and-forget native branch: a
        // denied Photos permission used to console.warn while the operator was
        // told "saved to Photos". The claim now matches what actually happened.
        await saveDataUrlToPhotos(dataUrl, filename);
        setMsg(`✅ ${t.label} brief saved to Photos — or tap Share… to hand it straight to Facebook.`);
      }
    } catch (e: any) {
      setMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setRender(null);
      setBusy(null);
    }
  }, [busy, briefData]);

  return (
    <Card style={{ padding: 10, marginBottom: 10 }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button">
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>
          📰 Social brief — PNG {open ? '▾' : '▸'}
        </Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 9, color: colors.textTertiary, lineHeight: 13, marginBottom: 8 }}>
            Same card the Publish console builds — tap a tier to capture it, then save or hand it
            to the OS share sheet.
            Pro carries the MKT-50 depth panels; Free adds the Pro CTA footer; Public is
            aggregate-only (no digits, no state codes) and is the only cut safe outside the groups.
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {BRIEF_TIERS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[st.btnGhost, busy === t.key && { opacity: 0.5 }]}
                disabled={!!busy}
                onPress={() => generate(t)}
              >
                <Text style={st.btnGhostText}>{busy === t.key ? '⏳' : '⬇'} {t.label}</Text>
              </TouchableOpacity>
            ))}
            {briefData && (
              <TouchableOpacity
                style={[st.btnGhost, !!busy && { opacity: 0.5 }]}
                disabled={!!busy}
                onPress={() => {
                  setBriefData(null); setImg(null);
                  setMsg('Data cleared — next tap rebuilds from live tables.');
                }}
              >
                <Text style={st.btnGhostText}>↻ Rebuild data</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Same save/share lane the reel cards use, on both platforms: web
              gets download + the OS sheet, native gets camera roll + the OS
              sheet (which is where Facebook lives). */}
          {img && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {Platform.OS === 'web' ? (
                <TouchableOpacity style={st.btnGhost} onPress={() => downloadDataUrl(img.dataUrl, img.filename)}>
                  <Text style={st.btnGhostText}>⬇ Download again</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={st.btnGhost}
                  onPress={() => saveDataUrlToPhotos(img.dataUrl, img.filename)
                    .then(() => setMsg(`💾 ${img.label} brief saved to Photos — ${img.filename}`))
                    .catch((e: any) => setMsg(`❌ Save to Photos failed: ${String(e?.message ?? e)}`))}
                >
                  <Text style={st.btnGhostText}>📲 Save to Photos</Text>
                </TouchableOpacity>
              )}
              {canShare && (
                <TouchableOpacity
                  style={st.btnGhost}
                  onPress={() => shareDataUrlToApps(img.dataUrl, img.filename).catch((e: any) => {
                    if (e?.name !== 'AbortError') setMsg(`❌ Share failed: ${String(e?.message ?? e)}`);
                  })}
                >
                  <Text style={st.btnGhostText}>{Platform.OS === 'web' ? '📤 Save / Share' : '📤 Share…'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {msg && <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 6 }}>{msg}</Text>}
        </View>
      )}
      {/* hidden capture stage — mirrors PublishView's brief stage */}
      {render && briefData && (
        <View style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: 5000 }] as any, pointerEvents: 'none' }} collapsable={false}>
          <SocialBriefCard ref={briefRef} data={briefData} variant={render.variant} groupTier={render.groupTier} />
        </View>
      )}
    </Card>
  );
}

export default function ReelsView() {
  const { colors } = useTheme();
  const st = useSt();
  const [reels, setReels] = useState<MarketingReel[] | null>(null);
  const [urls, setUrls] = useState<GroupUrls>({});
  const [error, setError] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  // Accordion: at most one card open. Until the operator touches it, the first
  // unposted reel of the current run is auto-expanded — land on the screen and
  // the next actionable reel is already open.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ready' | 'posted'>('all');
  const [schedOpen, setSchedOpen] = useState(false);

  // "Current" = produced by TODAY'S RUN, keyed on updated_at — NOT on
  // reel_date. The verify reel is dated D−1 BY DESIGN (it grades yesterday), so
  // a reel_date filter hides every verify reel forever, which is exactly the
  // bug this replaced. updated_at is the honest signal: the publisher stamps it
  // on every upload, so it answers "did this morning's run produce this?"
  // regardless of which date the content is about.
  const etDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const isCurrent = (r: MarketingReel) => etDay(r.updated_at) === todayET;
  const current = (reels ?? []).filter(isCurrent);
  const older = (reels ?? []).filter(r => !isCurrent(r));

  // Same composite the remount key uses, so expansion survives nothing it
  // shouldn't: a server-side caption refresh changes updated_at and the card
  // both remounts AND re-collapses, which is correct — it is a new upload.
  const keyOf = (r: MarketingReel) => `${r.id}:${r.updated_at}`;
  const firstReady = current.find(r => r.status !== 'posted');
  const effectiveExpanded = touched ? expandedKey : (firstReady ? keyOf(firstReady) : null);
  const toggle = (k: string) => { setTouched(true); setExpandedKey(effectiveExpanded === k ? null : k); };
  const postedCount = current.filter(r => r.status === 'posted').length;
  const shown = filter === 'all' ? current : current.filter(r => (filter === 'posted') === (r.status === 'posted'));

  // MKT-33 — the day captions sheet: one PDF with every caption from today's
  // run, written by publish-reels to captions/<YYYYMMDD>.pdf in the public
  // bucket. Shown only when the object actually exists (HEAD probe) — a dead
  // download button on a morning the publisher hasn't run yet is worse than
  // no button.
  const captionsPdfUrl = reelPublicUrl(`captions/${todayET.replace(/-/g, '')}.pdf`);
  const [captionsPdfOk, setCaptionsPdfOk] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReels(await fetchReels());
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setReels([]);
    }
    try {
      const head = await fetch(captionsPdfUrl, { method: 'HEAD' });
      setCaptionsPdfOk(head.ok);
    } catch { setCaptionsPdfOk(false); }
  }, [captionsPdfUrl]);

  useEffect(() => {
    load();
    (async () => {
      try {
        const rows = await fetchFromSupabase<{ key: string; value: any }[]>({
          path: '/rest/v1/app_config?key=in.(social_free_group_url,social_pro_url)&select=key,value',
        });
        const map: GroupUrls = {};
        (rows ?? []).forEach(r => {
          const v = typeof r.value === 'string' ? r.value.replace(/^"|"$/g, '') : String(r.value ?? '');
          if (r.key === 'social_free_group_url') map.free = v;
          if (r.key === 'social_pro_url') map.pro = v;
        });
        setUrls(map);
      } catch { /* group links optional — buttons fall back to /groups/ */ }
    })();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <View style={{ flex: 1 }}><SectionTitle>🎬 REELS — PIPELINE OUTPUT</SectionTitle></View>
        {captionsPdfOk && (
          <TouchableOpacity style={[st.btnGhost, { marginRight: 6 }]} onPress={() => openInNewTab(captionsPdfUrl)}>
            <Text style={st.btnGhostText}>🧾 Captions PDF</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={st.btnGhost} onPress={load}>
          <Text style={st.btnGhostText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 9, color: colors.textTertiary, marginBottom: 14, lineHeight: 13 }}>
        Populated by npm run reel:allday / reel:verify. Storyboard = contact sheet; ▶ opens the mp4.
        Flow: pick target → edit caption (lint gates it) → on device: Save to Photos + attach inside
        Facebook; on web: Prepare Video, then Save/Share (phone sheet → “Save Video” = Photos) or
        Download (desktop). Handoffs are logged; storage self-prunes after 30 days.
        This run’s reels show by default — earlier ones are one tap below. (The verify reel is
        dated yesterday by design: it grades yesterday’s board.) Tap a row to open or close it;
        the next unposted reel opens automatically.
      </Text>

      {reels === null && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 30 }} />}
      {error && (
        <Card style={{ padding: 10, marginBottom: 10, backgroundColor: colors.errorLight, borderColor: colors.error + '33' }}>
          <Text style={{ fontSize: 11, color: colors.error }}>Load failed: {error}</Text>
        </Card>
      )}
      {reels?.length === 0 && !error && (
        <Card style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>No reels registered yet — run npm run reel:allday or reel:verify.</Text>
        </Card>
      )}

      {/* Posting progress for this run — the morning's answer to "what's left?"
          at a glance: one tick per reel, green when it has gone out. */}
      {current.length > 0 && (
        <Card style={{ padding: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: postedCount === current.length ? colors.success : colors.text }}>
              {postedCount === current.length ? '✅' : '📤'} {postedCount} of {current.length} posted
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {current.map(r => {
                const ui = KIND_UI[r.kind] ?? FALLBACK_KIND_UI;
                const posted = r.status === 'posted';
                return (
                  <TouchableOpacity key={keyOf(r)} onPress={() => toggle(keyOf(r))}>
                    <Text style={{ fontSize: 11, opacity: posted ? 1 : 0.85 }}>
                      {ui.icon}{posted ? '✓' : '·'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(['all', 'ready', 'posted'] as const).map(f => (
                <TouchableOpacity key={f} style={[st.optBtn, filter === f && st.optBtnOn]} onPress={() => setFilter(f)}>
                  <Text style={[st.optBtnText, filter === f && st.optBtnTextOn]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Card>
      )}

      {/* Posting schedule (v1) — collapsed by default so the pipeline stays
          the screen's subject; the full verbatim text is page 1 of the
          Captions PDF. Mirror of assets/marketing/POSTING_SCHEDULE.txt. */}
      <Card style={{ padding: 10, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setSchedOpen(o => !o)} accessibilityRole="button">
          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text }}>
            📋 Posting schedule — 5 sessions, ET {schedOpen ? '▾' : '▸'}
          </Text>
        </TouchableOpacity>
        {schedOpen && (
          <View style={{ marginTop: 8, gap: 8 }}>
            {POSTING_SESSIONS.map(s => (
              <View key={s.time}>
                <Text style={{ fontSize: 11, color: colors.text }}>
                  <Text style={{ fontWeight: '800' }}>{s.time}</Text>
                  {'  '}{s.title}
                  {s.kinds.length > 0 && (
                    <Text style={{ color: colors.textSecondary }}>
                      {'  ·  '}
                      {s.kinds.map(k => `${(KIND_UI[k as ReelKind] ?? FALLBACK_KIND_UI).icon} ${(KIND_UI[k as ReelKind] ?? FALLBACK_KIND_UI).label}`).join('  →  ')}
                    </Text>
                  )}
                </Text>
                {s.deadline && <Text style={{ fontSize: 9.5, color: colors.warning ?? colors.textTertiary, lineHeight: 13, marginTop: 1 }}>⏰ {s.deadline}</Text>}
                {s.note && <Text style={{ fontSize: 9.5, color: colors.textTertiary, lineHeight: 13, marginTop: 1 }}>{s.note}</Text>}
              </View>
            ))}
            <Text style={{ fontSize: 9.5, color: colors.textTertiary, lineHeight: 13 }}>{SCHEDULE_SKIP_ORDER}</Text>
          </View>
        )}
      </Card>

      {/* Captions PDF + social brief PNG — save/share without leaving the
          posting flow, same lane as the reel cards below. */}
      {captionsPdfOk && (
        <CaptionsPdfExport url={captionsPdfUrl} filename={`hm-captions-${todayET}.pdf`} />
      )}
      <SocialBriefExport />

      {/* Key includes updated_at: a server-side caption refresh (pipeline
          --captions-only, re-publish) must remount the card so the editor
          re-seeds — useState(reel.caption) only reads the prop on mount. */}
      {shown.map(r => (
        <ReelCard
          key={keyOf(r)} reel={r} urls={urls} onPosted={load}
          expanded={effectiveExpanded === keyOf(r)} onToggle={() => toggle(keyOf(r))}
        />
      ))}
      {reels !== null && current.length > 0 && shown.length === 0 && (
        <Card style={{ padding: 12, alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>No {filter} reels in this run.</Text>
        </Card>
      )}

      {reels !== null && current.length === 0 && older.length > 0 && (
        <Card style={{ padding: 14, alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center' }}>
            No reels for today yet — run npm run reel:allday.
          </Text>
        </Card>
      )}

      {older.length > 0 && (
        <>
          <TouchableOpacity
            style={[st.btnGhost, { marginTop: 6, alignSelf: 'center' }]}
            onPress={() => setShowOlder(v => !v)}
          >
            <Text style={st.btnGhostText}>
              {showOlder ? '▲ Hide' : `▼ Show`} {older.length} earlier reel{older.length === 1 ? '' : 's'}
            </Text>
          </TouchableOpacity>
          {showOlder && older.map(r => (
            <ReelCard
              key={keyOf(r)} reel={r} urls={urls} onPosted={load}
              expanded={effectiveExpanded === keyOf(r)} onToggle={() => toggle(keyOf(r))}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}
