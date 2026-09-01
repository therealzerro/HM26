// components/admin/BriefView.tsx
//
// Admin-only daily brief generator. Two modes:
//  · Full Brief — the cross-scope morning brief (runbook 5-section layout):
//    yesterday validation + reorder check, pre-flight, tier table with 90d
//    jurisdiction strings, unit allocation, red flags.
//  · Scope Cards — per-scope card (Morning / Evening / All-Day).
// Both share as PNG via react-native-view-shot + expo-sharing. Computation
// is client-side + read-only (hooks/useBrief.ts → lib/brief/computeBrief.ts).
//
// Admin surface: brand-voice rules do NOT apply here — "picks", "hits", "box",
// "straight" all stay.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, useWindowDimensions, type TextProps } from 'react-native';
import { useTheme } from '@/lib/theme';
import { theme } from '@/constants/theme';
import { useSt } from './AdminShared';
import { useBrief } from '@/hooks/useBrief';
import { briefIsWeb, briefPhotosAvailable, downloadBriefPng, saveBriefToPhotos, shareBriefNative } from '@/lib/brief/saveBrief';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import type { Scope, ScopeBrief, BriefData, BriefPick } from '@/lib/brief/computeBrief';

const SCOPE_TABS: { scope: Scope; label: string; color: string }[] = [
  { scope: 'midday', label: 'Morning', color: '#b8860b' },
  { scope: 'evening', label: 'Evening', color: '#6d28d9' },
  { scope: 'allday', label: 'All-Day', color: '#0f766e' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function BriefView() {
  const { colors } = useTheme();
  const st = useSt();
  const { data, isLoading, error, runDate, generate, refetch } = useBrief();

  const [dateInput, setDateInput] = useState<string>(getTodayET());
  const [mode, setMode] = useState<'full' | 'scope'>('full');
  const [scope, setScope] = useState<Scope>('allday');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<View>(null);

  const tab = SCOPE_TABS.find(t => t.scope === scope)!;
  const sb: ScopeBrief | undefined = data?.scopes?.[scope];
  const isWeb = briefIsWeb();
  const canPhotos = useMemo(() => briefPhotosAvailable(), []);

  const fileName = () => mode === 'full'
    ? `brief_full_${data?.date ?? ''}`
    : `brief_${tab.label.toLowerCase()}_${data?.date ?? ''}`;

  const run = async (label: string, fn: () => Promise<void>, doneMsg: string | null) => {
    if (!cardRef.current || !data || capturing) return;
    setCapturing(true);
    setShareMsg(label);
    try {
      await fn();
      setShareMsg(doneMsg);
    } catch (e) {
      // Web Share AbortError = user dismissed the sheet; not an error.
      if (e instanceof Error && e.name === 'AbortError') { setShareMsg(null); return; }
      setShareMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCapturing(false);
    }
  };

  const onDownload  = () => run('Capturing…', () => downloadBriefPng(cardRef, fileName()), 'Saved — check your downloads.');
  const onPhotos    = () => run('Capturing…', () => saveBriefToPhotos(cardRef, fileName()), null);
  const onShareNative = () => run('Capturing…', () => shareBriefNative(cardRef, fileName()), null);

  const validDate = DATE_RE.test(dateInput);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={st.title}>Daily Brief</Text>
      <Text style={st.sub}>Per-scope intelligence brief · read-only · share as image</Text>

      {/* date controls */}
      <Text style={st.fieldLabel}>Brief date (ET)</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <TouchableOpacity style={[st.optBtn, dateInput === getTodayET() && st.optBtnOn]} onPress={() => setDateInput(getTodayET())}>
          <Text style={[st.optBtnText, dateInput === getTodayET() && st.optBtnTextOn]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.optBtn, dateInput === getYesterdayET() && st.optBtnOn]} onPress={() => setDateInput(getYesterdayET())}>
          <Text style={[st.optBtnText, dateInput === getYesterdayET() && st.optBtnTextOn]}>Yesterday</Text>
        </TouchableOpacity>
        <TextInput
          value={dateInput}
          onChangeText={setDateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          style={{ borderWidth: 1.5, borderColor: validDate ? colors.border : colors.error, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text, minWidth: 130 }}
        />
      </View>

      <TouchableOpacity
        style={[st.btnPrimary, (!validDate || isLoading) && { opacity: 0.5 }]}
        disabled={!validDate || isLoading}
        onPress={() => (dateInput === runDate ? refetch() : generate(dateInput))}
      >
        {isLoading
          ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color="#fff" size="small" /><Text style={st.btnPrimaryText}>Generating…</Text></View>
          : <Text style={st.btnPrimaryText}>{data ? 'Regenerate' : 'Generate Brief'}</Text>}
      </TouchableOpacity>

      {error && (
        <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: colors.error + '12', borderWidth: 1, borderColor: colors.error + '30' }}>
          <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>Generate failed</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{error.message}</Text>
        </View>
      )}

      {data && (
        <>
          {/* mode toggle */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 8 }}>
            {([['full', '📋 Full Brief'], ['scope', '🃏 Scope Cards']] as const).map(([m, label]) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: mode === m ? colors.primary : colors.border, backgroundColor: mode === m ? colors.primary + '14' : 'transparent' }}
              >
                <Text style={{ fontSize: 12, fontWeight: mode === m ? '800' : '500', color: mode === m ? colors.primary : colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* scope tabs (scope mode only) */}
          {mode === 'scope' && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {SCOPE_TABS.map(t => (
                <TouchableOpacity
                  key={t.scope}
                  onPress={() => setScope(t.scope)}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: scope === t.scope ? t.color : colors.border, backgroundColor: scope === t.scope ? t.color + '14' : 'transparent' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: scope === t.scope ? '800' : '500', color: scope === t.scope ? t.color : colors.textSecondary }}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* the capture target — fixed 540pt stage → deterministic 1080px PNG */}
          <CaptureStage capturing={capturing}>
            {mode === 'full'
              ? <FullBriefCard ref={cardRef} brief={data} />
              : sb && <BriefCard ref={cardRef} brief={data} sb={sb} label={tab.label} color={tab.color} />}
          </CaptureStage>

          {/* save / share — web download is the primary "save", mirroring image-export */}
          {isWeb ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1 }, capturing && { opacity: 0.5 }]} disabled={capturing} onPress={onDownload}>
                <Text style={st.btnPrimaryText}>💾 Save {mode === 'full' ? 'Full Brief' : tab.label} PNG</Text>
              </TouchableOpacity>
              {canPhotos && (
                <TouchableOpacity style={[st.btnGhost, { flex: 1 }, capturing && { opacity: 0.5 }]} disabled={capturing} onPress={onPhotos}>
                  <Text style={st.btnGhostText}>📲 Save to Photos</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={[st.btnPrimary, { marginTop: 14 }, capturing && { opacity: 0.5 }]} disabled={capturing} onPress={onShareNative}>
              <Text style={st.btnPrimaryText}>📤 Share {mode === 'full' ? 'full' : tab.label} brief (PNG)</Text>
            </TouchableOpacity>
          )}
          {shareMsg && <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6, textAlign: 'center' }}>{shareMsg}</Text>}
          <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: 10, textAlign: 'center' }}>
            Generated for {data.date} · all-states view · faithful slate ∩ histories
          </Text>
        </>
      )}
    </ScrollView>
  );
}

// ── capture stage ────────────────────────────────────────────────────────────
// The card lays out at a fixed 540pt width — the same "pin the output size"
// idiom as the image-export pipeline's 1080×1920 hidden stage in
// lib/captureExportImage.ts — so captureNodeToPngNatural (pixelRatio 2) always
// emits a deterministic 1080px-wide PNG, independent of device width. On
// narrow screens the stage is visually scaled down to fit; the capture reads
// the unscaled card node (the wrapper's transform never enters the clone), so
// the preview scale can't leak into the PNG.
const CAPTURE_WIDTH = 540;

function CaptureStage({ capturing, children }: { capturing: boolean; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const avail = width - 32; // ScrollView contentContainer padding (16 × 2)
  const scale = Math.min(1, avail / CAPTURE_WIDTH);
  const [cardH, setCardH] = useState(0);

  return (
    <View style={{ height: cardH ? cardH * scale : undefined, alignItems: scale < 1 ? 'flex-start' : 'center' }}>
      <View
        style={{ width: CAPTURE_WIDTH, transform: [{ scale }], transformOrigin: '0 0' }}
        onLayout={e => setCardH(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
      {/* capture-in-progress overlay — sibling of the card ref, so it never
          appears in the exported PNG (web clones the card node; native
          captureRef snapshots the card subtree only). */}
      {capturing && (
        <View style={cs.captureOverlay}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={cs.captureOverlayText} maxFontSizeMultiplier={1}>Rendering…</Text>
        </View>
      )}
    </View>
  );
}

// ── shared card constants (BriefCard + FullBriefCard) ────────────────────────
// Fixed white-card palette — deliberately NOT useTheme(), so the exported PNG
// is identical in light and dark app modes.
const C = {
  HIT: '#15803d',
  MISS: '#b91c1c',
  BLUE: '#1d4ed8',
  AMBER: '#b45309',
  ink: '#1a2233',
} as const;

const drift = (d7: number | null, d30: number | null) => (d7 != null && d30 != null ? Math.round(d7 - d30) : null);

// Capture-bound Text: OS accessibility font scaling is capped so it can't
// reflow the fixed-width export layout.
function CapText(props: TextProps) {
  return <Text maxFontSizeMultiplier={1} {...props} />;
}

function CardHeader({ title, date, dateColor, pill }: { title: string; date: string; dateColor: string; pill: string }) {
  return (
    <>
      <View style={cs.headerRow}>
        <CapText style={cs.headerTitle}>{title}</CapText>
        <CapText style={[cs.headerDate, { color: dateColor }]}>{date}</CapText>
      </View>
      <View style={cs.pill}><CapText style={cs.pillText}>{pill}</CapText></View>
    </>
  );
}

function CardFooter({ brief, extra }: { brief: BriefData; extra?: string }) {
  return (
    <View style={cs.footerWrap}>
      <CapText style={cs.wordmark}>HITMASTER <CapText style={{ color: C.BLUE }}>ZK6</CapText></CapText>
      <CapText style={cs.footerMeta}>
        calib {brief.calibFittedAt ? String(brief.calibFittedAt).slice(0, 10) : 'n/a'}
        {brief.calibAgeDays != null ? ` (${brief.calibAgeDays}d)` : ''}
        {extra ? ` · ${extra}` : ''} · top-10 JX footprint
      </CapText>
    </View>
  );
}

// ── the renderable / shareable card ──────────────────────────────────────────
const BriefCard = React.forwardRef<View, { brief: BriefData; sb: ScopeBrief; label: string; color: string }>(
  function BriefCard({ brief, sb, label, color }, ref) {
    const y = sb.yesterday;
    const pf = sb.preflight;

    const statusColor = pf.status === 'PASS' ? C.BLUE : pf.status === 'FAIL' || pf.status === 'MISSING' ? C.MISS : C.AMBER;

    return (
      <View ref={ref} collapsable={false} style={cs.card}>
        <CardHeader title={`${label} Brief`} date={brief.date} dateColor={color} pill="ALL STATES · box · ride ≤3d" />

        {/* [1] yesterday */}
        <CardSection title={`1 · Yesterday (${brief.yesterday})`}>
          <Row>
            <Badge text={y.slateHit ? 'SLATE HIT' : 'SLATE MISS'} bg={y.slateHit ? C.HIT : C.MISS} />
            <CapText style={cs.kv}>{y.picksHit}/6 picks{y.stateInst ? `  ·  ${y.stateInst} state-inst.` : ''}</CapText>
          </Row>
          <CapText style={cs.line}>
            Pick #1 <Mono>{y.pick1Combo ?? '—'}</Mono> → <CapText style={{ color: y.pick1Hit ? C.HIT : C.MISS, fontWeight: '800' }}>{y.pick1Hit ? 'HIT' : 'MISS'}</CapText>
            {y.hittingCombos.length ? <CapText style={{ color: '#5b6b86' }}>   ·   hit: <Mono>{y.hittingCombos.join(' · ')}</Mono></CapText> : null}
          </CapText>
          <CapText style={cs.dim}>
            Rolling: 7d {sb.rolling.d7.pct ?? '–'}% ({sb.rolling.d7.hit}/{sb.rolling.d7.tot}) · 30d {sb.rolling.d30.pct ?? '–'}% ({sb.rolling.d30.hit}/{sb.rolling.d30.tot})
            {drift(sb.rolling.d7.pct, sb.rolling.d30.pct) != null ? `  ·  drift ${drift(sb.rolling.d7.pct, sb.rolling.d30.pct)}pp` : ''}
          </CapText>
        </CardSection>

        {/* [2] preflight */}
        <CardSection title="2 · Today Pre-Flight">
          <Row>
            <Badge text={pf.status} bg={statusColor} />
            <CapText style={cs.kv}>Pick #1 <Mono>{pf.pick1Combo ?? '—'}</Mono>{pf.pick1Tag ? ` (${pf.pick1Tag})` : ''} · straight <Mono>{pf.pick1Straight ?? '—'}</Mono></CapText>
          </Row>
          <CapText style={cs.dim}>{pf.pickCount} picks · engine {pf.engineVersion ?? '?'}</CapText>
        </CardSection>

        {/* [3] picks */}
        <CardSection title="3 · Picks (tier-ranked)">
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e6ebf3', paddingBottom: 4, marginBottom: 2 }}>
            <CapText style={[cs.th, { flex: 1.5 }]}>TIER</CapText>
            <CapText style={[cs.th, { width: 40 }]}>COMBO</CapText>
            <CapText style={[cs.th, { width: 34, textAlign: 'right' }]}>SLOT</CapText>
            <CapText style={[cs.th, { width: 34, textAlign: 'right' }]}>90d</CapText>
            <CapText style={[cs.th, { width: 44, textAlign: 'right' }]}>P(hit)</CapText>
            <CapText style={[cs.th, { width: 44, textAlign: 'right' }]}>CONV</CapText>
          </View>
          {sb.picks.map((p, i) => <PickRow key={i} p={p} />)}
        </CardSection>

        {/* [4] play */}
        <CardSection title="4 · Recommended Play">
          {sb.play.map((p, i) => (
            <View key={i} style={[cs.playBox, i ? { marginTop: 6 } : null]}>
              <CapText style={cs.playEyebrow}>{i === 0 ? 'PRIMARY' : 'SECONDARY'}</CapText>
              <CapText style={cs.playCombo}>{p.combo.split('').join(' ')}</CapText>
              <CapText style={cs.dim}>
                box (all states) + straight <Mono>{p.bestOrder}</Mono> · {p.tier} · 90d {p.footprint90} · P {p.pHit}%
                {p.convScopes.length > 1 ? ` · conv ${p.convScopes.map(s => s[0].toUpperCase()).join('+')}` : ''} · 14d {p.hits14d}
              </CapText>
            </View>
          ))}
          {!sb.play.length && <CapText style={cs.dim}>No singles picks to recommend.</CapText>}
        </CardSection>

        {/* [5] flags */}
        <CardSection title="5 · Red Flags & Notes">
          {sb.flags.map((f, i) => (
            <CapText key={i} style={[cs.dim, { marginBottom: 4 }]}>• {f}</CapText>
          ))}
        </CardSection>

        <CardFooter brief={brief} />
      </View>
    );
  }
);

// ── the full cross-scope morning brief (runbook 5-section layout) ────────────
const SCOPE_SHORT: Record<Scope, string> = { midday: 'MID', evening: 'EVE', allday: 'ALL' };
const SCOPE_ORDER: Scope[] = ['midday', 'evening', 'allday'];

const FullBriefCard = React.forwardRef<View, { brief: BriefData }>(
  function FullBriefCard({ brief }, ref) {
    // tier table: T1/T2 expanded, T3/T4 as a count
    const expanded = SCOPE_ORDER.flatMap(s => brief.scopes[s]?.picks ?? [])
      .filter(p => p.tierRank <= 4)
      .sort((a, b) => a.tierRank - b.tierRank || b.footprint90 - a.footprint90 || b.pHit - a.pHit);
    const restCount = SCOPE_ORDER.reduce((n, s) => n + (brief.scopes[s]?.picks.filter(p => p.tierRank > 4).length ?? 0), 0);

    return (
      <View ref={ref} collapsable={false} style={cs.card}>
        <CardHeader title="Morning Brief" date={brief.date} dateColor={C.BLUE} pill="CROSS-SCOPE · ALL STATES · box · ride ≤3d" />

        {/* [1] yesterday validation */}
        <CardSection title={`1 · Yesterday (${brief.yesterday})`}>
          {SCOPE_ORDER.map(s => {
            const sb = brief.scopes[s];
            if (!sb) return null;
            const y = sb.yesterday, r = sb.rolling, dr = drift(r.d7.pct, r.d30.pct);
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f0f3f8' }}>
                <CapText style={[cs.td, cs.mono, { width: 32 }]}>{SCOPE_SHORT[s]}</CapText>
                <Badge text={y.slateHit ? 'HIT' : 'MISS'} bg={y.slateHit ? C.HIT : C.MISS} />
                <CapText style={[cs.td, { width: 30, textAlign: 'center' }]}>{y.picksHit}/6</CapText>
                <CapText style={[cs.td, { flex: 1 }]}>
                  #1 <Mono>{y.pick1Combo ?? '—'}</Mono> <CapText style={{ color: y.pick1Hit ? C.HIT : C.MISS, fontWeight: '800' }}>{y.pick1Hit ? '✓' : '✗'}</CapText>
                </CapText>
                <CapText style={[cs.dim, { width: 118, textAlign: 'right' }]}>
                  7d {r.d7.pct ?? '–'}% · 30d {r.d30.pct ?? '–'}%{dr != null ? ` · ${dr > 0 ? '+' : ''}${dr}pp` : ''}
                </CapText>
              </View>
            );
          })}
          <CapText style={[cs.dim, { marginTop: 5 }]}>
            Reorder check: {brief.reorder.hit}/{brief.reorder.total} pick #1s matched · Workflow:{' '}
            <CapText style={{ color: brief.workflow.stale ? C.MISS : C.HIT, fontWeight: '800' }}>
              {brief.workflow.stale ? 'NOT RUN TODAY' : brief.workflow.reportUpdatedAt ? 'ran ' + String(brief.workflow.reportUpdatedAt).slice(11, 16) + ' UTC' : 'n/a'}
            </CapText>
          </CapText>
        </CardSection>

        {/* [2] pre-flight */}
        <CardSection title="2 · Today Pre-Flight">
          {SCOPE_ORDER.map(s => {
            const pf = brief.scopes[s]?.preflight;
            if (!pf) return null;
            const c = pf.status === 'PASS' ? C.BLUE : pf.status === 'FAIL' || pf.status === 'MISSING' ? C.MISS : C.AMBER;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f0f3f8' }}>
                <CapText style={[cs.td, cs.mono, { width: 32 }]}>{SCOPE_SHORT[s]}</CapText>
                <Badge text={pf.status} bg={c} />
                <CapText style={[cs.td, { flex: 1 }]}>
                  #1 <Mono>{pf.pick1Combo ?? '—'}</Mono>{pf.pick1Tag ? ` (${pf.pick1Tag})` : ''} · str <Mono>{pf.pick1Straight ?? '—'}</Mono>
                </CapText>
                <CapText style={[cs.dim, { width: 70, textAlign: 'right' }]}>{pf.pickCount} picks · {pf.engineVersion ?? '?'}</CapText>
              </View>
            );
          })}
        </CardSection>

        {/* [3] tier table (T1/T2 expanded) */}
        <CardSection title="3 · Strategic Picks (T1–T2)">
          {expanded.map((p, i) => (
            <View key={i} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f0f3f8', backgroundColor: p.tierRank <= 2 ? '#fff7ed' : 'transparent' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <CapText style={[cs.td, { width: 74, fontWeight: p.tierRank <= 2 ? '800' as const : '600' as const, color: p.tierRank <= 2 ? '#c2410c' : '#3a4a64' }]}>{p.tier}</CapText>
                <CapText style={[cs.td, cs.mono, { width: 40 }]}>{p.combo}</CapText>
                <CapText style={[cs.td, { width: 60 }]}>str <Mono>{p.bestOrder}</Mono></CapText>
                <CapText style={[cs.td, { width: 48, textAlign: 'right', fontWeight: '700' as const }]}>90d {p.footprint90}</CapText>
                <CapText style={[cs.td, { flex: 1, textAlign: 'right', fontWeight: '800' as const, color: p.pHit >= 7 ? C.HIT : C.ink }]}>{p.pHit}%</CapText>
              </View>
              <CapText style={[cs.dim, { marginTop: 1 }]}>
                {SCOPE_SHORT[p.scope]} #{p.slatePos}
                {p.convScopes.length > 1 ? ` · conv ${p.convScopes.map(x => SCOPE_SHORT[x]).join('+')}` : ''}
                {p.topJx ? ` · ${p.topJx}` : ''}
              </CapText>
            </View>
          ))}
          {!expanded.length && <CapText style={cs.dim}>No T1/T2 picks today.</CapText>}
          {restCount > 0 && <CapText style={[cs.dim, { marginTop: 4 }]}>+{restCount} picks in T3/T4 (see scope cards).</CapText>}
        </CardSection>

        {/* [4] allocation */}
        <CardSection title="4 · Recommended Allocation">
          {brief.allocation.map((a, i) => (
            <View key={i} style={[cs.playBox, i ? { marginTop: 6 } : null]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <CapText style={cs.playEyebrow}>{a.units} UNIT{a.units > 1 ? 'S' : ''} · {a.withStraight ? 'BOX + STRAIGHT' : 'BOX'}</CapText>
                <CapText style={{ fontSize: 9, fontWeight: '700', color: '#5b6b86' }}>{a.scopes.map(x => SCOPE_SHORT[x]).join('+')}</CapText>
              </View>
              <CapText style={cs.playCombo}>{a.combo.split('').join(' ')}</CapText>
              <CapText style={cs.dim}>
                {a.withStraight ? `straight ${a.bestOrder} · ` : ''}{a.tier} · 90d {a.footprint90} · P {a.pHit}%{a.topJx ? ` · ${a.topJx}` : ''}
              </CapText>
            </View>
          ))}
          {!brief.allocation.length && <CapText style={cs.dim}>No qualifying singles picks to allocate.</CapText>}
          <CapText style={[cs.dim, { marginTop: 6 }]}>Ride style: 1–2 combos at max stake, ride ≤3 days, a match closes the leg.</CapText>
        </CardSection>

        {/* [5] flags */}
        <CardSection title="5 · Red Flags & Notes">
          {brief.globalFlags.map((f, i) => (
            <CapText key={i} style={[cs.dim, { marginBottom: 4 }]}>• {f}</CapText>
          ))}
        </CardSection>

        <CardFooter brief={brief} extra="faithful slate ∩ histories" />
      </View>
    );
  }
);

// ── small presentational helpers (white-card palette, capture-stable) ────────
function PickRow({ p }: { p: BriefPick }) {
  const t1 = p.tierRank <= 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f0f3f8', backgroundColor: t1 ? '#fff7ed' : 'transparent' }}>
      <CapText style={[cs.td, { flex: 1.5, fontWeight: t1 ? '800' as const : '500' as const, color: t1 ? '#c2410c' : '#3a4a64' }]}>{p.tier}</CapText>
      <CapText style={[cs.td, cs.mono, { width: 40 }]}>{p.combo}</CapText>
      <CapText style={[cs.td, { width: 34, textAlign: 'right' }]}>#{p.slatePos}</CapText>
      <CapText style={[cs.td, { width: 34, textAlign: 'right', fontWeight: '700' as const }]}>{p.footprint90}</CapText>
      <CapText style={[cs.td, { width: 44, textAlign: 'right', fontWeight: '800' as const, color: p.pHit >= 7 ? C.HIT : C.ink }]}>{p.pHit}%</CapText>
      <CapText style={[cs.td, { width: 44, textAlign: 'right' }]}>{p.convScopes.length > 1 ? p.convScopes.map(s => s[0].toUpperCase()).join('+') : '—'}</CapText>
    </View>
  );
}
function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <CapText style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#0b3a86', borderBottomWidth: 2, borderBottomColor: '#0b3a86', paddingBottom: 3, marginBottom: 6 }}>{title}</CapText>
      {children}
    </View>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>{children}</View>;
}
function Badge({ text, bg }: { text: string; bg: string }) {
  return <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: bg }}><CapText style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{text}</CapText></View>;
}
function Mono({ children }: { children: React.ReactNode }) {
  return <CapText style={cs.mono}>{children}</CapText>;
}

const cs = StyleSheet.create({
  // shared card chrome (BriefCard + FullBriefCard)
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e6ebf3' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#1a2233' },
  headerDate: { fontSize: 12, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: '#eef4ff', borderWidth: 1, borderColor: '#c3d6ff' },
  pillText: { fontSize: 9, fontWeight: '800', color: '#1d4ed8' },
  playBox: { padding: 9, borderRadius: 8, backgroundColor: '#f7faff', borderWidth: 1, borderColor: '#c3d6ff' },
  playEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#1d4ed8' },
  playCombo: { fontSize: 16, color: '#1a2233', letterSpacing: 3, marginVertical: 2, fontFamily: theme.typography.fontFamily.monoBold },
  footerWrap: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e6ebf3', paddingTop: 6, gap: 2 },
  wordmark: { fontSize: 10, color: '#1a2233', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2 },
  footerMeta: { fontSize: 9, color: '#8593a8' },
  // table / text (min 9pt — capture legibility floor)
  th: { fontSize: 9, fontWeight: '800', color: '#8593a8', letterSpacing: 0.5 },
  td: { fontSize: 11, color: '#1a2233' },
  kv: { fontSize: 11.5, color: '#1a2233', fontWeight: '600' },
  line: { fontSize: 11.5, color: '#1a2233', marginTop: 3 },
  dim: { fontSize: 10.5, color: '#5b6b86', lineHeight: 15 },
  mono: { fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1, color: '#1a2233' },
  // capture-in-progress overlay (rendered outside the captured node)
  captureOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  captureOverlayText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
