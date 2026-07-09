/* ============================================================================
   SocialBriefCard — publishable, brand-safe consumer brief (SOCIAL-01/05)
   ----------------------------------------------------------------------------
   Presentational only (no fetching), prop-driven, forwardRef so the Publish
   console can capture it to PNG via lib/captureExportImage. Two variants:

     variant="public"  §6 PUBLIC: aggregate counts + jurisdiction COUNT only.
                       NO digits, NO state codes, NO attribution, NO pricing.
                       Passes the Two-Question filter by construction.
     variant="group"   FREE/PRO: rich detail — yesterday's per-session outcome
                       WITH the matching combos, today's recommended plays with
                       straight order + box set + multiplicity. STRAIGHT MATCH /
                       BOX MATCH vocab (§4a — never "hit"/"partial"). groupTier
                       'free' shows the Pro CTA footer; 'pro' shows first-access
                       framing and NO pricing (§6).

   Cosmic brand palette (Brief v2 §7). Capture-stable colors.
   ============================================================================ */

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SocialBriefData, SocialBriefScope } from '@/lib/social/socialBrief';

const C = {
  bg: '#0A0A0F',
  bg2: '#12102A',
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
  hair: 'rgba(255,255,255,0.07)',
};

export interface SocialBriefCardProps {
  data: SocialBriefData;
  variant: 'public' | 'group';
  /** Group-only: 'free' shows the Pro CTA footer; 'pro' shows first-access framing. */
  groupTier?: 'free' | 'pro';
  /** Back-compat: FREE Pro footer. Superseded by groupTier when provided. */
  showProFooter?: boolean;
}

function multBadge(m: string): string {
  const s = (m || '').toLowerCase();
  if (s.startsWith('doub')) return 'DBL';
  if (s.startsWith('trip')) return 'TRP';
  return 'SGL';
}
function setBraces(combo: string): string {
  return `{${combo.split('').join(',')}}`;
}

export const SocialBriefCard = forwardRef<View, SocialBriefCardProps>(function SocialBriefCard(
  { data, variant, groupTier, showProFooter }, ref,
) {
  const isPublic = variant === 'public';
  const isPro = groupTier === 'pro';
  const proFooter = groupTier ? groupTier === 'free' : !!showProFooter;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Header / wordmark */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>HITMASTER <Text style={{ color: C.cyan }}>ZK6</Text></Text>
          <Text style={styles.kicker}>
            {isPublic ? 'DAILY INTELLIGENCE' : isPro ? 'INNER-CIRCLE BRIEF' : 'MEMBER BRIEF'} · {data.todayLabel}
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: isPro ? C.gold : isPublic ? C.cyan : C.purple }]}>
          <Text style={[styles.badgeText, { color: isPro ? C.goldSoft : isPublic ? C.cyanSoft : C.purpleSoft }]}>
            {isPublic ? '⚡ LIVE' : isPro ? '💎 PRO' : '⚡ MEMBERS'}
          </Text>
        </View>
      </View>

      {/* Yesterday scorecard — aggregate stats (safe every surface) */}
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>YESTERDAY · {data.yesterdayLabel}</Text>
        <View style={styles.statRow}>
          <Stat value={`${data.verifiedCount}/${data.totalSignals}`} label="signals aligned" color={C.green} />
          <Stat value={`${data.jurisdictionCount}`} label="jurisdictions" color={C.cyan} />
          {!isPublic && <Stat value={`${data.verified30d}`} label="verified · 30d" color={C.gold} />}
        </View>
        {isPublic ? (
          <Text style={styles.aggLine}>
            {data.verifiedCount} of {data.totalSignals} daily-intelligence signals aligned with observed outcomes.
          </Text>
        ) : (
          /* GROUP: per-session outcome WITH the matching combos */
          <View style={{ marginTop: 4 }}>
            {data.scopes.map((s) => <YesterdayRow key={s.scope} s={s} />)}
          </View>
        )}
      </View>

      {isPublic ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>TODAY</Text>
          <Text style={styles.publicBody}>
            {"Today's cross-jurisdictional analysis is published. Real-time signal processing across the full national dataset."}
          </Text>
          <Text style={styles.publicCta}>Full intelligence drops in the free community 👇</Text>
        </View>
      ) : (
        /* GROUP: today's recommended plays per session, richly */
        <View style={[styles.panel, { backgroundColor: C.panelHi }]}>
          <Text style={styles.panelLabel}>{"TODAY'S RECOMMENDED PLAYS"}</Text>
          {data.scopes.map((s, idx) => (
            <View key={s.scope} style={[styles.playSection, idx < data.scopes.length - 1 && styles.playDivider]}>
              <Text style={styles.playScope}>{s.label.toUpperCase()}</Text>
              {s.todayPlays.length === 0 ? (
                <Text style={styles.playNone}>— no play surfaced —</Text>
              ) : (
                <View style={{ gap: 6, marginTop: 4 }}>
                  {s.todayPlays.map((p, i) => (
                    <View key={i} style={styles.playRow}>
                      <Text style={styles.playDigits}>{p.bestOrder}</Text>
                      <Text style={styles.playSet}>{setBraces(p.combo)}</Text>
                      <View style={{ flex: 1 }} />
                      <View style={[styles.multChip, { borderColor: multBadge(p.multiplicity) === 'DBL' ? C.gold + '99' : C.purple + '66' }]}>
                        <Text style={[styles.multText, { color: multBadge(p.multiplicity) === 'DBL' ? C.goldSoft : C.purpleSoft }]}>{multBadge(p.multiplicity)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>Intelligence is your edge. Use it.</Text>
        {!isPublic && (isPro
          ? <Text style={styles.footerPro}>First access — inner circle 💎</Text>
          : proFooter ? <Text style={styles.footerPro}>Pro members see it first ⚡</Text> : null)}
      </View>
    </View>
  );
});

function YesterdayRow({ s }: { s: SocialBriefScope }) {
  const label = s.ySlateHit ? (s.yPick1Straight ? 'STRAIGHT MATCH' : 'BOX MATCH') : 'no match';
  const col = s.ySlateHit ? (s.yPick1Straight ? C.gold : C.green) : C.textFaint;
  return (
    <View style={styles.yRow}>
      <Text style={styles.yScope}>{s.label}</Text>
      <View style={styles.yCombos}>
        {s.ySlateHit && s.yHittingCombos.length > 0 ? (
          s.yHittingCombos.slice(0, 4).map((c, i) => (
            <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
          ))
        ) : (
          <Text style={styles.yDash}>—</Text>
        )}
      </View>
      <Text style={[styles.yTag, { color: col }]}>{label}</Text>
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const MONO = 'monospace';

const styles = StyleSheet.create({
  card: { width: 480, backgroundColor: C.bg, padding: 26, borderRadius: 22, borderWidth: 1, borderColor: C.panelEdge },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  brand: { color: C.text, fontSize: 23, fontWeight: '900', letterSpacing: 0.5 },
  kicker: { color: C.purpleSoft, fontSize: 10.5, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5, backgroundColor: 'rgba(255,255,255,0.03)' },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  panel: { backgroundColor: C.panel, borderRadius: 16, borderWidth: 1, borderColor: C.panelEdge, padding: 16, marginBottom: 12 },
  panelLabel: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)' },
  statValue: { fontSize: 26, fontWeight: '900', fontFamily: MONO },
  statLabel: { color: C.textFaint, fontSize: 8.5, fontWeight: '700', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  aggLine: { color: C.textDim, fontSize: 12, lineHeight: 18 },

  publicBody: { color: C.text, fontSize: 14, lineHeight: 21, marginBottom: 10 },
  publicCta: { color: C.gold, fontSize: 13, fontWeight: '800' },

  // yesterday per-session
  yRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.hair },
  yScope: { width: 78, color: C.purpleSoft, fontSize: 11, fontWeight: '800' },
  yCombos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  yChip: { backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  yChipText: { color: C.green, fontSize: 9, fontFamily: MONO, fontWeight: '700' },
  yDash: { color: C.textFaint, fontSize: 12 },
  yTag: { width: 96, textAlign: 'right', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4, fontFamily: MONO },

  // today plays
  playSection: { paddingVertical: 8 },
  playDivider: { borderBottomWidth: 1, borderBottomColor: C.hair },
  playScope: { color: C.cyanSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(168,85,247,0.10)', borderRadius: 10, borderWidth: 1, borderColor: C.purple + '33', paddingHorizontal: 12, paddingVertical: 7 },
  playDigits: { color: C.text, fontSize: 20, fontWeight: '900', fontFamily: MONO, letterSpacing: 2 },
  playSet: { color: C.textFaint, fontSize: 10, fontFamily: MONO },
  playNone: { color: C.textFaint, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  multChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  multText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  footerBrand: { color: C.textFaint, fontSize: 11, fontWeight: '700' },
  footerPro: { color: C.gold, fontSize: 11, fontWeight: '800' },
});
