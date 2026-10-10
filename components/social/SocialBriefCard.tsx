/* ============================================================================
   SocialBriefCard — publishable, brand-safe consumer brief (SOCIAL-01/05)
   ----------------------------------------------------------------------------
   Presentational only, prop-driven, forwardRef so the Publish console and the
   Reels exporter can capture it to PNG. Renders the MODEL from
   lib/social/briefCopy.ts — every word on the card comes from there, and the
   same model is what lib/social/briefLint.ts lints before capture (MKT-82
   1.5: the brief does not render if it fails).

   Variants (one component):
     public   §6 PUBLIC — yesterday's own-day aggregate counts + jurisdiction
              COUNT only. No digits, no state codes, no pricing. Session words
              are the tier-1 translation (sessionLabels.ts).
     group    free | pro — yesterday per session (STRAIGHT MATCH / BOX MATCH /
              no match, chips) + today's board per session. Pro sees the six
              signals in slate order, exact order + box set; free sees a lock
              and the resolved outcomes. Member session words (MIDDAY ·
              EVENING · ALL-DAY — R4).

   MKT-82 Phase 1 (2026-10-10): the Pro two-column layout, the concentration
   panel (operator stake units + ride rule shown as model output), the analyst
   notes (a rank-exclusion rule retired 9/1, a likelihood claim), the 30d tile
   and the "edge" / "first access" footers are GONE. One footer line, all
   tiers (BRIEF_FOOTER_LINE). The yesterday label is now the verify reel's law
   (briefResolve.ts, F1).

   FIT (F2, hardened 10/10 after a phone refused Pro at 778 > 759 pt): every
   text style carries an explicit lineHeight so platform font metrics cannot
   inflate the layout; the body band is clipped AND measured — `onFit` reports whether
   the content fit inside the band. The capture paths refuse to capture a card
   that did not fit ("layout defect: content does not fit — never shrink").

   FORMAT: fixed 960×960 (MKT-50 addendum 3), exported at 1920×1920 by the
   pixelRatio-2 capture. Cosmic palette (Brief v2 §7), capture-stable colors.
   ============================================================================ */

import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import type { SocialBriefData } from '@/lib/social/socialBrief';
import { buildBriefModel, BRIEF_COPY, setBraces, type BriefModel, type BriefSession, type BriefRow, type BriefVariant, type GroupTier } from '@/lib/social/briefCopy';

const C = {
  bg: '#0A0A0F',
  panel: '#181633',
  panelHi: '#211C44',
  panelEdge: '#332C5E',
  purple: '#A855F7',
  purpleSoft: '#C084FC',
  gold: '#FBBF24',
  goldSoft: '#FCD34D',
  cyan: '#06B6D4',
  cyanSoft: '#67E8F9',
  green: '#34D399',
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.66)',
  textFaint: 'rgba(255,255,255,0.40)',
  hair: 'rgba(255,255,255,0.08)',
};

export interface BriefFit { ok: boolean; contentH: number; bandH: number }

export interface SocialBriefCardProps {
  data: SocialBriefData;
  variant: BriefVariant;
  /** Group-only: 'free' shows the Pro CTA; 'pro' shows the board. */
  groupTier?: GroupTier;
  /** Back-compat: FREE Pro footer. Superseded by groupTier when provided. */
  showProFooter?: boolean;
  /** F2 fit assert — called once both the band and its content have laid out. */
  onFit?: (fit: BriefFit) => void;
}

function tagColor(tag: BriefRow['tag']): string {
  if (tag === 'STRAIGHT MATCH') return C.gold;
  if (tag === 'BOX MATCH') return C.green;
  return C.textFaint;
}

export const SocialBriefCard = forwardRef<View, SocialBriefCardProps>(function SocialBriefCard(
  { data, variant, groupTier, showProFooter, onFit }, ref,
) {
  const tier: GroupTier | undefined = groupTier ?? (variant === 'group' ? (showProFooter ? 'free' : 'pro') : undefined);
  const model = useMemo(() => buildBriefModel(data, variant, tier), [data, variant, tier]);

  // Two-pass fit: the content lays out at its NATURAL height first (that is
  // the number that can exceed the band), the fit is reported from it, and
  // only then is the content stretched to the band so the last panel fills
  // the square. A stretched measurement would always read band == content.
  const [bandH, setBandH] = useState<number | null>(null);
  const [contentH, setContentH] = useState<number | null>(null);
  const naturalRef = useRef<number | null>(null);
  useEffect(() => {
    if (bandH == null || contentH == null) return;
    if (naturalRef.current == null) naturalRef.current = contentH;
    const natural = naturalRef.current;
    onFit?.({ ok: natural <= bandH + 0.5, contentH: natural, bandH });
  }, [bandH, contentH, onFit]);
  const onBand = (e: LayoutChangeEvent) => setBandH(e.nativeEvent.layout.height);
  const onContent = (e: LayoutChangeEvent) => setContentH(e.nativeEvent.layout.height);
  const fill = naturalRef.current != null && bandH != null ? { minHeight: bandH } : null;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>{BRIEF_COPY.brand} <Text style={{ color: C.cyan }}>{BRIEF_COPY.brandAccent}</Text></Text>
          <Text style={styles.kicker}>{model.kicker}</Text>
        </View>
        <View style={[styles.badge, { borderColor: model.tier === 4 ? C.gold : model.tier === 1 ? C.cyan : C.purple }]}>
          <Text style={[styles.badgeText, { color: model.tier === 4 ? C.goldSoft : model.tier === 1 ? C.cyanSoft : C.purpleSoft }]}>{model.badge}</Text>
        </View>
      </View>

      {/* The band is clipped; the content inside grows but never shrinks, so
          an overflow is measurable (contentH > bandH) instead of painting
          over the footer. */}
      <View style={styles.band} onLayout={onBand}>
        <View style={[styles.content, fill]} onLayout={onContent}>
          {model.publicHero ? <PublicBody m={model} /> : <GroupBody m={model} />}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLine}>{model.footer}</Text>
        {model.footerCta ? <Text style={styles.footerCta}>{model.footerCta}</Text> : null}
      </View>
    </View>
  );
});

/* ───────────────────────── PUBLIC — editorial hero ───────────────────────── */
function PublicBody({ m }: { m: BriefModel }) {
  const h = m.publicHero!;
  return (
    <>
      <View style={[styles.panel, styles.heroPanel]}>
        <Text style={styles.heroEyebrow}>{m.yesterdayLabel}</Text>
        <View style={styles.heroFigure}>
          <Text style={styles.heroNum}>{h.num}</Text>
          <Text style={styles.heroSlash}>/</Text>
          <Text style={styles.heroDen}>{h.den}</Text>
        </View>
        <Text style={styles.heroCaption}>{h.caption}</Text>
        <View style={styles.heroRule} />
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>{h.juris}</Text>
            <Text style={styles.heroMetaLabel}>{h.jurisLabel}</Text>
          </View>
          <View style={styles.heroMetaDivider} />
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>{h.tracked}</Text>
            <Text style={styles.heroMetaLabel}>{h.trackedLabel}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.panel, { backgroundColor: C.panelHi, marginBottom: 0 }]}>
        <Text style={styles.panelLabel}>{m.todayLabel}</Text>
        <Text style={styles.publicBody}>{h.body}</Text>
      </View>
      <View style={styles.ctaBand}>
        <Text style={styles.ctaText}>{h.cta}</Text>
      </View>
    </>
  );
}

/* ─────────────── GROUP (free | pro) — single column, receipts first ─────────── */
function GroupBody({ m }: { m: BriefModel }) {
  const isPro = m.tier === 4;
  return (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>{m.yesterdayLabel}</Text>
        <View style={styles.statRow}>
          {(m.stats ?? []).map((s, i) => (
            <View key={i} style={styles.stat}>
              <Text style={[styles.statValue, { color: i === 0 ? C.green : C.cyan }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
        {(m.yesterdayRows ?? []).map((r, i) => <YesterdayRow key={i} r={r} />)}
      </View>

      <View style={[styles.panel, styles.todayPanel]}>
        <Text style={styles.panelLabel}>{m.todayLabel}</Text>
        {isPro
          ? (m.sessions ?? []).map((s, i) => <ProSession key={i} s={s} last={i === (m.sessions!.length - 1)} />)
          : <View style={styles.sessionGrid}>{(m.sessions ?? []).map((s, i) => <FreeSession key={i} s={s} />)}</View>}
      </View>

      {m.release && (
        <View style={styles.releaseBand}>
          <Text style={styles.releaseIcon}>💎</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.releaseTitle}>{m.release.title}</Text>
            <Text style={styles.releaseSub}>{m.release.sub}</Text>
          </View>
        </View>
      )}
    </>
  );
}

function YesterdayRow({ r }: { r: BriefRow }) {
  const chips = r.chips.slice(0, 4);
  const overflow = r.chips.length - chips.length;
  return (
    <View style={styles.yRow}>
      <Text style={styles.yScope}>{r.scopeLabel}</Text>
      <View style={styles.yCombos}>
        {chips.length > 0 ? (
          <>
            {chips.map((c, i) => <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{c}</Text></View>)}
            {overflow > 0 && <Text style={styles.yMore}>+{overflow}</Text>}
          </>
        ) : <Text style={styles.yDash}>—</Text>}
      </View>
      <Text style={[styles.yTag, { color: tagColor(r.tag) }]}>{r.tag}</Text>
    </View>
  );
}

/* Pro: the published board — six signals in slate order, exact order over box set. */
function ProSession({ s, last }: { s: BriefSession; last: boolean }) {
  const stateColor = s.state === BRIEF_COPY.stateLive ? C.cyanSoft : s.resolved ? (s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green) : C.textFaint;
  return (
    <View style={[styles.session, !last && styles.sessionDivider]}>
      <View style={styles.sessionHead}>
        <Text style={styles.sessionScope}>{s.scopeLabel.toUpperCase()}</Text>
        {s.state && <Text style={[styles.sessionState, { color: stateColor }]}>{s.state}</Text>}
      </View>
      {s.resolved ? (
        <View style={styles.resolvedRow}>
          <Text style={[styles.resolvedTag, { color: s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green }]}>{s.resolved.tag}</Text>
          <View style={styles.yCombos}>
            {s.resolved.chips.slice(0, 4).map((c, i) => <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{c}</Text></View>)}
          </View>
        </View>
      ) : s.miss ? (
        <Text style={styles.sessionMiss}>{s.miss}</Text>
      ) : s.none ? (
        <Text style={styles.sessionMiss}>{s.none}</Text>
      ) : (
        <View style={styles.signalRow}>
          {(s.signals ?? []).map((g, i) => (
            <View key={i} style={styles.signal}>
              <Text style={styles.signalDigits}>{g.digits}</Text>
              <Text style={styles.signalSet}>{setBraces(g.set)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* Free: a 3-up tile per session — resolved outcome, or the lock. */
function FreeSession({ s }: { s: BriefSession }) {
  const stateColor = s.state === BRIEF_COPY.stateLive ? C.cyanSoft : s.resolved ? (s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green) : C.textFaint;
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHead}>
        <Text style={styles.sessionScope}>{s.scopeLabel.toUpperCase()}</Text>
        {s.state && <Text style={[styles.sessionState, { color: stateColor }]}>{s.state === BRIEF_COPY.stateLive ? s.state : '✓'}</Text>}
      </View>
      {s.resolved ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[styles.resolvedTag, { color: s.resolved.tag === 'STRAIGHT MATCH' ? C.goldSoft : C.green }]}>{s.resolved.tag}</Text>
          <View style={[styles.yCombos, { marginTop: 8 }]}>
            {s.resolved.chips.slice(0, 3).map((c, i) => <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{c}</Text></View>)}
          </View>
        </View>
      ) : s.miss ? (
        <Text style={styles.sessionMiss}>{s.miss}</Text>
      ) : s.locked ? (
        <View style={styles.lockBox}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockText}>{s.locked}</Text>
        </View>
      ) : (
        <Text style={styles.sessionMiss}>{s.none}</Text>
      )}
    </View>
  );
}

const MONO = 'monospace';

const styles = StyleSheet.create({
  card: { width: 960, height: 960, backgroundColor: C.bg, padding: 30, borderRadius: 26, borderWidth: 1, borderColor: C.panelEdge, overflow: 'hidden' },
  // F2: the band clips; the content grows into slack but never shrinks, so an
  // overflow is measured by onFit instead of painting over the footer.
  band: { flex: 1, overflow: 'hidden' },
  content: { flexShrink: 0 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  brand: { color: C.text, fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: 0.5 },
  kicker: { color: C.purpleSoft, fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 2.5, marginTop: 4 },
  badge: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  badgeText: { fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: 1.2 },

  panel: { backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.panelEdge, padding: 18, marginBottom: 12 },
  todayPanel: { backgroundColor: C.panelHi, flexGrow: 1, flexShrink: 0, flexBasis: 'auto', marginBottom: 0 },
  panelLabel: { color: C.textDim, fontSize: 14, lineHeight: 18, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  statValue: { fontSize: 40, lineHeight: 46, fontWeight: '900', fontFamily: MONO },
  statLabel: { color: C.textFaint, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },

  // ── PUBLIC hero ──
  heroPanel: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  heroEyebrow: { color: C.textDim, fontSize: 15, lineHeight: 20, fontWeight: '800', letterSpacing: 3 },
  heroFigure: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  heroNum: { color: C.green, fontSize: 168, lineHeight: 180, fontWeight: '900', fontFamily: MONO },
  heroSlash: { color: C.textFaint, fontSize: 96, lineHeight: 180, fontWeight: '900', fontFamily: MONO, marginHorizontal: 8 },
  heroDen: { color: C.text, fontSize: 96, lineHeight: 180, fontWeight: '900', fontFamily: MONO },
  heroCaption: { color: C.text, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: 2.4, textAlign: 'center', marginTop: 6 },
  heroRule: { height: 1, alignSelf: 'stretch', backgroundColor: C.hair, marginVertical: 26 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34 },
  heroMeta: { alignItems: 'center' },
  heroMetaValue: { color: C.cyanSoft, fontSize: 42, lineHeight: 48, fontWeight: '900', fontFamily: MONO },
  heroMetaLabel: { color: C.textFaint, fontSize: 12.5, lineHeight: 16, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  heroMetaDivider: { width: 1, height: 52, backgroundColor: C.hair },
  publicBody: { color: C.text, fontSize: 21, lineHeight: 30 },
  ctaBand: { backgroundColor: 'rgba(251,191,36,0.10)', borderRadius: 18, borderWidth: 1, borderColor: C.gold + '55', paddingHorizontal: 24, paddingVertical: 20, marginTop: 14 },
  ctaText: { color: C.goldSoft, fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },

  // ── FREE session grid ──
  sessionGrid: { flexDirection: 'row', gap: 12, flexGrow: 1, flexShrink: 0 },
  sessionCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: C.panelEdge, padding: 16 },
  lockBox: { marginTop: 12, alignItems: 'flex-start' },
  lockIcon: { fontSize: 22 },
  lockText: { color: C.goldSoft, fontSize: 14, lineHeight: 18, fontWeight: '800', marginTop: 6 },
  releaseBand: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 18, borderWidth: 1, borderColor: C.gold + '55', paddingHorizontal: 22, paddingVertical: 18, marginTop: 14 },
  releaseIcon: { fontSize: 30 },
  releaseTitle: { color: C.goldSoft, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  releaseSub: { color: C.textDim, fontSize: 15, lineHeight: 20, marginTop: 2 },

  // ── yesterday per-session ──
  yRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.hair },
  yScope: { width: 130, color: C.purpleSoft, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  yCombos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  yChip: { backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  yChipText: { color: C.green, fontSize: 14, lineHeight: 18, fontFamily: MONO, fontWeight: '700' },
  yMore: { color: C.textFaint, fontSize: 13, fontFamily: MONO, fontWeight: '700' },
  yDash: { color: C.textFaint, fontSize: 16 },
  yTag: { width: 150, textAlign: 'right', fontSize: 13, lineHeight: 18, fontWeight: '900', letterSpacing: 0.5, fontFamily: MONO },

  // ── today sessions (pro) ──
  session: { paddingVertical: 8 },
  sessionDivider: { borderBottomWidth: 1, borderBottomColor: C.hair },
  sessionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionScope: { color: C.cyanSoft, fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: 2 },
  sessionState: { fontSize: 12.5, lineHeight: 18, fontWeight: '900', letterSpacing: 1, fontFamily: MONO },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7, flexWrap: 'wrap' },
  resolvedTag: { fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },
  sessionMiss: { color: C.textFaint, fontSize: 15, lineHeight: 20, marginTop: 6, fontStyle: 'italic' },
  // six signals across: 6 × 130 + 5 × 10 = 830 ≤ the panel's 860 inner width
  signalRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  signal: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(168,85,247,0.10)', borderRadius: 12, borderWidth: 1, borderColor: C.purple + '33', paddingVertical: 8 },
  signalDigits: { color: C.text, fontSize: 28, lineHeight: 34, fontWeight: '900', fontFamily: MONO, letterSpacing: 2.5 },
  signalSet: { color: C.textFaint, fontSize: 14, lineHeight: 18, fontFamily: MONO, marginTop: 2 },

  footer: { marginTop: 10, minHeight: 42, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  footerLine: { flex: 1, color: C.textFaint, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  footerCta: { color: C.gold, fontSize: 15, lineHeight: 21, fontWeight: '800' },
});
