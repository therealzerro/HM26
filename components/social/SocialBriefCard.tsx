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
        /* GROUP: today per session — RESOLVED sessions show their live outcome,
           upcoming sessions show recommended plays (SOCIAL-06 intraday). */
        <View style={[styles.panel, { backgroundColor: C.panelHi }]}>
          <Text style={styles.panelLabel}>TODAY</Text>
          {data.scopes.map((s, idx) => (
            <View key={s.scope} style={[styles.playSection, idx < data.scopes.length - 1 && styles.playDivider]}>
              <View style={styles.playScopeRow}>
                <Text style={styles.playScope}>{s.label.toUpperCase()}</Text>
                {s.todayResolved && (
                  <Text style={[styles.playState, { color: s.todayLive ? C.cyanSoft : s.todaySlateHit ? (s.todayStraight ? C.goldSoft : C.green) : C.textFaint }]}>
                    {s.todayLive ? '● LIVE' : '✓ RESOLVED'}
                  </Text>
                )}
              </View>

              {s.todayResolved ? (
                /* live/resolved outcome */
                s.todaySlateHit ? (
                  <View style={styles.resolvedRow}>
                    <Text style={[styles.resolvedTag, { color: s.todayStraight ? C.goldSoft : C.green }]}>
                      {s.todayStraight ? 'STRAIGHT MATCH' : 'BOX MATCH'}
                    </Text>
                    <View style={styles.yCombos}>
                      {s.todayHittingCombos.slice(0, 4).map((c, i) => (
                        <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.resolvedMiss}>{s.todayLive ? 'no match yet — session live' : 'no match this session'}</Text>
                )
              ) : !isPro ? (
                /* MKT-50 addendum: the unresolved-session pair is Pro-only.
                   Free keeps the receipts (yesterday + resolved outcomes) —
                   the upcoming combinations are the thing Pro pays for. */
                <Text style={styles.playLocked}>🔒 today's combinations release in Pro first</Text>
              ) : s.todayPlays.length === 0 ? (
                <Text style={styles.playNone}>— no signal surfaced —</Text>
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

      {/* PRO depth (MKT-50) — observation language only: the model's behavior
          is described, never prescribed. §4-relabel ruling 2026-08-07. */}
      {!isPublic && isPro && data.pro && (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>WHERE THE MODEL CONCENTRATES</Text>
            <Text style={styles.concCaption}>ALL STATES · ANY ORDER · 3-DAY WINDOW</Text>
            {data.pro.concentration.map((c, i) => (
              <View key={i} style={[styles.concRow, i > 0 && { marginTop: 8 }]}>
                <View style={styles.concHead}>
                  <Text style={[styles.concEyebrow, { color: c.weight >= 2 ? C.goldSoft : C.purpleSoft }]}>
                    {c.weight >= 2 ? 'HIGHEST CONCENTRATION' : 'LOWER CONCENTRATION'} · ANY ORDER{c.exactOrder ? ' + EXACT ORDER' : ''}
                  </Text>
                  <View style={styles.weightChip}><Text style={styles.weightText}>×{c.weight}</Text></View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 }}>
                  <Text style={styles.playDigits}>{c.digits}</Text>
                  <Text style={styles.playSet}>{setBraces(c.comboSet)}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.concScopes}>{c.scopeLabels.join(' + ').toUpperCase()}</Text>
                </View>
                <Text style={styles.concMeta}>
                  90-day activity {c.footprint90}{c.stateFootprint ? ` · ${c.stateFootprint}` : ''}
                </Text>
              </View>
            ))}
            {data.pro.concentration.length === 0 && (
              <Text style={styles.playNone}>— no concentration surfaced today —</Text>
            )}
            <Text style={styles.concLegend}>
              The model concentrates on 1–2 combinations and carries them up to 3 days; a match closes that leg.
              State codes show where a combination appeared in the last 90 days — recent activity, not a recommendation.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>ANALYST NOTES</Text>
            {data.pro.daytimeNote && (
              <Text style={styles.noteLine}>
                <Text style={styles.noteLead}>Daytime structure: </Text>
                ranks 1–2 in the Daytime session have underperformed ranks 3–5 — a pattern confirmed four separate
                times. The combinations above already reflect that exclusion.
              </Text>
            )}
            {data.pro.rank1Total > 0 && (
              <Text style={styles.noteLine}>
                <Text style={styles.noteLead}>Rank-1 check: </Text>
                rank-1 signals matched in {data.pro.rank1Matched} of {data.pro.rank1Total} sessions yesterday.
              </Text>
            )}
            <Text style={[styles.noteLine, { marginBottom: 0 }]}>
              <Text style={styles.noteLead}>What the ranking means: </Text>
              these signals are ranked to maximise match probability. They are not ranked for profitability, and no
              analysis changes the underlying odds.
            </Text>
          </View>
        </>
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
  playScopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playScope: { color: C.cyanSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  playState: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, fontFamily: MONO },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  resolvedTag: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, fontFamily: MONO },
  resolvedMiss: { color: C.textFaint, fontSize: 11, marginTop: 5, fontStyle: 'italic' },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(168,85,247,0.10)', borderRadius: 10, borderWidth: 1, borderColor: C.purple + '33', paddingHorizontal: 12, paddingVertical: 7 },
  playDigits: { color: C.text, fontSize: 20, fontWeight: '900', fontFamily: MONO, letterSpacing: 2 },
  playSet: { color: C.textFaint, fontSize: 10, fontFamily: MONO },
  playNone: { color: C.textFaint, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  playLocked: { color: C.goldSoft, fontSize: 11, fontWeight: '700', marginTop: 5 },
  multChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  multText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },

  // PRO depth panels (MKT-50)
  concCaption: { color: C.textFaint, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.2, marginTop: -8, marginBottom: 10 },
  concRow: { backgroundColor: 'rgba(251,191,36,0.06)', borderRadius: 10, borderWidth: 1, borderColor: C.gold + '33', paddingHorizontal: 12, paddingVertical: 8 },
  concHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  concEyebrow: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8, flexShrink: 1 },
  weightChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.gold + '99' },
  weightText: { color: C.goldSoft, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },
  concScopes: { color: C.cyanSoft, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8 },
  concMeta: { color: C.textDim, fontSize: 9.5, fontFamily: MONO, marginTop: 4 },
  concLegend: { color: C.textFaint, fontSize: 9.5, lineHeight: 14, marginTop: 10 },
  noteLine: { color: C.textDim, fontSize: 10.5, lineHeight: 16, marginBottom: 8 },
  noteLead: { color: C.text, fontWeight: '800' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  footerBrand: { color: C.textFaint, fontSize: 11, fontWeight: '700' },
  footerPro: { color: C.gold, fontSize: 11, fontWeight: '800' },
});
