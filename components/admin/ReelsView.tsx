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

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Linking } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { lintCaption } from '@/lib/social/brandLint';
import { SURFACE_TIER } from '@/lib/social/captions';
import { fbPublish } from '@/lib/social/fbPublishClient';
import {
  MarketingReel, ReelKind, fetchReels, reelPublicUrl,
  markReelPosted, shareReelToApps, saveReelToPhotos,
  fetchReelBlob, canWebShareVideo, webShareReel, downloadReelBlobWeb,
} from '@/lib/marketingReels';
import { Pill, SectionTitle, Card, useSt, timeAgo } from './AdminShared';
import {
  SOCIAL_PLATFORMS, PLATFORM_IDS, platformCaption, platformLink,
  type SocialPlatform,
} from '@/constants/socialPlatforms';

type Target = 'free' | 'pro' | 'cross';

const KIND_UI: Record<ReelKind, { icon: string; label: string; defaultTarget: Target; sheetAspect: number }> = {
  // sheetAspect = frames × (270/480) — the assemblers hstack fixed 270×480 frames.
  allday_pro: { icon: '💎', label: 'All-Day · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
  allday_free: { icon: '👥', label: 'All-Day · Free', defaultTarget: 'free', sheetAspect: 6 * (270 / 480) },
  verify: { icon: '🧾', label: 'Receipts · Verify', defaultTarget: 'free', sheetAspect: 4 * (270 / 480) },
  // MKT-13 session wave. Pro-only: the free group gets midday/evening redacted,
  // so these default to the pro group rather than free.
  midday_pro: { icon: '☀️', label: 'Midday · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
  evening_pro: { icon: '🌙', label: 'Evening · Pro', defaultTarget: 'pro', sheetAspect: 6 * (270 / 480) },
};

/** A kind with no UI entry would crash the whole Reels tab on `ui.defaultTarget`
 *  rather than degrading to one unrenderable card. Fall back instead. */
const FALLBACK_KIND_UI = { icon: '🎬', label: 'Reel', defaultTarget: 'pro' as Target, sheetAspect: 6 * (270 / 480) };

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
  platform: p, reel, caption, videoUrl, filename, onLogged,
}: {
  platform: SocialPlatform;
  reel: MarketingReel;
  caption: string;
  videoUrl: string;
  filename: string;
  onLogged: () => void;
}) {
  const { colors } = useTheme();
  const st = useSt();
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const shaped = platformCaption(p, caption);
  const lint = lintCaption(shaped.clipboard, p.tier);
  const gateOk = !p.requiresTwoQuestion || (q1No && q2No);
  const canSend = p.enabled && !busy && gateOk && lint.ok && shaped.clipboard.trim().length > 0;
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
        {p.enabled
          ? <Pill label={lint.ok ? '✓ lint' : `${lint.violations.filter(v => v.blocking).length} blocking`} color={lint.ok ? colors.success : colors.error} />
          : <Pill label="disabled" color={colors.textTertiary} />}
      </View>

      {!p.enabled ? (
        <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6, lineHeight: 15 }}>{p.disabledReason}</Text>
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

function ReelCard({ reel, urls, onPosted }: { reel: MarketingReel; urls: GroupUrls; onPosted: () => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const ui = KIND_UI[reel.kind] ?? FALLBACK_KIND_UI;

  const [caption, setCaption] = useState(reel.caption);
  const [target, setTarget] = useState<Target>(ui.defaultTarget);
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
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

  return (
    <Card style={{ padding: 12, marginBottom: 14 }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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
      </View>

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
          registered platform, disabled ones shown with their reason. */}
      <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, marginTop: 14, letterSpacing: 1 }}>
        OTHER PLATFORMS — ASSISTED HANDOFF
      </Text>
      {PLATFORM_IDS.map(id => (
        <PlatformHandoffRow
          key={id}
          platform={SOCIAL_PLATFORMS[id]}
          reel={reel}
          caption={caption}
          videoUrl={videoUrl}
          filename={filename}
          onLogged={onPosted}
        />
      ))}
    </Card>
  );
}

export default function ReelsView() {
  const { colors } = useTheme();
  const st = useSt();
  const [reels, setReels] = useState<MarketingReel[] | null>(null);
  const [urls, setUrls] = useState<GroupUrls>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReels(await fetchReels());
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setReels([]);
    }
  }, []);

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
        <TouchableOpacity style={st.btnGhost} onPress={load}>
          <Text style={st.btnGhostText}>↻ Refresh</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 9, color: colors.textTertiary, marginBottom: 14, lineHeight: 13 }}>
        Populated by npm run reel:allday / reel:verify. Storyboard = contact sheet; ▶ opens the mp4.
        Flow: pick target → edit caption (lint gates it) → on device: Save to Photos + attach inside
        Facebook; on web: Prepare Video, then Save/Share (phone sheet → “Save Video” = Photos) or
        Download (desktop). Handoffs are logged; storage self-prunes after 30 days.
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
      {/* Key includes updated_at: a server-side caption refresh (pipeline
          --captions-only, re-publish) must remount the card so the editor
          re-seeds — useState(reel.caption) only reads the prop on mount. */}
      {reels?.map(r => <ReelCard key={`${r.id}:${r.updated_at}`} reel={r} urls={urls} onPosted={load} />)}
    </ScrollView>
  );
}
