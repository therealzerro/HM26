/**
 * PublishView — operator social publishing console (SOCIAL-01 / SOCIAL-02).
 *
 * One screen, two publishing lanes, one safety engine, full image integration:
 *  - PAGE lane (Tier 1): text posts AND brand-safe brief images published
 *    directly via the fb-publish edge function → Meta Graph API. Page images
 *    are limited to the SocialBriefCard PUBLIC variant (aggregate only — no
 *    digits/states/attribution by construction) and gated by the mandatory
 *    Two-Question filter (both answers must be an explicit NO).
 *  - GROUP lane (Tiers 2/3/4): Meta removed the Groups API in April 2024, so
 *    this is the industry-standard assisted flow — but the post kit is built
 *    IN PLACE: slate composite + all 6 pick posters + group brief card are
 *    captured here (same 1080×1920 reel pipeline as admin image-export),
 *    caption goes to the clipboard, Facebook opens, the operator pastes.
 *    Every handoff is logged (same-day duplicate-caption check, Tier-3 rule).
 *
 * Surface discipline (2026-06-29 spec §6): PUBLIC + cross-post assets use the
 * redacted (mosaic-picks) variant with the JOIN FREE banner; FREE/PRO get
 * full fidelity. Captions are linted live at the destination tier.
 *
 * Admin surface — brand-voice display rules do not apply here, but the
 * CONTENT this produces is public-facing and fully governed by the brief.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, Image as RNImage } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { lintCaption, LintResult } from '@/lib/social/brandLint';
import { generateCaption, CaptionKind, CaptionData, KIND_TIER, KIND_LABELS } from '@/lib/social/captions';
import { fetchReportCardData } from '@/lib/social/reportCard';
import { buildSocialBrief, SocialBriefData } from '@/lib/social/socialBrief';
import { fbPublish, PageStatus } from '@/lib/social/fbPublishClient';
import {
  loadSlatePicks, raf, waitFonts, getStageNode, surfaceRedacts,
  type SocialSession, type Surface,
} from '@/lib/social/publishImages';
import {
  captureAvailable, captureNodeToPng, captureNodeToPngNatural,
  downloadDataUrl, downloadAllSequential, shareToPhotosAvailable, shareDataUrlToPhotos,
  buildFilename,
} from '@/lib/captureExportImage';
import { fetchPairScores } from '@/lib/pairUtils';
import type { PickItem } from '@/components/PickCard';
import { PublishStage } from '@/components/social/PublishStage';
import { SocialBriefCard } from '@/components/social/SocialBriefCard';
import { AdminKeyMissingError } from '@/lib/subscriberAdminClient';
import { AdminKeyGate } from './AdminKeyGate';
import { Pill, SectionTitle, Card, useSt, timeAgo } from './AdminShared';

const KINDS: CaptionKind[] = ['report_card', 'signal_announce', 'group_drop', 'cross_post', 'pro_drop'];
const PAGE_KINDS = new Set<CaptionKind>(['report_card', 'signal_announce']);

/** Which surface each caption kind publishes to (drives redaction + kit shape). */
const KIND_SURFACE: Record<CaptionKind, Surface> = {
  report_card: 'public',
  signal_announce: 'public',
  group_drop: 'free',
  cross_post: 'cross',
  pro_drop: 'pro',
};

const SESSIONS: SocialSession[] = ['midday', 'evening', 'allday'];
const SESSION_LABELS: Record<SocialSession, string> = { midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All-Day' };

interface ImageItem { label: string; filename: string; dataUrl: string }

function mdLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/** Tomorrow 08:15 ET as ISO — the standard morning slot, inside Meta's 10min-30d window. */
function tomorrowMorningEtIso(): string {
  const todayEt = getTodayET();
  const d = new Date(`${todayEt}T08:15:00-04:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function PublishInner() {
  const { colors } = useTheme();
  const st = useSt();

  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [kind, setKind] = useState<CaptionKind | null>(null);
  const [session, setSession] = useState<SocialSession>('midday');
  const [variant, setVariant] = useState(0);
  const [caption, setCaption] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [targetName, setTargetName] = useState('free group');
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [urls, setUrls] = useState<{ free?: string; pro?: string; proPrice?: string }>({});

  // ── image pipeline state ──
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imgProgress, setImgProgress] = useState<string | null>(null);
  const canShare = useMemo(() => shareToPhotosAvailable(), []);

  // reel stage (slate/pick posters)
  const stageRef = useRef<View | null>(null);
  const [stageMode, setStageMode] = useState<'slate' | 'pick'>('slate');
  const [stagePicks, setStagePicks] = useState<PickItem[] | null>(null);
  const [stagePick, setStagePick] = useState<PickItem | null>(null);
  const [stagePairScores, setStagePairScores] = useState<{ front: number; back: number; split: number } | null>(null);
  const [stageSlateDate, setStageSlateDate] = useState<string>(() => getTodayET());
  const [stageRedact, setStageRedact] = useState(false);

  // brief-card stage (natural-size capture)
  const briefRef = useRef<View | null>(null);
  const [briefData, setBriefData] = useState<SocialBriefData | null>(null);
  const [briefRender, setBriefRender] = useState<{ variant: 'public' | 'group'; showProFooter: boolean } | null>(null);

  // Two-Question filter answers for page photo posts (must both be explicit NO)
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);

  const tier = kind ? KIND_TIER[kind] : 1;
  const surface: Surface = kind ? KIND_SURFACE[kind] : 'public';
  const lint: LintResult = useMemo(() => lintCaption(caption, tier), [caption, tier]);
  const isPageKind = kind ? PAGE_KINDS.has(kind) : false;

  const loadHistory = useCallback(async () => {
    try {
      const r = await fbPublish.listPosts(15);
      setHistory(r.posts ?? []);
    } catch { /* key missing or fn unreachable — history stays empty */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPageStatus(await fbPublish.status());
      } catch (e) {
        if (!(e instanceof AdminKeyMissingError)) console.log('[publish] status error:', e);
        setPageStatus(null);
      } finally {
        setStatusLoading(false);
      }
      loadHistory();
      try {
        const rows = await fetchFromSupabase<{ key: string; value: any }[]>({
          path: '/rest/v1/app_config?key=in.(social_free_group_url,social_pro_url,social_pro_price)&select=key,value',
        });
        const map: { free?: string; pro?: string; proPrice?: string } = {};
        (rows ?? []).forEach(r => {
          const v = typeof r.value === 'string' ? r.value.replace(/^"|"$/g, '') : String(r.value ?? '');
          if (r.key === 'social_free_group_url') map.free = v;
          if (r.key === 'social_pro_url') map.pro = v;
          if (r.key === 'social_pro_price') map.proPrice = v;
        });
        setUrls(map);
      } catch { /* optional */ }
    })();
  }, [loadHistory]);

  const buildCaption = useCallback(async (k: CaptionKind, v: number, sess: SocialSession) => {
    setDataLoading(true);
    setDataNote(null);
    setResultMsg(null);
    try {
      const today = getTodayET();
      const data: CaptionData = {
        dateLabel: mdLabel(today),
        freeGroupUrl: urls.free,
        proUrl: urls.pro,
        proPrice: urls.proPrice,
        // §6 FREE exception: the All-Day post is pure value — no Pro pitch.
        allDay: k === 'group_drop' && sess === 'allday',
      };
      if (k === 'report_card') {
        const yesterday = getYesterdayET();
        const rc = await fetchReportCardData(yesterday);
        data.dateLabel = mdLabel(yesterday);
        data.totalSignals = rc.totalSignals;
        data.verifiedCount = rc.verifiedCount;
        data.jurisdictionCount = rc.jurisdictionCount;
        data.verified30d = rc.verified30d;
        if (rc.totalSignals === 0) setDataNote('⚠️ No slates found for yesterday — nothing to report on.');
        else if (rc.verifiedCount === 0) setDataNote('⚠️ Zero verified matches yesterday — consider skipping the report card today.');
      }
      setCaption(generateCaption(k, data, v));
    } catch (e) {
      setDataNote(`Data load failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setDataLoading(false);
    }
  }, [urls]);

  const selectKind = useCallback((k: CaptionKind) => {
    setKind(k);
    setVariant(0);
    setImages([]);
    setQ1No(false); setQ2No(false);
    buildCaption(k, 0, session);
  }, [buildCaption, session]);

  const selectSession = useCallback((s: SocialSession) => {
    setSession(s);
    setImages([]);
    if (kind) buildCaption(kind, variant, s);
  }, [kind, variant, buildCaption]);

  const nextVariant = useCallback(() => {
    if (!kind) return;
    const v = variant + 1;
    setVariant(v);
    buildCaption(kind, v, session);
  }, [kind, variant, buildCaption, session]);

  // ── IMAGE GENERATION ────────────────────────────────────────────────────────

  /** Capture the SocialBriefCard (natural size) in the requested variant. */
  const generateBriefImage = useCallback(async (briefVariant: 'public' | 'group'): Promise<ImageItem> => {
    if (!captureAvailable()) throw new Error('Image capture is web-only. Open HitMaster on the web.');
    setImgProgress('Assembling brief data…');
    const data = briefData ?? await buildSocialBrief();
    setBriefData(data);
    // §6 PRO: no commercial framing → Pro footer only on the FREE group variant.
    setBriefRender({ variant: briefVariant, showProFooter: briefVariant === 'group' && surface === 'free' });
    setImgProgress('Rendering brief card…');
    await raf();
    await waitFonts();
    await raf();
    const node = getStageNode(briefRef as any);
    if (!node) throw new Error('Brief capture stage not mounted');
    const dataUrl = await captureNodeToPngNatural(node, 2);
    setBriefRender(null);
    const filename = `hm-brief-${briefVariant}-${getTodayET()}.png`;
    return { label: `Brief (${briefVariant})`, filename, dataUrl };
  }, [briefData, surface]);

  /** Build the reel-image kit for the selected session: slate + optional 6 picks. */
  const generateSlateKit = useCallback(async (includePicks: boolean): Promise<ImageItem[]> => {
    if (!captureAvailable()) throw new Error('Image capture is web-only. Open HitMaster on the web.');
    const redact = surfaceRedacts(surface);
    setStageRedact(redact);
    setImgProgress(`Loading ${session} slate…`);
    const { picks, slateDate } = await loadSlatePicks(session);
    setStageSlateDate(slateDate);
    const exportType = redact ? 'public' : 'pro';
    const items: ImageItem[] = [];

    // slate composite
    setStagePicks(picks);
    setStagePick(null);
    setStageMode('slate');
    setImgProgress(`Capturing slate (1/${includePicks ? picks.length + 1 : 1})…`);
    await raf(); await waitFonts();
    const slateNode = getStageNode(stageRef as any);
    if (!slateNode) throw new Error('Capture stage not mounted');
    const slateFn = buildFilename({ type: exportType, session, date: slateDate, name: 'slate' });
    items.push({ label: 'Slate', filename: slateFn, dataUrl: await captureNodeToPng(slateNode, slateFn) });

    // per-pick posters
    if (includePicks) {
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        setStagePicks(null);
        setStagePick(p);
        // pair %s must resolve BEFORE the frame paints (useQuery would race the capture)
        const ps = await fetchPairScores(p.bestOrder ?? p.combo ?? '000', session);
        setStagePairScores(ps);
        setStageMode('pick');
        setImgProgress(`Capturing signal card #${i + 1} (${i + 2}/${picks.length + 1})…`);
        await raf(); await waitFonts();
        const node = getStageNode(stageRef as any);
        if (!node) throw new Error('Capture stage not mounted');
        const fn = buildFilename({ type: exportType, session, date: slateDate, name: `pick-${i + 1}` });
        items.push({ label: `Signal #${i + 1}`, filename: fn, dataUrl: await captureNodeToPng(node, fn) });
      }
    }

    setStagePicks(null);
    setStagePick(null);
    setStagePairScores(null);
    return items;
  }, [surface, session]);

  /** One-tap post kit per content type. */
  const buildPostKit = useCallback(async () => {
    if (!kind) return;
    setBusy(true);
    setResultMsg(null);
    setImages([]);
    try {
      const out: ImageItem[] = [];
      if (isPageKind) {
        // Page: brand-safe brief image only (aggregate, no digits by construction)
        out.push(await generateBriefImage('public'));
      } else if (kind === 'cross_post') {
        // Cross-post: redacted slate (mosaic + JOIN FREE banner) — acquisition asset
        out.push(...await generateSlateKit(false));
      } else {
        // Free / Pro group: full slate + all 6 signal cards + group brief
        out.push(...await generateSlateKit(true));
        out.push(await generateBriefImage('group'));
      }
      setImages(out);
      setResultMsg(`🖼️ ${out.length} image${out.length === 1 ? '' : 's'} ready below.`);
    } catch (e) {
      setResultMsg(`❌ Image generation failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setImgProgress(null);
      setBusy(false);
    }
  }, [kind, isPageKind, generateBriefImage, generateSlateKit]);

  // ── PAGE lane ──
  const publishToPage = useCallback(async (scheduledFor?: string, withImage?: ImageItem) => {
    if (!kind || !caption.trim()) return;
    if (!lint.ok) {
      Alert.alert('Caption blocked', 'Fix the blocking vocabulary violations first — they protect the page recommendation.');
      return;
    }
    if (withImage && (!q1No || !q2No)) {
      Alert.alert('Two-Question filter', 'Answer both filter questions (must be NO) before publishing an image to the page.');
      return;
    }
    const what = withImage ? 'brief image + caption' : 'text-only post';
    const when = scheduledFor ? `Schedule ${what} for tomorrow 8:15 AM ET` : `Publish ${what} NOW to the public page`;
    Alert.alert(when + '?', 'Via the Page API. The publish log records it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: scheduledFor ? 'Schedule' : 'Publish',
        onPress: async () => {
          setBusy(true);
          setResultMsg(null);
          try {
            const r = withImage
              ? await fbPublish.publishPagePhoto({
                  caption, kind, scheduledFor,
                  imageDataUrl: withImage.dataUrl,
                  twoQAck: { q1: false, q2: false },
                  imageMeta: { filename: withImage.filename, source: 'PublishView.brief-public' },
                })
              : await fbPublish.publishPageText({ message: caption, kind, scheduledFor });
            setResultMsg(scheduledFor ? `🕗 Scheduled — post ID ${r.postId}` : `✅ Published — post ID ${r.postId}`);
            loadHistory();
          } catch (e: any) {
            if (e?.code === 'tier1_lint_failed') {
              setResultMsg(`❌ Server lint refused: ${(e.violations ?? []).join(', ')}`);
            } else if (e?.code === 'two_question_filter_required') {
              setResultMsg('❌ Server requires the Two-Question acknowledgement.');
            } else {
              setResultMsg(`❌ ${String(e?.message ?? e)}`);
            }
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [kind, caption, lint.ok, q1No, q2No, loadHistory]);

  // ── GROUP lane (assisted) ──
  const copyCaption = useCallback(async () => {
    await Clipboard.setStringAsync(caption);
    setResultMsg('📋 Caption copied — paste it inside Facebook.');
  }, [caption]);

  const openFacebook = useCallback(() => {
    const url = surface === 'pro' ? (urls.pro || urls.free) : urls.free;
    Linking.openURL(url || 'https://www.facebook.com/groups/');
  }, [surface, urls]);

  const markHandedOff = useCallback(async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const r = await fbPublish.logAssist({
        caption, tier, kind,
        targetName: kind === 'cross_post' ? targetName : (surface === 'pro' ? 'pro group' : 'free group'),
        imageMeta: images.length > 0 ? { files: images.map(i => i.filename), count: images.length } : null,
      });
      setResultMsg(r.duplicateToday
        ? `⚠️ Logged — but this exact caption was already used today (${r.duplicates.map(d => d.target_name).join(', ')}). Vary it before posting elsewhere.`
        : '✅ Handoff logged.');
      loadHistory();
    } catch (e: any) {
      setResultMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [kind, caption, tier, targetName, surface, images, loadHistory]);

  const briefImage = images.find(i => i.label.startsWith('Brief (public'));
  const needsSession = kind && !isPageKind;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      {/* Connection */}
      <SectionTitle>PAGE CONNECTION</SectionTitle>
      <Card style={{ padding: 12, marginBottom: 14 }}>
        {statusLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : pageStatus?.tokenValid ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 14 }}>🟢</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>
              {pageStatus.page?.name ?? 'Page'} connected
            </Text>
            {pageStatus.page?.followers_count != null && (
              <Pill label={`${pageStatus.page.followers_count} followers`} color={colors.primary} />
            )}
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.orange, marginBottom: 4 }}>
              🟡 Page not connected {pageStatus?.configured === false ? '(secrets not set)' : pageStatus?.error ? `(${pageStatus.error})` : ''}
            </Text>
            <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15 }}>
              One-time setup: docs/facebook_publishing_setup.md — create the Meta app, exchange for a permanent Page token, set the FB_PAGE_ID + FB_PAGE_TOKEN secrets. Group assist works without it.
            </Text>
          </View>
        )}
      </Card>

      {/* Content type */}
      <SectionTitle>CONTENT TYPE</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {KINDS.map(k => {
          const info = KIND_LABELS[k];
          const on = kind === k;
          return (
            <TouchableOpacity key={k} style={{ width: '48%' }} onPress={() => selectKind(k)} activeOpacity={0.8}>
              <Card style={{ padding: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, flex: 1 }}>{info.label}</Text>
                  <Pill label={`T${KIND_TIER[k]}`} color={KIND_TIER[k] === 1 ? colors.error : KIND_TIER[k] === 4 ? colors.gold : colors.success} />
                </View>
                <Text style={{ fontSize: 9, color: colors.textSecondary, lineHeight: 13, marginBottom: 4 }}>{info.desc}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: colors.primary }}>{info.dest}</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>

      {kind && (
        <>
          {/* Session picker — group kits are per-slate */}
          {needsSession && (
            <>
              <SectionTitle>SESSION</SectionTitle>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                {SESSIONS.map(s => (
                  <TouchableOpacity key={s} style={[st.optBtn, session === s && st.optBtnOn]} onPress={() => selectSession(s)}>
                    <Text style={[st.optBtnText, session === s && st.optBtnTextOn]}>{SESSION_LABELS[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {kind === 'group_drop' && session === 'allday' && (
                <Card style={{ padding: 8, marginBottom: 10, backgroundColor: colors.tealLight }}>
                  <Text style={{ fontSize: 10, color: colors.teal, fontWeight: '700' }}>All-Day drop = pure value — the Pro pitch is automatically omitted (§6).</Text>
                </Card>
              )}
            </>
          )}

          {/* Caption */}
          <SectionTitle>{`CAPTION — TIER ${tier} ${tier === 1 ? '(STRICT LINT)' : tier === 3 ? '(STRICT + VARIATION)' : '(OPTED-IN AUDIENCE)'}`}</SectionTitle>
          {dataLoading ? (
            <Card style={{ padding: 16, alignItems: 'center', marginBottom: 10 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6 }}>Assembling verified data…</Text>
            </Card>
          ) : (
            <>
              {dataNote && (
                <Card style={{ padding: 10, marginBottom: 8, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
                  <Text style={{ fontSize: 11, color: colors.gold, fontWeight: '700' }}>{dataNote}</Text>
                </Card>
              )}
              <TextInput
                style={[st.csvInput, { minHeight: 160, fontSize: 13, lineHeight: 19 }]}
                value={caption}
                onChangeText={setCaption}
                multiline
                textAlignVertical="top"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity style={st.btnGhost} onPress={nextVariant}>
                  <Text style={st.btnGhostText}>↻ Variation {variant + 1}</Text>
                </TouchableOpacity>
                <Pill label={`${lint.length} chars`} color={lint.length > 600 ? colors.orange : colors.textTertiary} />
                <Pill label={`${lint.emojiCount} emoji`} color={lint.emojiCount > 3 ? colors.error : colors.textTertiary} />
                <Pill label={lint.ok ? '✓ lint clean' : `${lint.violations.filter(v => v.blocking).length} blocking`} color={lint.ok ? colors.success : colors.error} />
              </View>
              {lint.violations.length > 0 && (
                <Card style={{ padding: 10, marginTop: 8, backgroundColor: colors.errorLight, borderColor: colors.error + '33' }}>
                  {lint.violations.map((v, i) => (
                    <Text key={i} style={{ fontSize: 10, color: v.blocking ? colors.error : colors.orange, lineHeight: 15 }}>
                      {v.blocking ? '⛔' : '⚠️'} “{v.term}” ({v.rule}){v.suggestion ? ` → ${v.suggestion}` : ''}
                    </Text>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* Images */}
          <SectionTitle>IMAGES</SectionTitle>
          <Card style={{ padding: 12, marginBottom: 10 }}>
            <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
              {isPageKind
                ? 'Page images are limited to the brand-safe brief card (aggregate stats — no digits, no state codes, by construction). Optional: text-only posts need no image.'
                : kind === 'cross_post'
                  ? 'Cross-post asset: digit-redacted slate with the JOIN FREE banner (mosaic variant — §6 public discipline applies outside your own groups).'
                  : `Full post kit for the ${surface === 'pro' ? 'Pro' : 'free'} group: slate composite + all 6 signal cards + the group brief. Full fidelity — this audience opted in.`}
            </Text>
            <TouchableOpacity
              style={[st.btnPrimary, { opacity: busy ? 0.5 : 1 }]}
              disabled={busy}
              onPress={buildPostKit}
            >
              <Text style={st.btnPrimaryText}>
                {imgProgress ? `⏳ ${imgProgress}` : isPageKind ? '🖼️ Generate Brief Image' : '🧰 Build Post Kit'}
              </Text>
            </TouchableOpacity>

            {images.length > 0 && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {images.map(img => (
                      <View key={img.filename} style={{ width: 130 }}>
                        <RNImage source={{ uri: img.dataUrl }} style={{ width: 130, height: img.label.startsWith('Brief') ? 130 : 231, borderRadius: 8, backgroundColor: '#000' }} resizeMode="contain" />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text, marginTop: 4 }} numberOfLines={1}>{img.label}</Text>
                        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                          <TouchableOpacity style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8 }]} onPress={() => downloadDataUrl(img.dataUrl, img.filename)}>
                            <Text style={[st.btnGhostText, { fontSize: 9 }]}>⬇ Save</Text>
                          </TouchableOpacity>
                          {canShare && (
                            <TouchableOpacity style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8 }]} onPress={() => shareDataUrlToPhotos(img.dataUrl, img.filename).catch(() => {})}>
                              <Text style={[st.btnGhostText, { fontSize: 9 }]}>📤 Photos</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                {images.length > 1 && (
                  <TouchableOpacity style={[st.btnGhost, { marginTop: 10 }]} onPress={() => downloadAllSequential(images.map(i => ({ dataUrl: i.dataUrl, filename: i.filename })))}>
                    <Text style={st.btnGhostText}>⬇ Download All ({images.length})</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </Card>

          {/* Actions */}
          <SectionTitle>{isPageKind ? 'PUBLISH — PUBLIC PAGE (API)' : 'ASSISTED POST — GROUPS'}</SectionTitle>
          {isPageKind ? (
            <Card style={{ padding: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
                Tier-1 lint must be clean — it protects the page&apos;s recommended status. The edge function re-checks server-side.
              </Text>

              {/* text-only */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <TouchableOpacity
                  style={[st.btnPrimary, { flex: 1, opacity: busy || !lint.ok || !pageStatus?.tokenValid ? 0.5 : 1 }]}
                  disabled={busy || !lint.ok || !pageStatus?.tokenValid}
                  onPress={() => publishToPage()}
                >
                  <Text style={st.btnPrimaryText}>{busy ? '⏳ Working…' : '⚡ Publish Text Now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.btnGhost, { opacity: busy || !lint.ok || !pageStatus?.tokenValid ? 0.5 : 1 }]}
                  disabled={busy || !lint.ok || !pageStatus?.tokenValid}
                  onPress={() => publishToPage(tomorrowMorningEtIso())}
                >
                  <Text style={st.btnGhostText}>🕗 Tomorrow 8:15a</Text>
                </TouchableOpacity>
              </View>

              {/* photo post — requires generated brief + Two-Question NO/NO */}
              {briefImage && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>TWO-QUESTION FILTER (MANDATORY FOR PAGE IMAGES)</Text>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }} onPress={() => setQ1No(v => !v)}>
                    <Text style={{ fontSize: 14 }}>{q1No ? '☑️' : '⬜'}</Text>
                    <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q1 — NO 3-digit numbers are visible in the image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} onPress={() => setQ2No(v => !v)}>
                    <Text style={{ fontSize: 14 }}>{q2No ? '☑️' : '⬜'}</Text>
                    <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q2 — NO forbidden vocabulary is rendered in the image</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[st.btnPrimary, { flex: 1, opacity: busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No ? 0.5 : 1 }]}
                      disabled={busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No}
                      onPress={() => publishToPage(undefined, briefImage)}
                    >
                      <Text style={st.btnPrimaryText}>🖼️ Publish Brief + Caption</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.btnGhost, { opacity: busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No ? 0.5 : 1 }]}
                      disabled={busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No}
                      onPress={() => publishToPage(tomorrowMorningEtIso(), briefImage)}
                    >
                      <Text style={st.btnGhostText}>🕗 8:15a</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </Card>
          ) : (
            <Card style={{ padding: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
                Meta removed the Groups API (April 2024) — no tool can auto-post to groups. Sanctioned flow: build the kit above, copy the caption, open Facebook, attach the saved images and paste. (Prefilled captions are prohibited by Meta policy — the clipboard step is the correct pattern.)
              </Text>
              {kind === 'cross_post' && (
                <>
                  <Text style={st.fieldLabel}>DESTINATION GROUP NAME (for the log)</Text>
                  <TextInput style={[st.csvInput, { minHeight: 40, marginBottom: 10 }]} value={targetName} onChangeText={setTargetName} />
                </>
              )}
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={st.btnPrimary} onPress={copyCaption}>
                  <Text style={st.btnPrimaryText}>1️⃣ Copy Caption</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.btnGhost} onPress={openFacebook}>
                  <Text style={st.btnGhostText}>2️⃣ Open Facebook {Platform.OS === 'web' ? '(new tab)' : ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnGhost, { opacity: busy ? 0.5 : 1 }]} disabled={busy} onPress={markHandedOff}>
                  <Text style={st.btnGhostText}>3️⃣ Mark Posted (log + duplicate check)</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {resultMsg && (
            <Card style={{ padding: 10, marginBottom: 10, backgroundColor: resultMsg.startsWith('❌') ? colors.errorLight : colors.successLight }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: resultMsg.startsWith('❌') ? colors.error : colors.success }}>{resultMsg}</Text>
            </Card>
          )}
        </>
      )}

      {/* History */}
      <SectionTitle>PUBLISH LOG</SectionTitle>
      <Card style={{ padding: 0 }}>
        {history.length === 0 && (
          <View style={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: colors.textTertiary }}>No posts logged yet</Text>
          </View>
        )}
        {history.map((p, i) => (
          <View key={p.id} style={{ padding: 10, borderBottomWidth: i < history.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Pill label={`T${p.tier}`} color={p.tier === 1 ? colors.error : colors.success} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, flex: 1 }}>{p.kind} · {p.destination}{p.target_name ? ` · ${p.target_name}` : ''}{p.has_image ? ' · 🖼️' : ''}</Text>
              <Pill
                label={p.status}
                color={p.status === 'published' ? colors.success : p.status === 'failed' ? colors.error : p.status === 'scheduled' ? colors.primary : colors.gold}
              />
            </View>
            <Text style={{ fontSize: 9, color: colors.textTertiary }} numberOfLines={1}>
              {timeAgo(p.created_at)}{p.override_used ? ' · ⚠️ lint override' : ''} — {String(p.caption).slice(0, 80)}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>

    {/* ── Hidden capture stages ── */}
    <PublishStage
      ref={stageRef}
      mode={stageMode}
      picks={stagePicks}
      pick={stagePick}
      pairScores={stagePairScores}
      session={session}
      slateDate={stageSlateDate}
      redact={stageRedact}
    />
    {briefRender && briefData && (
      /* translate (not extreme left offset) so the browser still paints the
         node — extreme offsets get paint-culled and capture comes back blank.
         The transform sits on the WRAPPER; the captured child clone carries
         no transform, so captureNodeToPngNatural reads it cleanly. */
      <View style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: 5000 }] as any, pointerEvents: 'none' }} collapsable={false}>
        <SocialBriefCard
          ref={briefRef}
          data={briefData}
          variant={briefRender.variant}
          showProFooter={briefRender.showProFooter}
        />
      </View>
    )}
    </View>
  );
}

export default function PublishView() {
  return (
    <AdminKeyGate>
      <PublishInner />
    </AdminKeyGate>
  );
}
