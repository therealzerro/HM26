/* ============================================================================
   SocialBriefCard — publishable, brand-safe consumer brief (SOCIAL-01)
   ----------------------------------------------------------------------------
   Presentational only (no fetching), prop-driven, forwardRef so the Publish
   console can capture it to PNG via lib/captureExportImage. Two variants:

     variant="public"  §6 PUBLIC: aggregate counts + jurisdiction COUNT only.
                       NO digits, NO state codes, NO attribution, NO pricing.
                       Passes the Two-Question filter by construction.
     variant="group"   FREE/PRO: today's recommended plays (digits) + yesterday
                       outcome per session with STRAIGHT MATCH / BOX MATCH
                       vocab (§4a — never "hit"/"partial").

   Cosmic brand palette (Brief v2 §7). Capture-stable colors (no theme
   dependence for the captured surface, mirroring BriefCard's approach).
   ============================================================================ */

import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SocialBriefData } from '@/lib/social/socialBrief';

const C = {
  bg: '#0A0A0F',
  panel: '#14122A',
  panelEdge: '#2A2550',
  purple: '#A855F7',
  purpleSoft: '#C084FC',
  gold: '#FBBF24',
  cyan: '#06B6D4',
  green: '#10B981',
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.62)',
  textFaint: 'rgba(255,255,255,0.40)',
};

export interface SocialBriefCardProps {
  data: SocialBriefData;
  variant: 'public' | 'group';
  /** Group-only: whether to render the Pro first-access footer (never on FREE All-Day). */
  showProFooter?: boolean;
}

export const SocialBriefCard = forwardRef<View, SocialBriefCardProps>(function SocialBriefCard(
  { data, variant, showProFooter }, ref,
) {
  const isPublic = variant === 'public';

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Header / wordmark */}
      <View style={styles.header}>
        <Text style={styles.brand}>HITMASTER <Text style={{ color: C.cyan }}>ZK6</Text></Text>
        <Text style={styles.bolt}>⚡</Text>
      </View>
      <Text style={styles.kicker}>DAILY INTELLIGENCE · {data.todayLabel}</Text>

      {/* Yesterday validation — aggregate (safe for every surface).
          PUBLIC variant omits the 30-day tile: that total can be a 3-digit
          number, and the Two-Question filter exempts only 4+ digit stats in
          IMAGES. It stays in the group variant and in text captions (captions
          are not an OCR surface). */}
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>YESTERDAY · {data.yesterdayLabel}</Text>
        <View style={styles.statRow}>
          <Stat value={`${data.verifiedCount}`} label="signals aligned" color={C.green} />
          <Stat value={`${data.jurisdictionCount}`} label="jurisdictions" color={C.cyan} />
          {!isPublic && <Stat value={`${data.verified30d}`} label="verified · 30d" color={C.gold} />}
        </View>
        <Text style={styles.aggLine}>
          {data.verifiedCount} of {data.totalSignals} daily-intelligence signals aligned with observed outcomes.
        </Text>
      </View>

      {isPublic ? (
        /* PUBLIC — value proposition, no numbers/states/attribution */
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>TODAY</Text>
          <Text style={styles.publicBody}>
            {"Today's cross-jurisdictional analysis is published. Real-time signal processing across the full national dataset."}
          </Text>
          <Text style={styles.publicCta}>Full intelligence drops in the free community 👇</Text>
        </View>
      ) : (
        /* GROUP — full detail: today's plays + yesterday result per session */
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{"TODAY'S RECOMMENDED PLAYS"}</Text>
          {data.scopes.map((s) => (
            <View key={s.scope} style={styles.scopeRow}>
              <Text style={styles.scopeName}>{s.label}</Text>
              <View style={styles.playWrap}>
                {s.todayPlays.length === 0 ? (
                  <Text style={styles.playNone}>—</Text>
                ) : (
                  s.todayPlays.map((p, i) => (
                    <View key={i} style={styles.playChip}>
                      <Text style={styles.playDigits}>{p.bestOrder}</Text>
                      <Text style={styles.playSet}>{`{${p.combo.split('').join(',')}}`}</Text>
                    </View>
                  ))
                )}
              </View>
              <Text style={[styles.yTag, { color: s.ySlateHit ? C.green : C.textFaint }]}>
                {s.ySlateHit ? (s.yPick1Straight ? 'STRAIGHT MATCH' : 'BOX MATCH') : 'no match'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerBrand}>Intelligence is your edge. Use it.</Text>
        {!isPublic && showProFooter && (
          <Text style={styles.footerPro}>Pro members see it first ⚡</Text>
        )}
      </View>
    </View>
  );
});

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
  card: {
    width: 460,
    backgroundColor: C.bg,
    padding: 26,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.panelEdge,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  bolt: { fontSize: 20 },
  kicker: { color: C.purpleSoft, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 4, marginBottom: 16 },

  panel: {
    backgroundColor: C.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.panelEdge,
    padding: 16,
    marginBottom: 12,
  },
  panelLabel: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },

  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 30, fontWeight: '900', fontFamily: MONO },
  statLabel: { color: C.textFaint, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  aggLine: { color: C.textDim, fontSize: 12, lineHeight: 18 },

  publicBody: { color: C.text, fontSize: 14, lineHeight: 21, marginBottom: 10 },
  publicCta: { color: C.gold, fontSize: 13, fontWeight: '800' },

  scopeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  scopeName: { width: 92, color: C.purpleSoft, fontSize: 12, fontWeight: '800' },
  playWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  playChip: { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 8, borderWidth: 1, borderColor: C.purple + '55', paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center' },
  playDigits: { color: C.text, fontSize: 15, fontWeight: '900', fontFamily: MONO, letterSpacing: 1 },
  playSet: { color: C.textFaint, fontSize: 8, fontFamily: MONO },
  playNone: { color: C.textFaint, fontSize: 13 },
  yTag: { width: 96, textAlign: 'right', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, fontFamily: MONO },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  footerBrand: { color: C.textFaint, fontSize: 11, fontWeight: '700' },
  footerPro: { color: C.gold, fontSize: 11, fontWeight: '800' },
});
