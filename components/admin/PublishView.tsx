/**
 * PublishView — operator social publishing console (SOCIAL-01/02/03/04).
 *
 * TWO-AXIS MODEL (2026-06-29 spec §6): the operator picks WHERE first
 * (Public Page / Free Group / Pro Group / Cross-Post), then WHAT (report card,
 * announcement, slate drop, brief, custom). The same content renders
 * differently per surface:
 *   PUBLIC — aggregate captions, redacted/mosaic or brand-safe images only,
 *            published DIRECTLY via the Page API (text, or photo behind the
 *            mandatory Two-Question NO/NO ack).
 *   FREE   — full-fidelity kit + Pro CTA (All-Day = pure value), assisted.
 *   PRO    — full-fidelity kit, first-access framing, NO pricing, assisted.
 *   CROSS  — redacted assets + admin-respectful caption + variation, assisted.
 *
 * AI layer (SOCIAL-04): Claude (opus-4-8) generates surface-aware captions and
 * composes brief-§8-compliant Gemini prompts; Gemini 3 Pro Image renders brand
 * graphics. Everything AI-generated still passes the same client lint + server
 * guards + Two-Question gate — generation is never clearance.
 *
 * Groups have no publish API (Meta removed it 4/2024) — group lanes build the
 * complete post kit in place, copy the caption, open Facebook, log the handoff.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform, Image as RNImage } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { lintCaption, LintResult } from '@/lib/social/brandLint';
import {
  generateCaption, ContentKind, CaptionData,
  SURFACE_TIER, CONTENT_SURFACES, SURFACE_LABELS, CONTENT_LABELS,
} from '@/lib/social/captions';
import { fetchReportCardData } from '@/lib/social/reportCard';
import { buildSocialBrief, SocialBriefData } from '@/lib/social/socialBrief';
import { fbPublish, PageStatus } from '@/lib/social/fbPublishClient';
import { aiContent } from '@/lib/social/aiContentClient';
import {
  loadSlatePicks, raf, waitFonts, getStageNode, surfaceRedacts,
  type SocialSession, type Surface,
} from '@/lib/social/publishImages';
import {
  captureAvailable, captureNodeToPng, captureNodeToPngNatural,
  downloadDataUrl, downloadAllSequential, shareToPhotosAvailable, shareDataUrlToPhotos,
  shareMultiFilesAvailable, shareDataUrlsToApps, buildFilename,
} from '@/lib/captureExportImage';
import { fetchPairScores } from '@/lib/pairUtils';
import type { PickItem } from '@/components/PickCard';
import { PublishStage } from '@/components/social/PublishStage';
import { SocialBriefCard } from '@/components/social/SocialBriefCard';
import { AdminKeyMissingError } from '@/lib/subscriberAdminClient';
import { confirmAsync } from '@/lib/confirm';
import { AdminKeyGate } from './AdminKeyGate';
import { Pill, SectionTitle, Card, useSt, timeAgo } from './AdminShared';

const SURFACES: Surface[] = ['public', 'free', 'pro', 'cross'];
const CONTENTS: ContentKind[] = ['report_card', 'signal_announce', 'slate_drop', 'brief', 'custom'];
const SESSIONS: SocialSession[] = ['midday', 'evening', 'allday'];
const SESSION_UI: Record<SocialSession, string> = { midday: '☀️ Midday', evening: '🌙 Evening', allday: '◈ All-Day' };

interface ImageItem { label: string; filename: string; dataUrl: string }

function mdLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/**
 * Open a URL in a real new browser tab on web. expo-linking's openURL
 * navigates the CURRENT tab on web (or no-ops) — window.open('_blank') is the
 * only reliable way to spawn a new tab so the operator keeps the app open.
 */
function openInNewTab(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    Linking.openURL(url);
  }
}

/** Tomorrow 08:15 ET — inside Meta's 10min-30d scheduling window. */
function tomorrowMorningEtIso(): string {
  const d = new Date(`${getTodayET()}T08:15:00-04:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** What images each (surface, content) combination produces. */
function imagePlan(surface: Surface, content: ContentKind): { label: string; kind: 'none' | 'brief' | 'slate' | 'kit' | 'redacted_slate' } {
  if (content === 'signal_announce' || content === 'custom') return { label: 'No generated image — text (or attach an AI brand image below).', kind: 'none' };
  if (content === 'brief' || content === 'report_card') {
    return surface === 'public'
      ? { label: 'Brand-safe brief card (aggregate — no digits/states by construction).', kind: 'brief' }
      : { label: 'Group brief card (full detail, surface-appropriate footer).', kind: 'brief' };
  }
  // slate_drop
  if (surface === 'free' || surface === 'pro') return { label: `Full post kit: slate + all 6 signal cards + group brief (${surface === 'pro' ? 'PRO fidelity' : 'free-group fidelity'}).`, kind: 'kit' };
  return { label: 'Digit-redacted mosaic slate + JOIN FREE banner (§6 sanctioned public variant).', kind: 'redacted_slate' };
}

function PublishInner() {
  const { colors } = useTheme();
  const st = useSt();

  const [pageStatus, setPageStatus] = useState<PageStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [content, setContent] = useState<ContentKind | null>(null);
  const [session, setSession] = useState<SocialSession>('midday');
  const [variant, setVariant] = useState(0);
  const [caption, setCaption] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [targetName, setTargetName] = useState('destination group');
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [urls, setUrls] = useState<{ free?: string; pro?: string; proPrice?: string }>({});
  const captionDataRef = useRef<CaptionData | null>(null);

  // image state
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imgProgress, setImgProgress] = useState<string | null>(null);
  const canShare = useMemo(() => shareToPhotosAvailable(), []);
  const canShareAll = useMemo(() => shareMultiFilesAvailable(), []);

  // AI state
  const [aiAvailable, setAiAvailable] = useState<{ claude: boolean; gemini: boolean } | null>(null);
  const [aiTheme, setAiTheme] = useState('');
  const [aiBusy, setAiBusy] = useState<string | null>(null);

  // reel stage
  const stageRef = useRef<View | null>(null);
  const [stageMode, setStageMode] = useState<'slate' | 'pick'>('slate');
  const [stagePicks, setStagePicks] = useState<PickItem[] | null>(null);
  const [stagePick, setStagePick] = useState<PickItem | null>(null);
  const [stagePairScores, setStagePairScores] = useState<{ front: number; back: number; split: number } | null>(null);
  const [stageSlateDate, setStageSlateDate] = useState<string>(() => getTodayET());
  const [stageRedact, setStageRedact] = useState(false);

  // brief stage
  const briefRef = useRef<View | null>(null);
  const [briefData, setBriefData] = useState<SocialBriefData | null>(null);
  const [briefRender, setBriefRender] = useState<{ variant: 'public' | 'group'; groupTier?: 'free' | 'pro' } | null>(null);

  // Two-Question filter (page photo posts)
  const [q1No, setQ1No] = useState(false);
  const [q2No, setQ2No] = useState(false);

  // Group lane: the Facebook destination to open (editable — choose the path).
  const [destUrl, setDestUrl] = useState('');

  const tier = surface ? SURFACE_TIER[surface] : 1;
  const lint: LintResult = useMemo(() => lintCaption(caption, tier), [caption, tier]);
  const isApiLane = surface === 'public';
  const validContents = surface ? CONTENTS.filter(c => CONTENT_SURFACES[c].includes(surface)) : [];
  const plan = surface && content ? imagePlan(surface, content) : null;
  const needsSession = content === 'slate_drop';

  const loadHistory = useCallback(async () => {
    try {
      const r = await fbPublish.listPosts(15);
      setHistory(r.posts ?? []);
    } catch { /* fn unreachable — history stays empty */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPageStatus(await fbPublish.status());
      } catch (e) {
        if (!(e instanceof AdminKeyMissingError)) console.log('[publish] status error:', e);
      } finally {
        setStatusLoading(false);
      }
      loadHistory();
      try {
        const ai = await aiContent.ping();
        setAiAvailable({ claude: ai.claude, gemini: ai.gemini });
      } catch { setAiAvailable(null); }
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

  const buildCaption = useCallback(async (srf: Surface, cnt: ContentKind, v: number, sess: SocialSession) => {
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
        allDay: cnt === 'slate_drop' && srf === 'free' && sess === 'allday',
        session: cnt === 'slate_drop' ? sess : undefined,
      };
      if (cnt === 'report_card' || cnt === 'brief') {
        const yesterday = getYesterdayET();
        const rc = await fetchReportCardData(yesterday);
        data.dateLabel = cnt === 'report_card' ? mdLabel(yesterday) : data.dateLabel;
        data.totalSignals = rc.totalSignals;
        data.verifiedCount = rc.verifiedCount;
        data.jurisdictionCount = rc.jurisdictionCount;
        data.matches = rc.matches;
        data.verified30d = rc.verified30d;
        if (cnt === 'report_card' && rc.verifiedCount === 0) setDataNote('⚠️ Zero verified matches yesterday — consider skipping the report card today.');
      }
      captionDataRef.current = data;
      setCaption(generateCaption(cnt, srf, data, v));
    } catch (e) {
      setDataNote(`Data load failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setDataLoading(false);
    }
  }, [urls]);

  const selectSurface = useCallback((s: Surface) => {
    setSurface(s);
    setImages([]);
    setQ1No(false); setQ2No(false);
    setResultMsg(null);
    const stillValid = content && CONTENT_SURFACES[content].includes(s);
    if (stillValid && content) {
      buildCaption(s, content, 0, session);
      setVariant(0);
    } else {
      setContent(null);
      setCaption('');
    }
  }, [content, session, buildCaption]);

  const selectContent = useCallback((c: ContentKind) => {
    if (!surface) return;
    setContent(c);
    setVariant(0);
    setImages([]);
    setQ1No(false); setQ2No(false);
    buildCaption(surface, c, 0, session);
  }, [surface, session, buildCaption]);

  const selectSession = useCallback((s: SocialSession) => {
    setSession(s);
    setImages([]);
    if (surface && content) buildCaption(surface, content, variant, s);
  }, [surface, content, variant, buildCaption]);

  const nextVariant = useCallback(() => {
    if (!surface || !content) return;
    const v = variant + 1;
    setVariant(v);
    buildCaption(surface, content, v, session);
  }, [surface, content, variant, session, buildCaption]);

  // One-tap daily presets — configure surface+content(+session) and generate
  // the caption in a single action, so the routine is: preset → Build → Share.
  const applyPreset = useCallback((srf: Surface, cnt: ContentKind, sess?: SocialSession) => {
    const s = sess ?? session;
    setSurface(srf);
    setContent(cnt);
    if (sess) setSession(sess);
    setVariant(0);
    setImages([]);
    setQ1No(false); setQ2No(false);
    setResultMsg(`⚡ ${SURFACE_LABELS[srf].label} · ${CONTENT_LABELS[cnt].label} — caption ready. Build the images, then publish/share.`);
    buildCaption(srf, cnt, 0, s);
  }, [session, buildCaption]);

  // ── AI generation ──
  const aiCaption = useCallback(async () => {
    if (!surface || !content) return;
    setAiBusy('caption');
    setResultMsg(null);
    try {
      const d = captionDataRef.current;
      const ctx = d ? `date ${d.dateLabel}; verified ${d.verifiedCount ?? '-'} of ${d.totalSignals ?? '-'} signals across ${d.jurisdictionCount ?? '-'} jurisdictions; 30d verified ${d.verified30d ?? '-'}; session ${d.session ?? '-'}; allDay=${d.allDay ? 'yes (NO Pro pitch)' : 'no'}; free group ${d.freeGroupUrl ?? '-'}; pro ${d.proUrl ?? '-'} at ${d.proPrice ?? '-'}` : '';
      const r = await aiContent.generateCaption({
        surface, content, context: ctx,
        priorCaptions: history.slice(0, 5).map(h => String(h.caption ?? '')),
      });
      setCaption(r.caption);
      setResultMsg(`✨ AI caption generated — ${r.rationale}`);
    } catch (e: any) {
      setResultMsg(`❌ AI caption failed: ${String(e?.message ?? e)}`);
    } finally {
      setAiBusy(null);
    }
  }, [surface, content, history]);

  const aiBrandImage = useCallback(async () => {
    if (!surface) return;
    setAiBusy('image');
    setResultMsg(null);
    try {
      const r = await aiContent.generateBrandImage({
        theme: aiTheme || 'daily intelligence brand graphic',
        surface,
        aspectRatio: '9:16',
        size: '1K',
      });
      const filename = `hm-ai-${surface}-${getTodayET()}.png`;
      // RULE: the AI brand image is the COVER — always position 0. Replace any
      // prior AI cover so there's never more than one, and it leads the set
      // (Facebook uses the first image as the post cover / first slide).
      setImages(prev => [{ label: 'AI Brand Image', filename, dataUrl: r.imageDataUrl }, ...prev.filter(i => !i.label.startsWith('AI'))]);
      setResultMsg(`✨ Brand image generated → set as COVER (rendered text: ${r.textStrings.join(' · ') || 'none'}). Review it, then answer the Two-Question filter before any page publish.`);
    } catch (e: any) {
      setResultMsg(e?.code === 'composed_prompt_unsafe'
        ? `⛔ AI refused its own prompt: ${String(e?.detail ?? '')} — adjust the theme.`
        : `❌ AI image failed: ${String(e?.message ?? e)}`);
    } finally {
      setAiBusy(null);
    }
  }, [surface, aiTheme]);

  // ── image generation (capture pipeline) ──
  const generateBriefImage = useCallback(async (briefVariant: 'public' | 'group'): Promise<ImageItem> => {
    if (!captureAvailable()) throw new Error('Image capture is web-only. Open HitMaster on the web.');
    setImgProgress('Assembling brief data…');
    const data = briefData ?? await buildSocialBrief();
    setBriefData(data);
    // §6: Pro footer only on the FREE variant; PRO surface gets no commercial framing.
    setBriefRender({ variant: briefVariant, groupTier: briefVariant === 'group' ? (surface === 'pro' ? 'pro' : 'free') : undefined });
    setImgProgress('Rendering brief card…');
    await raf(); await waitFonts(); await raf();
    const node = getStageNode(briefRef as any);
    if (!node) throw new Error('Brief capture stage not mounted');
    const dataUrl = await captureNodeToPngNatural(node, 2);
    setBriefRender(null);
    return { label: `Brief (${briefVariant})`, filename: `hm-brief-${briefVariant}-${surface}-${getTodayET()}.png`, dataUrl };
  }, [briefData, surface]);

  const generateSlateImages = useCallback(async (includePicks: boolean): Promise<ImageItem[]> => {
    if (!captureAvailable()) throw new Error('Image capture is web-only. Open HitMaster on the web.');
    const redact = surface ? surfaceRedacts(surface) : true;
    setStageRedact(redact);
    setImgProgress(`Loading ${session} slate…`);
    const { picks, slateDate } = await loadSlatePicks(session);
    setStageSlateDate(slateDate);
    const exportType = redact ? 'public' : 'pro';
    const items: ImageItem[] = [];

    setStagePicks(picks);
    setStagePick(null);
    setStageMode('slate');
    setImgProgress(`Capturing slate (1/${includePicks ? picks.length + 1 : 1})…`);
    await raf(); await waitFonts();
    const slateNode = getStageNode(stageRef as any);
    if (!slateNode) throw new Error('Capture stage not mounted');
    const slateFn = buildFilename({ type: exportType, session, date: slateDate, name: 'slate' });
    items.push({ label: 'Slate', filename: slateFn, dataUrl: await captureNodeToPng(slateNode, slateFn) });

    if (includePicks) {
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        setStagePicks(null);
        setStagePick(p);
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
    setStagePicks(null); setStagePick(null); setStagePairScores(null);
    return items;
  }, [surface, session]);

  const buildPostKit = useCallback(async () => {
    if (!surface || !content || !plan) return;
    // Preserve any AI cover image at the front (RULE: AI image is the cover).
    const preservedAI = images.filter(i => i.label.startsWith('AI'));
    setBusy(true);
    setResultMsg(null);
    try {
      const out: ImageItem[] = [];
      if (plan.kind === 'brief') {
        out.push(await generateBriefImage(surface === 'public' ? 'public' : 'group'));
      } else if (plan.kind === 'redacted_slate') {
        out.push(...await generateSlateImages(false));
      } else if (plan.kind === 'kit') {
        out.push(...await generateSlateImages(true));
        out.push(await generateBriefImage('group'));
      }
      const final = [...preservedAI, ...out];
      setImages(final);
      setResultMsg(final.length ? `🖼️ ${final.length} image${final.length === 1 ? '' : 's'} ready${preservedAI.length ? ' (AI cover kept first)' : ''}.` : 'No images for this combination.');
    } catch (e) {
      setResultMsg(`❌ Image generation failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setImgProgress(null);
      setBusy(false);
    }
  }, [surface, content, plan, images, generateBriefImage, generateSlateImages]);

  // ── PUBLIC lane (API) ──
  const publishToPage = useCallback(async (scheduledFor?: string, withImage?: ImageItem) => {
    if (!content || !caption.trim()) { setResultMsg('❌ Nothing to publish — pick content and a caption first.'); return; }
    if (!lint.ok) { setResultMsg('❌ Caption blocked — fix the ⛔ violations above (they protect the page recommendation).'); return; }
    if (withImage && (!q1No || !q2No)) { setResultMsg('❌ Answer both Two-Question checkboxes (must be NO) before publishing an image.'); return; }

    const what = withImage ? `${withImage.label} + caption` : 'text-only post';
    const ok = await confirmAsync(
      `${scheduledFor ? 'Schedule' : 'Publish'} ${what}${scheduledFor ? ' for tomorrow 8:15 AM ET' : ' NOW'}?`,
      'Via the Page API. The publish log records it.',
    );
    if (!ok) return;

    setBusy(true);
    setResultMsg('⏳ Publishing to the page…');
    try {
      const r = withImage
        ? await fbPublish.publishPagePhoto({
            caption, kind: content, scheduledFor,
            imageDataUrl: withImage.dataUrl,
            twoQAck: { q1: false, q2: false },
            imageMeta: { filename: withImage.filename, source: `PublishView.${content}.${withImage.label}` },
          })
        : await fbPublish.publishPageText({ message: caption, kind: content, scheduledFor });
      setResultMsg(scheduledFor ? `🕗 Scheduled — post ID ${r.postId}` : `✅ Published — post ID ${r.postId}`);
      loadHistory();
    } catch (e: any) {
      if (e?.code === 'tier1_lint_failed') setResultMsg(`❌ Server lint refused: ${(e.violations ?? []).join(', ')}`);
      else setResultMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [content, caption, lint.ok, q1No, q2No, loadHistory]);

  // ── GROUP lanes (assisted) ──
  const copyCaption = useCallback(async () => {
    await Clipboard.setStringAsync(caption);
    setResultMsg('📋 Caption copied — paste it inside Facebook.');
  }, [caption]);

  // Default the destination to the configured group for the chosen surface.
  // Free → free group; Pro → pro group; Cross → blank (operator pastes the
  // external group they're cross-posting into). Operator can override any.
  useEffect(() => {
    if (!surface || surface === 'public') return;
    if (surface === 'free') setDestUrl(urls.free ?? '');
    else if (surface === 'pro') setDestUrl(urls.pro ?? urls.free ?? '');
    else if (surface === 'cross') setDestUrl('');
  }, [surface, urls]);

  const openFacebook = useCallback(() => {
    const url = destUrl?.trim() || (surface === 'pro' ? urls.pro : urls.free) || 'https://www.facebook.com/groups/';
    openInNewTab(url);
    setResultMsg('↗ Facebook opened in a new tab — attach the saved image(s) and paste the caption.');
  }, [destUrl, surface, urls]);

  const logHandoff = useCallback(async () => {
    if (!surface || !content) return;
    try {
      const r = await fbPublish.logAssist({
        caption, tier, kind: content,
        targetName: surface === 'cross' ? targetName : surface === 'pro' ? 'pro group' : 'free group',
        imageMeta: images.length > 0 ? { files: images.map(i => i.filename), count: images.length } : null,
      });
      if (r.duplicateToday) setResultMsg(`⚠️ Logged — but this exact caption was already used today (${r.duplicates.map(d => d.target_name).join(', ')}). Vary it before posting elsewhere.`);
      loadHistory();
      return r;
    } catch (e: any) {
      setResultMsg(`❌ Log failed: ${String(e?.message ?? e)}`);
    }
  }, [surface, content, caption, tier, targetName, images, loadHistory]);

  const markHandedOff = useCallback(async () => {
    setBusy(true);
    const r = await logHandoff();
    if (r && !r.duplicateToday) setResultMsg('✅ Handoff logged.');
    setBusy(false);
  }, [logHandoff]);

  // ── ONE-TAP (mobile): hand caption + all images to the Facebook app ──
  // Meta has no Groups publish API and prohibits prefilled captions, so this is
  // the closest compliant path: caption → clipboard, then the OS share sheet
  // hands ALL images to the FB app in one gesture. Operator picks the group and
  // pastes. Auto-logs on success.
  const shareAllToFacebook = useCallback(async () => {
    if (images.length === 0) { setResultMsg('❌ Build the images first.'); return; }
    setBusy(true);
    try {
      await Clipboard.setStringAsync(caption);
      await shareDataUrlsToApps(images.map(i => ({ dataUrl: i.dataUrl, filename: i.filename })), 'HitMaster ZK6');
      await logHandoff();
      setResultMsg('📋 Caption copied + images handed to Facebook. Pick your group, paste the caption, post.');
    } catch (e: any) {
      if (e?.name === 'AbortError') setResultMsg('Share cancelled.');
      else setResultMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [images, caption, logHandoff]);

  // ── ONE-CLICK (desktop): copy caption + download all images + open group ──
  // Desktop browsers can't share files into the FB web composer (cross-origin),
  // so this collapses the manual prep into a single click; the operator then
  // drags the downloaded images into the composer and pastes.
  const prepAndOpen = useCallback(async () => {
    setBusy(true);
    try {
      await Clipboard.setStringAsync(caption);
      if (images.length > 0) await downloadAllSequential(images.map(i => ({ dataUrl: i.dataUrl, filename: i.filename })));
      const url = destUrl?.trim() || (surface === 'pro' ? urls.pro : urls.free) || 'https://www.facebook.com/groups/';
      openInNewTab(url);
      await logHandoff();
      setResultMsg(`🚀 Caption copied · ${images.length} image${images.length === 1 ? '' : 's'} downloading · group opened. Drag the images in, paste, post.`);
    } catch (e: any) {
      setResultMsg(`❌ ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [caption, images, destUrl, surface, urls, logHandoff]);

  const publishableImage = images.length > 0 ? images[0] : undefined;

  return (
    <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
      {/* Connection */}
      <SectionTitle>CONNECTIONS</SectionTitle>
      <Card style={{ padding: 12, marginBottom: 14 }}>
        {statusLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12 }}>{pageStatus?.tokenValid ? '🟢' : '🟡'}</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, flex: 1 }}>
                {pageStatus?.tokenValid ? `${pageStatus.page?.name ?? 'Page'} connected` : 'Page not connected (docs/facebook_publishing_setup.md)'}
              </Text>
              {pageStatus?.page?.followers_count != null && <Pill label={`${pageStatus.page.followers_count} followers`} color={colors.primary} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12 }}>{aiAvailable?.claude && aiAvailable?.gemini ? '🟢' : aiAvailable?.claude || aiAvailable?.gemini ? '🟡' : '⚪'}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }}>
                AI: Claude {aiAvailable?.claude ? '✓' : '—'} · Gemini {aiAvailable?.gemini ? '✓' : '—'}
                {!aiAvailable?.claude || !aiAvailable?.gemini ? ' (set ANTHROPIC_API_KEY / GEMINI_API_KEY secrets)' : ''}
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* QUICK POST — one-tap daily presets */}
      <SectionTitle>⚡ QUICK POST</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {([
          { label: 'Public Report Card', icon: '📣', srf: 'public' as Surface, cnt: 'report_card' as ContentKind },
          { label: 'Free Slate Drop', icon: '👥', srf: 'free' as Surface, cnt: 'slate_drop' as ContentKind, useSession: true },
          { label: 'Pro Slate Drop', icon: '💎', srf: 'pro' as Surface, cnt: 'slate_drop' as ContentKind, useSession: true },
          { label: 'Free Brief', icon: '📰', srf: 'free' as Surface, cnt: 'brief' as ContentKind },
        ]).map(p => (
          <TouchableOpacity
            key={p.label}
            style={{ flexGrow: 1, minWidth: '47%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '55', backgroundColor: colors.primaryLight }}
            onPress={() => applyPreset(p.srf, p.cnt, p.useSession ? session : undefined)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15 }}>{p.icon}</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, flex: 1 }}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 9, color: colors.textTertiary, marginBottom: 16, marginTop: -8 }}>
        A preset sets the surface + content and generates the caption. Then: Build Images → Publish/Share. Slate presets use the {SESSION_UI[session]} session (change it in step 2).
      </Text>

      {/* STEP 1 — WHERE */}
      <SectionTitle>1 · SURFACE — WHERE IS THIS GOING?</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {SURFACES.map(s => {
          const info = SURFACE_LABELS[s];
          const on = surface === s;
          return (
            <TouchableOpacity key={s} style={{ width: '48%' }} onPress={() => selectSurface(s)} activeOpacity={0.8}>
              <Card style={{ padding: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 16 }}>{info.icon}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, flex: 1 }}>{info.label}</Text>
                  <Pill label={info.lane === 'api' ? 'API' : 'ASSIST'} color={info.lane === 'api' ? colors.success : colors.gold} />
                </View>
                <Text style={{ fontSize: 9, color: colors.textSecondary, lineHeight: 13 }}>{info.desc}</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* STEP 2 — WHAT */}
      {surface && (
        <>
          <SectionTitle>2 · CONTENT — WHAT ARE YOU POSTING?</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {validContents.map(c => {
              const info = CONTENT_LABELS[c];
              const on = content === c;
              return (
                <TouchableOpacity key={c} style={{ width: '48%' }} onPress={() => selectContent(c)} activeOpacity={0.8}>
                  <Card style={{ padding: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 4 }}>{info.label}</Text>
                    <Text style={{ fontSize: 9, color: colors.textSecondary, lineHeight: 13 }}>{info.desc}</Text>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {surface && content && (
        <>
          {/* session picker for slate drops */}
          {needsSession && (
            <>
              <SectionTitle>SESSION</SectionTitle>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {SESSIONS.map(s => (
                  <TouchableOpacity key={s} style={[st.optBtn, session === s && st.optBtnOn]} onPress={() => selectSession(s)}>
                    <Text style={[st.optBtnText, session === s && st.optBtnTextOn]}>{SESSION_UI[s]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {surface === 'free' && session === 'allday' && (
                <Card style={{ padding: 8, marginBottom: 10, backgroundColor: colors.tealLight }}>
                  <Text style={{ fontSize: 10, color: colors.teal, fontWeight: '700' }}>All-Day free-group drop = pure value — Pro pitch automatically omitted (§6).</Text>
                </Card>
              )}
            </>
          )}

          {/* CAPTION */}
          <SectionTitle>{`3 · CAPTION — TIER ${tier} ${tier === 1 || tier === 3 ? '(STRICT)' : tier === 4 ? '(NO PRICING)' : '(OPTED-IN)'}`}</SectionTitle>
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
                style={[st.csvInput, { minHeight: 150, fontSize: 13, lineHeight: 19 }]}
                value={caption}
                onChangeText={setCaption}
                placeholder={content === 'custom' ? 'Write your caption — the lint below enforces the surface rules.' : undefined}
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {content !== 'custom' && (
                  <TouchableOpacity style={st.btnGhost} onPress={nextVariant}>
                    <Text style={st.btnGhostText}>↻ Variation {variant + 1}</Text>
                  </TouchableOpacity>
                )}
                {aiAvailable?.claude && (
                  <TouchableOpacity style={[st.btnGhost, { opacity: aiBusy ? 0.5 : 1 }]} disabled={!!aiBusy} onPress={aiCaption}>
                    <Text style={st.btnGhostText}>{aiBusy === 'caption' ? '⏳ AI…' : '✨ AI Caption'}</Text>
                  </TouchableOpacity>
                )}
                <Pill label={`${lint.length} chars`} color={lint.length > 600 ? colors.orange : colors.textTertiary} />
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

          {/* IMAGES */}
          <SectionTitle>4 · IMAGES</SectionTitle>
          <Card style={{ padding: 12, marginBottom: 10 }}>
            {plan && <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>{plan.label}</Text>}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {plan?.kind !== 'none' && (
                <TouchableOpacity style={[st.btnPrimary, { flex: 1, opacity: busy ? 0.5 : 1 }]} disabled={busy} onPress={buildPostKit}>
                  <Text style={st.btnPrimaryText}>{imgProgress ? `⏳ ${imgProgress}` : '🧰 Build Images'}</Text>
                </TouchableOpacity>
              )}
              {aiAvailable?.gemini && (
                <TouchableOpacity style={[st.btnGhost, { opacity: aiBusy ? 0.5 : 1 }]} disabled={!!aiBusy} onPress={aiBrandImage}>
                  <Text style={st.btnGhostText}>{aiBusy === 'image' ? '⏳ Gemini…' : '✨ AI Brand Image ($0.13)'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {aiAvailable?.gemini && (
              <TextInput
                style={[st.csvInput, { minHeight: 38, marginTop: 8, fontSize: 11 }]}
                value={aiTheme}
                onChangeText={setAiTheme}
                placeholder="AI image theme (e.g. 'vault opening, intelligence descending, launch countdown')"
                placeholderTextColor={colors.textTertiary}
              />
            )}

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

          {/* PUBLISH */}
          <SectionTitle>{isApiLane ? '5 · PUBLISH — PUBLIC PAGE (API)' : `5 · ASSISTED POST — ${SURFACE_LABELS[surface].label.toUpperCase()}`}</SectionTitle>
          {isApiLane ? (
            <Card style={{ padding: 12, marginBottom: 10 }}>
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
                  <Text style={st.btnGhostText}>🕗 8:15a</Text>
                </TouchableOpacity>
              </View>

              {publishableImage && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1, marginBottom: 6 }}>
                    TWO-QUESTION FILTER — MANDATORY FOR PAGE IMAGES ({publishableImage.label})
                  </Text>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }} onPress={() => setQ1No(v => !v)}>
                    <Text style={{ fontSize: 14 }}>{q1No ? '☑️' : '⬜'}</Text>
                    <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q1 — NO 3-digit numbers are visible in the image (mosaic redaction counts as NO)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} onPress={() => setQ2No(v => !v)}>
                    <Text style={{ fontSize: 14 }}>{q2No ? '☑️' : '⬜'}</Text>
                    <Text style={{ fontSize: 10, color: colors.text, flex: 1 }}>Q2 — NO forbidden vocabulary is rendered in the image</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[st.btnPrimary, { flex: 1, opacity: busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No ? 0.5 : 1 }]}
                      disabled={busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No}
                      onPress={() => publishToPage(undefined, publishableImage)}
                    >
                      <Text style={st.btnPrimaryText}>🖼️ Publish Image + Caption</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.btnGhost, { opacity: busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No ? 0.5 : 1 }]}
                      disabled={busy || !lint.ok || !pageStatus?.tokenValid || !q1No || !q2No}
                      onPress={() => publishToPage(tomorrowMorningEtIso(), publishableImage)}
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
                Groups have no publish API (Meta removed it 4/2024). Build the images above, copy the caption, open the destination, attach + paste, then log it. Clipboard-paste is the sanctioned pattern — Meta prohibits prefilled captions.
              </Text>

              {/* Posting destination — choose/confirm the path */}
              <Text style={st.fieldLabel}>
                {surface === 'cross' ? 'POSTING DESTINATION — paste the target group URL' : `POSTING DESTINATION — ${SURFACE_LABELS[surface].label}`}
              </Text>
              <TextInput
                style={[st.csvInput, { minHeight: 40, marginBottom: 6, fontSize: 11 }]}
                value={destUrl}
                onChangeText={setDestUrl}
                placeholder={surface === 'cross' ? 'https://www.facebook.com/groups/…' : '(configure via app_config.social_*_url, or paste here)'}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
              {!destUrl.trim() && surface !== 'cross' && (
                <Text style={{ fontSize: 9, color: colors.orange, marginBottom: 8 }}>
                  ⚠️ No {surface} group URL configured — paste one above, or set app_config.{surface === 'pro' ? 'social_pro_url' : 'social_free_group_url'}.
                </Text>
              )}
              {surface === 'cross' && (
                <>
                  <Text style={st.fieldLabel}>DESTINATION GROUP NAME (for the log)</Text>
                  <TextInput style={[st.csvInput, { minHeight: 40, marginBottom: 10 }]} value={targetName} onChangeText={setTargetName} placeholderTextColor={colors.textTertiary} />
                </>
              )}

              {/* ONE-BUTTON flow — mobile shares everything to the FB app in one
                  tap; desktop copies caption + downloads all + opens the group
                  in one click. Groups have no publish API (Meta, 4/2024), so a
                  human still picks the group + pastes the caption either way. */}
              {canShareAll ? (
                <TouchableOpacity
                  style={[st.btnPrimary, { paddingVertical: 14, opacity: busy || images.length === 0 ? 0.5 : 1 }]}
                  disabled={busy || images.length === 0}
                  onPress={shareAllToFacebook}
                >
                  <Text style={[st.btnPrimaryText, { fontSize: 14 }]}>
                    📤 Share All to Facebook {images.length > 0 ? `(${images.length} image${images.length === 1 ? '' : 's'} + caption)` : ''}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[st.btnPrimary, { paddingVertical: 14, opacity: busy ? 0.5 : 1 }]}
                  disabled={busy}
                  onPress={prepAndOpen}
                >
                  <Text style={[st.btnPrimaryText, { fontSize: 14 }]}>
                    🚀 Prep &amp; Open — copy caption · download {images.length} image{images.length === 1 ? '' : 's'} · open group
                  </Text>
                </TouchableOpacity>
              )}
              <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 6, lineHeight: 13 }}>
                {canShareAll
                  ? 'One tap: the caption is copied and all images are handed to the Facebook app — pick your group and paste the caption (Meta blocks prefilled captions).'
                  : 'One click does the prep. Desktop browsers can\'t inject files into the Facebook composer, so drag the downloaded images in and paste the copied caption. On a phone, this becomes a true one-tap share.'}
              </Text>

              {/* individual steps (fallback / à la carte) */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <TouchableOpacity style={[st.btnGhost, { flex: 1, minWidth: 100 }]} onPress={copyCaption}>
                  <Text style={st.btnGhostText}>📋 Copy Caption</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnGhost, { flex: 1, minWidth: 100, opacity: destUrl.trim() ? 1 : 0.6 }]} disabled={!destUrl.trim()} onPress={openFacebook}>
                  <Text style={st.btnGhostText}>Open {surface === 'cross' ? 'Group' : SURFACE_LABELS[surface].label} ↗</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnGhost, { flex: 1, minWidth: 100, opacity: busy ? 0.5 : 1 }]} disabled={busy} onPress={markHandedOff}>
                  <Text style={st.btnGhostText}>✓ Mark Posted</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {resultMsg && (
            <Card style={{ padding: 10, marginBottom: 10, backgroundColor: resultMsg.startsWith('❌') || resultMsg.startsWith('⛔') ? colors.errorLight : colors.successLight }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: resultMsg.startsWith('❌') || resultMsg.startsWith('⛔') ? colors.error : colors.success }}>{resultMsg}</Text>
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

    {/* hidden capture stages */}
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
      /* translate (not extreme offset) keeps the node painted — extreme offsets
         get paint-culled and the capture comes back blank */
      <View style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: 5000 }] as any, pointerEvents: 'none' }} collapsable={false}>
        <SocialBriefCard ref={briefRef} data={briefData} variant={briefRender.variant} groupTier={briefRender.groupTier} />
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
