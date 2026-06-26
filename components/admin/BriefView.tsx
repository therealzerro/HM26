// components/admin/BriefView.tsx
//
// Admin-only daily brief generator. Renders a per-scope brief card
// (Morning = midday / Evening / All-Day) and shares it as a PNG via
// react-native-view-shot + expo-sharing (lib/zk30/shareSlate.ts). Computation
// is client-side + read-only (hooks/useBrief.ts → lib/brief/computeBrief.ts).
//
// Admin surface: brand-voice rules do NOT apply here — "picks", "hits", "box",
// "straight" all stay.

import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/theme';
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
  const [scope, setScope] = useState<Scope>('allday');
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  const tab = SCOPE_TABS.find(t => t.scope === scope)!;
  const sb: ScopeBrief | undefined = data?.scopes?.[scope];
  const isWeb = briefIsWeb();
  const canPhotos = useMemo(() => briefPhotosAvailable(), []);

  const fileName = () => `brief_${tab.label.toLowerCase()}_${data?.date ?? ''}`;

  const run = async (label: string, fn: () => Promise<void>, doneMsg: string | null) => {
    if (!cardRef.current || !data) return;
    setShareMsg(label);
    try {
      await fn();
      setShareMsg(doneMsg);
    } catch (e) {
      // Web Share AbortError = user dismissed the sheet; not an error.
      if (e instanceof Error && e.name === 'AbortError') { setShareMsg(null); return; }
      setShareMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
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
          {/* scope tabs */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 12 }}>
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

          {/* the capture target */}
          {sb && <BriefCard ref={cardRef} brief={data} sb={sb} label={tab.label} color={tab.color} />}

          {/* save / share — web download is the primary "save", mirroring image-export */}
          {isWeb ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity style={[st.btnPrimary, { flex: 1 }]} onPress={onDownload}>
                <Text style={st.btnPrimaryText}>💾 Save {tab.label} PNG</Text>
              </TouchableOpacity>
              {canPhotos && (
                <TouchableOpacity style={[st.btnGhost, { flex: 1 }]} onPress={onPhotos}>
                  <Text style={st.btnGhostText}>📲 Save to Photos</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={[st.btnPrimary, { marginTop: 14 }]} onPress={onShareNative}>
              <Text style={st.btnPrimaryText}>📤 Share {tab.label} brief (PNG)</Text>
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

// ── the renderable / shareable card ──────────────────────────────────────────
const BriefCard = React.forwardRef<View, { brief: BriefData; sb: ScopeBrief; label: string; color: string }>(
  function BriefCard({ brief, sb, label, color }, ref) {
    const y = sb.yesterday;
    const pf = sb.preflight;
    const drift = (d7: number | null, d30: number | null) => (d7 != null && d30 != null ? Math.round(d7 - d30) : null);

    const HIT = '#15803d', MISS = '#b91c1c', BLUE = '#1d4ed8';
    const statusColor = pf.status === 'PASS' ? BLUE : pf.status === 'FAIL' || pf.status === 'MISSING' ? MISS : '#b45309';

    return (
      <View ref={ref} collapsable={false} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e6ebf3' }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: '#1a2233' }}>{label} Brief</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color }}>{brief.date}</Text>
        </View>
        <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, backgroundColor: '#eef4ff', borderWidth: 1, borderColor: '#c3d6ff' }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#1d4ed8' }}>ALL STATES · box · ride ≤3d</Text>
        </View>

        {/* [1] yesterday */}
        <CardSection title={`1 · Yesterday (${brief.yesterday})`}>
          <Row>
            <Badge text={y.slateHit ? 'SLATE HIT' : 'SLATE MISS'} bg={y.slateHit ? HIT : MISS} />
            <Text style={cs.kv}>{y.picksHit}/6 picks{y.stateInst ? `  ·  ${y.stateInst} state-inst.` : ''}</Text>
          </Row>
          <Text style={cs.line}>
            Pick #1 <Mono>{y.pick1Combo ?? '—'}</Mono> → <Text style={{ color: y.pick1Hit ? HIT : MISS, fontWeight: '800' }}>{y.pick1Hit ? 'HIT' : 'MISS'}</Text>
            {y.hittingCombos.length ? <Text style={{ color: '#5b6b86' }}>   ·   hit: <Mono>{y.hittingCombos.join(' · ')}</Mono></Text> : null}
          </Text>
          <Text style={cs.dim}>
            Rolling: 7d {sb.rolling.d7.pct ?? '–'}% ({sb.rolling.d7.hit}/{sb.rolling.d7.tot}) · 30d {sb.rolling.d30.pct ?? '–'}% ({sb.rolling.d30.hit}/{sb.rolling.d30.tot})
            {drift(sb.rolling.d7.pct, sb.rolling.d30.pct) != null ? `  ·  drift ${drift(sb.rolling.d7.pct, sb.rolling.d30.pct)}pp` : ''}
          </Text>
        </CardSection>

        {/* [2] preflight */}
        <CardSection title="2 · Today Pre-Flight">
          <Row>
            <Badge text={pf.status} bg={statusColor} />
            <Text style={cs.kv}>Pick #1 <Mono>{pf.pick1Combo ?? '—'}</Mono>{pf.pick1Tag ? ` (${pf.pick1Tag})` : ''} · straight <Mono>{pf.pick1Straight ?? '—'}</Mono></Text>
          </Row>
          <Text style={cs.dim}>{pf.pickCount} picks · engine {pf.engineVersion ?? '?'}</Text>
        </CardSection>

        {/* [3] picks */}
        <CardSection title="3 · Picks (tier-ranked)">
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e6ebf3', paddingBottom: 4, marginBottom: 2 }}>
            <Text style={[cs.th, { flex: 1.5 }]}>TIER</Text>
            <Text style={[cs.th, { width: 40 }]}>COMBO</Text>
            <Text style={[cs.th, { width: 34, textAlign: 'right' }]}>SLOT</Text>
            <Text style={[cs.th, { width: 34, textAlign: 'right' }]}>90d</Text>
            <Text style={[cs.th, { width: 44, textAlign: 'right' }]}>P(hit)</Text>
            <Text style={[cs.th, { width: 44, textAlign: 'right' }]}>CONV</Text>
          </View>
          {sb.picks.map((p, i) => <PickRow key={i} p={p} />)}
        </CardSection>

        {/* [4] play */}
        <CardSection title="4 · Recommended Play">
          {sb.play.map((p, i) => (
            <View key={i} style={{ marginTop: i ? 6 : 0, padding: 9, borderRadius: 8, backgroundColor: '#f7faff', borderWidth: 1, borderColor: '#c3d6ff' }}>
              <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#1d4ed8' }}>{i === 0 ? 'PRIMARY' : 'SECONDARY'}</Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: '#1a2233', letterSpacing: 3, marginVertical: 2 }}>{p.combo.split('').join(' ')}</Text>
              <Text style={cs.dim}>
                box (all states) + straight <Mono>{p.bestOrder}</Mono> · {p.tier} · 90d {p.footprint90} · P {p.pHit}%
                {p.convScopes.length > 1 ? ` · conv ${p.convScopes.map(s => s[0].toUpperCase()).join('+')}` : ''} · 14d {p.hits14d}
              </Text>
            </View>
          ))}
          {!sb.play.length && <Text style={cs.dim}>No singles picks to recommend.</Text>}
        </CardSection>

        {/* [5] flags */}
        <CardSection title="5 · Red Flags & Notes">
          {sb.flags.map((f, i) => (
            <Text key={i} style={[cs.dim, { marginBottom: 4 }]}>• {f}</Text>
          ))}
        </CardSection>

        <Text style={{ fontSize: 8, color: '#8593a8', marginTop: 12, borderTopWidth: 1, borderTopColor: '#e6ebf3', paddingTop: 6 }}>
          calib {brief.calibFittedAt ? String(brief.calibFittedAt).slice(0, 10) : 'n/a'}
          {brief.calibAgeDays != null ? ` (${brief.calibAgeDays}d)` : ''} · top-10 JX footprint · HitMaster ZK6
        </Text>
      </View>
    );
  }
);

// ── small presentational helpers (white-card palette, capture-stable) ────────
function PickRow({ p }: { p: BriefPick }) {
  const t1 = p.tierRank <= 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#f0f3f8', backgroundColor: t1 ? '#fff7ed' : 'transparent' }}>
      <Text style={[cs.td, { flex: 1.5, fontWeight: t1 ? '800' as const : '500' as const, color: t1 ? '#c2410c' : '#3a4a64' }]}>{p.tier}</Text>
      <Text style={[cs.td, cs.mono, { width: 40 }]}>{p.combo}</Text>
      <Text style={[cs.td, { width: 34, textAlign: 'right' }]}>#{p.slatePos}</Text>
      <Text style={[cs.td, { width: 34, textAlign: 'right', fontWeight: '700' as const }]}>{p.footprint90}</Text>
      <Text style={[cs.td, { width: 44, textAlign: 'right', fontWeight: '800' as const, color: p.pHit >= 7 ? '#15803d' : '#1a2233' }]}>{p.pHit}%</Text>
      <Text style={[cs.td, { width: 44, textAlign: 'right' }]}>{p.convScopes.length > 1 ? p.convScopes.map(s => s[0].toUpperCase()).join('+') : '—'}</Text>
    </View>
  );
}
function CardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#0b3a86', borderBottomWidth: 2, borderBottomColor: '#0b3a86', paddingBottom: 3, marginBottom: 6 }}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>{children}</View>;
}
function Badge({ text, bg }: { text: string; bg: string }) {
  return <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: bg }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{text}</Text></View>;
}
function Mono({ children }: { children: React.ReactNode }) {
  return <Text style={cs.mono}>{children}</Text>;
}

const cs = StyleSheet.create({
  th: { fontSize: 8, fontWeight: '800', color: '#8593a8', letterSpacing: 0.5 },
  td: { fontSize: 11, color: '#1a2233' },
  kv: { fontSize: 11.5, color: '#1a2233', fontWeight: '600' },
  line: { fontSize: 11.5, color: '#1a2233', marginTop: 3 },
  dim: { fontSize: 10.5, color: '#5b6b86', lineHeight: 15 },
  mono: { fontWeight: '800', letterSpacing: 1, color: '#1a2233' },
});
