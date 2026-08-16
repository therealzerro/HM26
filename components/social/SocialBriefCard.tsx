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

   FORMAT (MKT-50 addendum 3, 2026-08-07): fixed 960×960 — 1:1 photo, exported
   at 1920×1920 by the pixelRatio-2 capture.

   LAYOUT (MKT-53, 2026-08-09): each variant gets its own composition instead of
   one shared two-column grid. The shared grid was tuned for the pro payload, so
   pro clipped (concentration state list truncated to 3 of 5, eyebrow wrapping
   into the digits, ragged column bottoms) while free and public rendered two
   small panels floating in 60–70% empty square. Now:

     public  single-column editorial hero — the three aggregate facts scaled up
             to fill the square instead of hiding in a corner panel.
     free    full-width stack — wide yesterday ledger + a 3-up session grid for
             today + a Pro release band. Full width is what stops the combo
             chips from wrapping out of their row.
     pro     asymmetric 0.9 / 1.1 columns (the concentration rows are the widest
             content in the card and were the ones losing information), with the
             trailing panel of each column set to grow-but-never-shrink so the
             two columns bottom out together and nothing is compressed.
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

      {isPublic ? <PublicBody data={data} /> : isPro ? <ProBody data={data} /> : <FreeBody data={data} />}

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

/* ───────────────────────── PUBLIC — editorial hero ─────────────────────────
   Only three facts are publishable here (§6: aggregate counts + jurisdiction
   COUNT). Rather than shrink them into a panel and leave the square empty, the
   headline count is set at display scale and carries the whole composition. */
function PublicBody({ data }: { data: SocialBriefData }) {
  return (
    <View style={styles.body}>
      <View style={[styles.panel, styles.heroPanel]}>
        <Text style={styles.heroEyebrow}>YESTERDAY · {data.yesterdayLabel}</Text>
        <View style={styles.heroFigure}>
          <Text style={styles.heroNum}>{data.verifiedCount}</Text>
          <Text style={styles.heroSlash}>/</Text>
          <Text style={styles.heroDen}>{data.totalSignals}</Text>
        </View>
        <Text style={styles.heroCaption}>SIGNALS ALIGNED WITH OBSERVED OUTCOMES</Text>
        <View style={styles.heroRule} />
        <View style={styles.heroMetaRow}>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>{data.jurisdictionCount}</Text>
            <Text style={styles.heroMetaLabel}>JURISDICTIONS</Text>
          </View>
          <View style={styles.heroMetaDivider} />
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>{data.totalSignals}</Text>
            <Text style={styles.heroMetaLabel}>SIGNALS TRACKED</Text>
          </View>
        </View>
      </View>

      <View style={[styles.panel, { backgroundColor: C.panelHi, marginBottom: 0 }]}>
        <Text style={styles.panelLabel}>TODAY</Text>
        <Text style={styles.publicBody}>
          {"Today's cross-jurisdictional analysis is published. Real-time signal processing across the full national dataset."}
        </Text>
      </View>

      <View style={styles.ctaBand}>
        <Text style={styles.ctaText}>Full intelligence drops in the free community 👇</Text>
      </View>
    </View>
  );
}

/* ───────────────── FREE — full-width stack, receipts first ─────────────────
   Full width is load-bearing: at the old ~460pt column the yesterday chips
   wrapped under the scope name and broke the row's alignment. */
function FreeBody({ data }: { data: SocialBriefData }) {
  return (
    <View style={styles.body}>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>YESTERDAY · {data.yesterdayLabel}</Text>
        <View style={styles.statRow}>
          <Stat value={`${data.verifiedCount}/${data.totalSignals}`} label="signals aligned" color={C.green} />
          <Stat value={`${data.jurisdictionCount}`} label="jurisdictions" color={C.cyan} />
          <Stat value={`${data.verified30d}`} label="verified · 30d" color={C.gold} />
        </View>
        {data.scopes.map((s) => <YesterdayRow key={s.scope} s={s} />)}
      </View>

      <View style={[styles.panel, styles.grow, { backgroundColor: C.panelHi }]}>
        <Text style={styles.panelLabel}>TODAY</Text>
        {/* 3-up session grid — the wide format's payoff: every session reads at
            a glance instead of stacking into a list with a ragged right edge. */}
        <View style={styles.sessionGrid}>
          {data.scopes.map((s) => <SessionCard key={s.scope} s={s} locked />)}
        </View>
      </View>

      <View style={styles.releaseBand}>
        <Text style={styles.releaseIcon}>💎</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.releaseTitle}>{"Today's combinations release in Pro first"}</Text>
          <Text style={styles.releaseSub}>Exact order + set + multiplicity for every session, before the draw.</Text>
        </View>
      </View>
    </View>
  );
}

/* ─────────── PRO — asymmetric columns, bottom-aligned, nothing clipped ──────
   0.9 / 1.1 rather than 50/50: the concentration rows carry the digits, the
   scope labels and the 90-day state footprint, and were the content actually
   losing information at an even split. */
function ProBody({ data }: { data: SocialBriefData }) {
  return (
    <View style={styles.cols}>
      <View style={[styles.col, { flexGrow: 0.9 }]}>
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>YESTERDAY · {data.yesterdayLabel}</Text>
          <View style={styles.statRow}>
            <Stat value={`${data.verifiedCount}/${data.totalSignals}`} label="aligned" color={C.green} dense />
            <Stat value={`${data.jurisdictionCount}`} label="juris." color={C.cyan} dense />
            <Stat value={`${data.verified30d}`} label="30d" color={C.gold} dense />
          </View>
          {data.scopes.map((s) => <YesterdayRow key={s.scope} s={s} dense />)}
        </View>

        <View style={[styles.panel, styles.grow, { backgroundColor: C.panelHi }]}>
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
                s.todaySlateHit ? (
                  <View style={styles.resolvedRow}>
                    <Text style={[styles.resolvedTag, { color: s.todayStraight ? C.goldSoft : C.green }]}>
                      {s.todayStraight ? 'STRAIGHT MATCH' : 'BOX MATCH'}
                    </Text>
                    <View style={styles.yCombos}>
                      {s.todayHittingCombos.slice(0, 3).map((c, i) => (
                        <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.resolvedMiss}>{s.todayLive ? 'no match yet — session live' : 'no match this session'}</Text>
                )
              ) : s.todayPlays.length === 0 ? (
                <Text style={styles.playNone}>— no signal surfaced —</Text>
              ) : (
                <View style={{ gap: 6, marginTop: 6 }}>
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
      </View>

      <View style={[styles.col, { flexGrow: 1.1 }]}>
        {/* PRO depth (MKT-50) — observation language only: the model's behavior
            is described, never prescribed. §4-relabel ruling 2026-08-07. */}
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>WHERE THE MODEL CONCENTRATES</Text>
          <Text style={styles.concCaption}>ALL STATES · ANY ORDER · 3-DAY WINDOW</Text>
          {data.pro?.concentration.map((c, i) => (
            <View key={i} style={[styles.concRow, i > 0 && { marginTop: 10 }]}>
              {/* Line 1 owns the eyebrow alone — sharing it with the weight chip
                  is what forced the wrap that collided with the digits. */}
              <View style={styles.concHead}>
                <Text style={[styles.concEyebrow, { color: c.weight >= 2 ? C.goldSoft : C.purpleSoft }]} numberOfLines={1}>
                  {c.weight >= 2 ? 'HIGHEST CONCENTRATION' : 'LOWER CONCENTRATION'} · ANY ORDER
                </Text>
                <View style={styles.weightChip}><Text style={styles.weightText}>×{c.weight}</Text></View>
              </View>
              <View style={styles.concDigitRow}>
                <Text style={styles.playDigits}>{c.digits}</Text>
                <Text style={styles.playSet}>{setBraces(c.comboSet)}</Text>
                {c.exactOrder && (
                  <View style={styles.exactChip}><Text style={styles.exactText}>+ EXACT ORDER</Text></View>
                )}
              </View>
              <Text style={styles.concScopes} numberOfLines={1}>
                {c.scopeLabels.join(' + ').toUpperCase()} · 90-DAY ACTIVITY {c.footprint90}
              </Text>
              {/* Full footprint, two lines allowed. The prior single-line
                  top-3 slice silently dropped states from the record. */}
              {!!c.stateFootprint && (
                <Text style={styles.concMeta} numberOfLines={2}>{c.stateFootprint}</Text>
              )}
            </View>
          ))}
          {(data.pro?.concentration.length ?? 0) === 0 && (
            <Text style={styles.playNone}>— no concentration surfaced today —</Text>
          )}
          <Text style={styles.concLegend}>
            The model concentrates on 1–2 combinations and carries them up to 3 days; a match closes that leg.
            State codes show where a combination appeared in the last 90 days — recent activity, not a recommendation.
          </Text>
        </View>

        <View style={[styles.panel, styles.grow]}>
          <Text style={styles.panelLabel}>ANALYST NOTES</Text>
          {data.pro?.daytimeNote && (
            <Text style={styles.noteLine}>
              <Text style={styles.noteLead}>Daytime structure: </Text>
              ranks 1–2 in the Daytime session have underperformed ranks 3–5 — a pattern confirmed four separate
              times. The combinations above already reflect that exclusion.
            </Text>
          )}
          {(data.pro?.rank1Total ?? 0) > 0 && (
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
      </View>
    </View>
  );
}

/* One of today's sessions, as a tile in the FREE 3-up grid. */
function SessionCard({ s, locked }: { s: SocialBriefScope; locked?: boolean }) {
  const stateColor = s.todayLive ? C.cyanSoft : s.todaySlateHit ? (s.todayStraight ? C.goldSoft : C.green) : C.textFaint;
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHead}>
        <Text style={styles.sessionScope}>{s.label.toUpperCase()}</Text>
        {s.todayResolved && (
          <Text style={[styles.sessionState, { color: stateColor }]}>{s.todayLive ? '● LIVE' : '✓'}</Text>
        )}
      </View>
      {s.todayResolved ? (
        s.todaySlateHit ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.sessionTag, { color: s.todayStraight ? C.goldSoft : C.green }]}>
              {s.todayStraight ? 'STRAIGHT MATCH' : 'BOX MATCH'}
            </Text>
            <View style={[styles.yCombos, { marginTop: 8 }]}>
              {s.todayHittingCombos.slice(0, 3).map((c, i) => (
                <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.sessionMiss}>{s.todayLive ? 'no match yet — session live' : 'no match this session'}</Text>
        )
      ) : locked ? (
        /* MKT-50 addendum: the unresolved-session pair is Pro-only. Free keeps
           the receipts (yesterday + resolved outcomes) — the upcoming
           combinations are the thing Pro pays for. */
        <View style={styles.lockBox}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockText}>releases in Pro first</Text>
        </View>
      ) : (
        <Text style={styles.sessionMiss}>— no signal surfaced —</Text>
      )}
    </View>
  );
}

function YesterdayRow({ s, dense }: { s: SocialBriefScope; dense?: boolean }) {
  const label = s.ySlateHit ? (s.yPick1Straight ? 'STRAIGHT MATCH' : 'BOX MATCH') : 'no match';
  const col = s.ySlateHit ? (s.yPick1Straight ? C.gold : C.green) : C.textFaint;
  const chips = s.ySlateHit && s.yHittingCombos.length > 0
    ? s.yHittingCombos.slice(0, dense ? 3 : 4)
    : [];
  const overflow = s.yHittingCombos.length - chips.length;

  /* Dense (pro's narrow column) stacks scope/tag over the chips — side-by-side
     at ~400pt pushed the chips into a second row that broke the row rhythm. */
  if (dense) {
    return (
      <View style={styles.yRowDense}>
        <View style={styles.yHeadDense}>
          <Text style={styles.yScopeDense}>{s.label}</Text>
          <Text style={[styles.yTagDense, { color: col }]}>{label}</Text>
        </View>
        {chips.length > 0 && (
          <View style={[styles.yCombos, { marginTop: 6 }]}>
            {chips.map((c, i) => (
              <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
            ))}
            {overflow > 0 && <Text style={styles.yMore}>+{overflow}</Text>}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.yRow}>
      <Text style={styles.yScope}>{s.label}</Text>
      <View style={styles.yCombos}>
        {chips.length > 0 ? (
          <>
            {chips.map((c, i) => (
              <View key={i} style={styles.yChip}><Text style={styles.yChipText}>{setBraces(c)}</Text></View>
            ))}
            {overflow > 0 && <Text style={styles.yMore}>+{overflow}</Text>}
          </>
        ) : (
          <Text style={styles.yDash}>—</Text>
        )}
      </View>
      <Text style={[styles.yTag, { color: col }]}>{label}</Text>
    </View>
  );
}

function Stat({ value, label, color, dense }: { value: string; label: string; color: string; dense?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }, dense && styles.statValueDense]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const MONO = 'monospace';

const styles = StyleSheet.create({
  // 1:1 photo format (MKT-50 addendum 3) — 960pt square → 1920×1920 PNG at the
  // capture pipeline's pixelRatio 2. Fixed height makes the square true by
  // construction; overflow hidden is a backstop only — every variant's layout
  // is sized to land inside the square without it.
  card: { width: 960, height: 960, backgroundColor: C.bg, padding: 30, borderRadius: 26, borderWidth: 1, borderColor: C.panelEdge, overflow: 'hidden' },
  body: { flex: 1 },
  cols: { flex: 1, flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  col: { flexBasis: 0, flexShrink: 1 },
  // Grow into the column's slack, never shrink below content. This is what
  // bottom-aligns the two pro columns without compressing either one.
  grow: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', marginBottom: 0 },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 },
  brand: { color: C.text, fontSize: 34, fontWeight: '900', letterSpacing: 0.5 },
  kicker: { color: C.purpleSoft, fontSize: 15, fontWeight: '800', letterSpacing: 2.5, marginTop: 6 },
  badge: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999, borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  badgeText: { fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },

  panel: { backgroundColor: C.panel, borderRadius: 18, borderWidth: 1, borderColor: C.panelEdge, padding: 20, marginBottom: 14 },
  panelLabel: { color: C.textDim, fontSize: 14, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },

  statRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)' },
  statValue: { fontSize: 40, fontWeight: '900', fontFamily: MONO },
  statValueDense: { fontSize: 30 },
  statLabel: { color: C.textFaint, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },

  // ── PUBLIC hero ──
  heroPanel: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  heroEyebrow: { color: C.textDim, fontSize: 15, fontWeight: '800', letterSpacing: 3 },
  heroFigure: { flexDirection: 'row', alignItems: 'baseline', marginTop: 14 },
  heroNum: { color: C.green, fontSize: 168, lineHeight: 180, fontWeight: '900', fontFamily: MONO },
  heroSlash: { color: C.textFaint, fontSize: 96, lineHeight: 180, fontWeight: '900', fontFamily: MONO, marginHorizontal: 8 },
  heroDen: { color: C.text, fontSize: 96, lineHeight: 180, fontWeight: '900', fontFamily: MONO },
  heroCaption: { color: C.text, fontSize: 19, fontWeight: '800', letterSpacing: 2.4, textAlign: 'center', marginTop: 6 },
  heroRule: { height: 1, alignSelf: 'stretch', backgroundColor: C.hair, marginVertical: 26 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 34 },
  heroMeta: { alignItems: 'center' },
  heroMetaValue: { color: C.cyanSoft, fontSize: 42, fontWeight: '900', fontFamily: MONO },
  heroMetaLabel: { color: C.textFaint, fontSize: 12.5, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  heroMetaDivider: { width: 1, height: 52, backgroundColor: C.hair },
  publicBody: { color: C.text, fontSize: 21, lineHeight: 32 },
  ctaBand: { backgroundColor: 'rgba(251,191,36,0.10)', borderRadius: 18, borderWidth: 1, borderColor: C.gold + '55', paddingHorizontal: 24, paddingVertical: 20, marginTop: 14 },
  ctaText: { color: C.goldSoft, fontSize: 22, fontWeight: '900', textAlign: 'center' },

  // ── FREE session grid ──
  sessionGrid: { flexDirection: 'row', gap: 12, flex: 1 },
  sessionCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: C.panelEdge, padding: 16 },
  sessionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionScope: { color: C.cyanSoft, fontSize: 14, fontWeight: '900', letterSpacing: 1.6 },
  sessionState: { fontSize: 13, fontWeight: '900', letterSpacing: 1, fontFamily: MONO },
  sessionTag: { fontSize: 15, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },
  sessionMiss: { color: C.textFaint, fontSize: 14, marginTop: 10, fontStyle: 'italic', lineHeight: 20 },
  lockBox: { marginTop: 12, alignItems: 'flex-start' },
  lockIcon: { fontSize: 22 },
  lockText: { color: C.goldSoft, fontSize: 14, fontWeight: '800', marginTop: 6 },
  releaseBand: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 18, borderWidth: 1, borderColor: C.gold + '55', paddingHorizontal: 22, paddingVertical: 18, marginTop: 14 },
  releaseIcon: { fontSize: 30 },
  releaseTitle: { color: C.goldSoft, fontSize: 20, fontWeight: '900' },
  releaseSub: { color: C.textDim, fontSize: 15, marginTop: 4 },

  // ── yesterday per-session ──
  yRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.hair },
  yScope: { width: 130, color: C.purpleSoft, fontSize: 17, fontWeight: '800' },
  yCombos: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  yChip: { backgroundColor: 'rgba(52,211,153,0.12)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  yChipText: { color: C.green, fontSize: 14, fontFamily: MONO, fontWeight: '700' },
  yMore: { color: C.textFaint, fontSize: 13, fontFamily: MONO, fontWeight: '700' },
  yDash: { color: C.textFaint, fontSize: 16 },
  yTag: { width: 140, textAlign: 'right', fontSize: 13, fontWeight: '900', letterSpacing: 0.5, fontFamily: MONO },
  yRowDense: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.hair },
  yHeadDense: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  yScopeDense: { color: C.purpleSoft, fontSize: 15, fontWeight: '800' },
  yTagDense: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5, fontFamily: MONO },

  // ── today plays (pro column) ──
  playSection: { paddingVertical: 11 },
  playDivider: { borderBottomWidth: 1, borderBottomColor: C.hair },
  playScopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playScope: { color: C.cyanSoft, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  playState: { fontSize: 12.5, fontWeight: '900', letterSpacing: 1, fontFamily: MONO },
  resolvedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7, flexWrap: 'wrap' },
  resolvedTag: { fontSize: 15, fontWeight: '900', letterSpacing: 0.6, fontFamily: MONO },
  resolvedMiss: { color: C.textFaint, fontSize: 15, marginTop: 7, fontStyle: 'italic' },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(168,85,247,0.10)', borderRadius: 12, borderWidth: 1, borderColor: C.purple + '33', paddingHorizontal: 16, paddingVertical: 10 },
  playDigits: { color: C.text, fontSize: 28, fontWeight: '900', fontFamily: MONO, letterSpacing: 2.5 },
  playSet: { color: C.textFaint, fontSize: 14, fontFamily: MONO },
  playNone: { color: C.textFaint, fontSize: 16, marginTop: 5, fontStyle: 'italic' },
  multChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  multText: { fontSize: 12.5, fontWeight: '900', letterSpacing: 0.8, fontFamily: MONO },

  // ── PRO concentration ──
  concCaption: { color: C.textFaint, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: -10, marginBottom: 12 },
  concRow: { backgroundColor: 'rgba(251,191,36,0.06)', borderRadius: 12, borderWidth: 1, borderColor: C.gold + '33', paddingHorizontal: 16, paddingVertical: 12 },
  concHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  concEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1, flexShrink: 1 },
  weightChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: C.gold + '99' },
  weightText: { color: C.goldSoft, fontSize: 12.5, fontWeight: '900', letterSpacing: 0.8, fontFamily: MONO },
  concDigitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  exactChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, borderWidth: 1, borderColor: C.gold + '77', backgroundColor: 'rgba(251,191,36,0.10)' },
  exactText: { color: C.goldSoft, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, fontFamily: MONO },
  concScopes: { color: C.cyanSoft, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 8 },
  concMeta: { color: C.textDim, fontSize: 13, fontFamily: MONO, lineHeight: 18, marginTop: 4 },
  concLegend: { color: C.textFaint, fontSize: 13, lineHeight: 19, marginTop: 14 },
  noteLine: { color: C.textDim, fontSize: 14.5, lineHeight: 22, marginBottom: 10 },
  noteLead: { color: C.text, fontWeight: '800' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  footerBrand: { color: C.textFaint, fontSize: 15, fontWeight: '700' },
  footerPro: { color: C.gold, fontSize: 15, fontWeight: '800' },
});
