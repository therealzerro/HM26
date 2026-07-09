/**
 * PublishView — operator social publishing console (SOCIAL-01).
 *
 * One screen, two publishing lanes, one safety engine:
 *  - PAGE lane (Tier 1): text posts published directly via the fb-publish
 *    edge function → Meta Graph API. Text-only by design — the brief's
 *    sanctioned public formats (report card, signal announcement) carry no
 *    images, which is what keeps the recommendation status safe.
 *  - GROUP lane (Tiers 2/3/4): Meta removed the Groups API in April 2024, so
 *    this is the industry-standard assisted flow (same as Buffer/Hootsuite
 *    "reminder publishing"): caption → clipboard, image → existing export
 *    pipeline, human pastes inside Facebook. Every handoff is logged for
 *    history + the same-day duplicate-caption check (Tier-3 spam rule).
 *
 * Captions come from lib/social/captions (brief §10 templates + variation);
 * every caption is linted live by lib/social/brandLint at the destination
 * tier. Blocking violations disable publish on the page lane.
 *
 * Admin surface — brand-voice display rules do not apply here, but the
 * CONTENT this produces is public-facing and fully governed by the brief.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { lintCaption, LintResult } from '@/lib/social/brandLint';
import { generateCaption, CaptionKind, CaptionData, KIND_TIER, KIND_LABELS } from '@/lib/social/captions';
import { fetchReportCardData } from '@/lib/social/reportCard';
import { fbPublish, PageStatus } from '@/lib/social/fbPublishClient';
import { AdminKeyMissingError } from '@/lib/subscriberAdminClient';
import { AdminKeyGate } from './AdminKeyGate';
import { Pill, SectionTitle, Card, useSt, timeAgo } from './AdminShared';

const KINDS: CaptionKind[] = ['report_card', 'signal_announce', 'group_drop', 'cross_post', 'pro_drop'];
const PAGE_KINDS = new Set<CaptionKind>(['report_card', 'signal_announce']);

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
  const [variant, setVariant] = useState(0);
  const [caption, setCaption] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataNote, setDataNote] = useState<string | null>(null);
  const [targetName, setTargetName] = useState('free group');
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [urls, setUrls] = useState<{ free?: string; pro?: string; proPrice?: string }>({});

  const tier = kind ? KIND_TIER[kind] : 1;
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

  const buildCaption = useCallback(async (k: CaptionKind, v: number) => {
    setDataLoading(true);
    setDataNote(null);
    setResultMsg(null);
    try {
      const today = getTodayET();
      const data: CaptionData = { dateLabel: mdLabel(today), freeGroupUrl: urls.free, proUrl: urls.pro, proPrice: urls.proPrice };
      if (k === 'report_card') {
        const yesterday = getYesterdayET();
        const rc = await fetchReportCardData(yesterday);
        data.dateLabel = mdLabel(yesterday);
        data.totalSignals = rc.totalSignals;
        data.verifiedCount = rc.verifiedCount;
        data.jurisdictionCount = rc.jurisdictionCount;
        data.matches = rc.matches;
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
    buildCaption(k, 0);
  }, [buildCaption]);

  const nextVariant = useCallback(() => {
    if (!kind) return;
    const v = variant + 1;
    setVariant(v);
    buildCaption(kind, v);
  }, [kind, variant, buildCaption]);

  // ── PAGE lane ──
  const publishToPage = useCallback(async (scheduledFor?: string) => {
    if (!kind || !caption.trim()) return;
    if (!lint.ok) {
      Alert.alert('Caption blocked', 'Fix the blocking vocabulary violations first — they protect the page recommendation.');
      return;
    }
    const when = scheduledFor ? 'Schedule for tomorrow 8:15 AM ET' : 'Publish NOW to the public page';
    Alert.alert(when + '?', 'Text-only post via the Page API. The publish log records it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: scheduledFor ? 'Schedule' : 'Publish',
        onPress: async () => {
          setBusy(true);
          setResultMsg(null);
          try {
            const r = await fbPublish.publishPageText({ message: caption, kind, scheduledFor });
            setResultMsg(scheduledFor ? `🕗 Scheduled — post ID ${r.postId}` : `✅ Published — post ID ${r.postId}`);
            loadHistory();
          } catch (e: any) {
            if (e?.code === 'tier1_lint_failed') {
              setResultMsg(`❌ Server lint refused: ${(e.violations ?? []).join(', ')}`);
            } else {
              setResultMsg(`❌ ${String(e?.message ?? e)}`);
            }
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [kind, caption, lint.ok, loadHistory]);

  // ── GROUP lane (assisted) ──
  const copyCaption = useCallback(async () => {
    await Clipboard.setStringAsync(caption);
    setResultMsg('📋 Caption copied — paste it inside Facebook.');
  }, [caption]);

  const openFacebook = useCallback(() => {
    const url = tier === 4 ? (urls.pro || urls.free) : urls.free;
    Linking.openURL(url || 'https://www.facebook.com/groups/');
  }, [tier, urls]);

  const markHandedOff = useCallback(async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const r = await fbPublish.logAssist({
        caption, tier, kind,
        targetName: kind === 'cross_post' ? targetName : (tier === 4 ? 'pro group' : 'free group'),
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
  }, [kind, caption, tier, targetName, loadHistory]);

  return (
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

          {/* Actions */}
          <SectionTitle>{isPageKind ? 'PUBLISH — PUBLIC PAGE (API)' : 'ASSISTED POST — GROUPS'}</SectionTitle>
          {isPageKind ? (
            <Card style={{ padding: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
                Text-only post. Tier-1 lint must be clean — it protects the page&apos;s recommended status. The edge function re-checks server-side.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[st.btnPrimary, { flex: 1, opacity: busy || !lint.ok || !pageStatus?.tokenValid ? 0.5 : 1 }]}
                  disabled={busy || !lint.ok || !pageStatus?.tokenValid}
                  onPress={() => publishToPage()}
                >
                  <Text style={st.btnPrimaryText}>{busy ? '⏳ Working…' : '⚡ Publish Now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.btnGhost, { opacity: busy || !lint.ok || !pageStatus?.tokenValid ? 0.5 : 1 }]}
                  disabled={busy || !lint.ok || !pageStatus?.tokenValid}
                  onPress={() => publishToPage(tomorrowMorningEtIso())}
                >
                  <Text style={st.btnGhostText}>🕗 Tomorrow 8:15a</Text>
                </TouchableOpacity>
              </View>
            </Card>
          ) : (
            <Card style={{ padding: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: 10, color: colors.textSecondary, lineHeight: 15, marginBottom: 10 }}>
                Meta removed the Groups API (April 2024) — no tool can auto-post to groups. This is the sanctioned flow: copy the caption, generate the image, paste both inside Facebook yourself. Prefilled captions are prohibited by Meta policy, so the clipboard step is the correct pattern, not a workaround.
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
                <TouchableOpacity style={st.btnGhost} onPress={() => router.push('/admin-image-export' as any)}>
                  <Text style={st.btnGhostText}>2️⃣ Generate Image (Image Exporter{tier === 4 ? ' — PRO mode' : ' — PUBLIC mode for cross-posts'})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.btnGhost} onPress={openFacebook}>
                  <Text style={st.btnGhostText}>3️⃣ Open Facebook {Platform.OS === 'web' ? '(new tab)' : ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.btnGhost, { opacity: busy ? 0.5 : 1 }]} disabled={busy} onPress={markHandedOff}>
                  <Text style={st.btnGhostText}>4️⃣ Mark Posted (log + duplicate check)</Text>
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
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, flex: 1 }}>{p.kind} · {p.destination}{p.target_name ? ` · ${p.target_name}` : ''}</Text>
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
  );
}

export default function PublishView() {
  return (
    <AdminKeyGate>
      <PublishInner />
    </AdminKeyGate>
  );
}
