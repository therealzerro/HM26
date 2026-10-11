/**
 * WeeklyReceiptsCard — the SUNDAY RECEIPTS weekly recap image (MKT-83,
 * 2026-10-11). 1080 × 1350 (logical 540 × 675, pixelRatio-2 capture).
 *
 *   classic  (no frame)  — the grid on the brand ground; ships first.
 *   framed   (frame set 'weekly'):
 *              layout 'strip' (the shipped method, 2026-10-11) — the image is
 *              the ANCHOR ONLY; this card DRAWS THE GLASS PANEL (≥ 912×846 px
 *              plus margin, one thin violet glow line, flat near-black, the
 *              daily tint + scanlines), sizes it to the grid, and seats the
 *              strip in the band below it with the helmet ≥ 24 px clear of
 *              the panel edge, its top and side edges feathered into a canvas
 *              painted the strip's own background colour (no seam).
 *              layout 'screen' — the grid on the frame's measured screen
 *              rectangle, like BriefFrameCard (the retired generated-screen
 *              method; kept for a frame that ever passes the gate).
 *
 * Draws ONLY the WeeklyModel (lib/social/weeklyReceipts.ts) — the same model
 * `lintWeekly` lints before capture. Cell law: none → dim dash; box → chip;
 * straight → gold chip; empty → nothing at all. Tiers 2/4 show the matched
 * signals' digits (17 pt logical = 34 px at 1080 ≥ the 31.5 px floor); tier 1
 * shows no digits. No count anywhere (R-A).
 *
 * FIT: every text style has an explicit lineHeight and the app's own fonts
 * (BUG-183b) so platform metrics cannot inflate the layout; `onFit` reports
 * the natural content height against the band and the exporter REFUSES a
 * card that does not fit — never shrink. Up to four chips per cell wrap to a
 * second line; a fifth (never seen in eight weeks) would simply make the row
 * taller and the fit assert says so.
 */
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { WeeklyModel, WeeklyModelCell } from '@/lib/social/weeklyReceipts';
import { BRIEF_COPY } from '@/lib/social/briefCopy';
import { outputRect, type BriefFrame } from '@/lib/social/briefFrames';
import type { BriefFit } from '@/components/social/SocialBriefCard';
import { useFrameImage } from '@/components/social/useFrameImage';

const C = {
  bg: '#0A0A0F', panel: '#181633', panelEdge: '#332C5E',
  purpleSoft: '#C084FC', goldSoft: '#FCD34D', cyan: '#06B6D4', cyanSoft: '#67E8F9', green: '#34D399',
  text: '#FFFFFF', textDim: 'rgba(255,255,255,0.70)', textFaint: 'rgba(255,255,255,0.45)', dash: 'rgba(255,255,255,0.28)',
  hair: 'rgba(255,255,255,0.10)', glass: 'rgba(10,8,22,0.55)',
};
const SANS_B = 'Inter_700Bold';
const MONO_B = 'JetBrainsMono_700Bold';
const LOGICAL_W = 540, LOGICAL_H = 675;
const PAD = 6;            // glass inset (framed)
const CLASSIC_PAD = 18;   // card inset (classic)
// ── strip layout (logical pt; ×2 = canvas px) ──
const STRIP_PANEL_X = 16, STRIP_PANEL_TOP = 16;                 // panel 508 pt wide = 1016 px ≥ 912
const STRIP_PANEL_MIN_H = 423 + 2 * PAD;                        // 846 px minimum inner + inset
const STRIP_CLEAR = 12;                                          // 24 px helmet clearance
const STRIP_BAND_MIN = 110;                                      // the anchor never gets less than this
const STRIP_PANEL_MAX_H = LOGICAL_H - STRIP_PANEL_TOP - STRIP_CLEAR - STRIP_BAND_MIN;   // 537
const FEATHER = 44;

export interface WeeklyReceiptsCardProps {
  model: WeeklyModel;
  frame?: BriefFrame | null;
  onFit?: (fit: BriefFit) => void;
}

export const WeeklyReceiptsCard = forwardRef<View, WeeklyReceiptsCardProps>(function WeeklyReceiptsCard({ model, frame, onFit }, ref) {
  const img = useFrameImage(frame ?? null);
  const strip = frame?.layout === 'strip' ? frame : null;
  // strip layout: the panel grows to the grid (two-pass — measured, then
  // sized) between the 846 px minimum and the point where the anchor band
  // would drop below STRIP_BAND_MIN. Beyond that the fit assert refuses.
  const [panelH, setPanelH] = useState<number>(STRIP_PANEL_MIN_H);
  // tier 1 draws words only (no digits) — the chip words ARE the content, so
  // they get the reading size the digits get on member tiers (11 pt = 22 px).
  const pub = model.tier === 1 || model.tier === 3;
  const framed = !!frame;
  const r = framed && !strip ? outputRect(frame!) : null;
  const screen = strip
    ? { left: STRIP_PANEL_X, top: STRIP_PANEL_TOP, width: LOGICAL_W - 2 * STRIP_PANEL_X, height: panelH }
    : framed
    ? { left: r!.x / 2, top: r!.y / 2, width: r!.w / 2, height: r!.h / 2 }
    : { left: CLASSIC_PAD, top: CLASSIC_PAD, width: LOGICAL_W - 2 * CLASSIC_PAD, height: LOGICAL_H - 2 * CLASSIC_PAD };
  const pad = framed ? PAD : 0;
  // strip geometry: scale so the figure spans the band exactly (helmet top at
  // the band's top edge, strip bottom at the canvas bottom), centred.
  const bandTop = STRIP_PANEL_TOP + panelH + STRIP_CLEAR;
  const anchorBandH = LOGICAL_H - bandTop;
  const sScale = strip ? anchorBandH / (strip.source.h - strip.strip!.figure.y) : 1;
  const stripW = strip ? strip.source.w * sScale : 0;
  const stripH = strip ? strip.source.h * sScale : 0;
  const stripLeft = (LOGICAL_W - stripW) / 2;
  const stripTop = bandTop - (strip ? strip.strip!.figure.y * sScale : 0);
  const canvasBg = strip ? strip.strip!.bg : C.bg;

  const [bandH, setBandH] = useState<number | null>(null);
  const [contentH, setContentH] = useState<number | null>(null);
  const naturalRef = useRef<number | null>(null);
  useEffect(() => {
    if (bandH == null || contentH == null) return;
    if (naturalRef.current == null) naturalRef.current = contentH;
    if (strip) {
      const want = Math.min(Math.max(naturalRef.current + 2 * PAD, STRIP_PANEL_MIN_H), STRIP_PANEL_MAX_H);
      if (Math.abs(want - panelH) > 0.5) { setPanelH(want); return; }   // second pass: the panel re-sizes, bandH re-measures
    }
    if (framed && img.error) { onFit?.({ ok: false, contentH: naturalRef.current, bandH, frameError: img.error }); return; }
    if (framed && !img.loaded) return;   // frame pixels must be on screen before a capture is allowed
    onFit?.({ ok: naturalRef.current <= bandH + 0.5, contentH: naturalRef.current, bandH });
  }, [bandH, contentH, framed, strip, panelH, img.loaded, img.error, onFit]);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: canvasBg }]}>
      {framed && !strip && img.source ? <Image source={img.source} style={styles.frame} resizeMode="cover" onLoad={img.onLoad} /> : null}
      {strip && img.source ? (
        <View style={{ position: 'absolute', left: stripLeft, top: stripTop, width: stripW, height: stripH }} pointerEvents="none">
          <Image source={img.source} style={{ width: stripW, height: stripH }} resizeMode="stretch" onLoad={img.onLoad} />
          {/* feather: the strip's top and side edges dissolve into the canvas (same colour as its background) */}
          <LinearGradient colors={[canvasBg, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: FEATHER }} />
          <LinearGradient colors={['transparent', canvasBg]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: FEATHER }} />
          <LinearGradient colors={[canvasBg, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(FEATHER, strip.strip!.figure.y * sScale - 2) }} />
        </View>
      ) : null}
      <View
        style={[styles.screen, strip ? styles.drawnPanel : framed ? { padding: PAD, borderRadius: 2 } : styles.classicPanel, screen]}
        onLayout={(e: LayoutChangeEvent) => setBandH(e.nativeEvent.layout.height - 2 * pad)}
      >
        {framed && !strip && <View style={styles.glassTint} pointerEvents="none" />}
        <View style={styles.content} onLayout={(e: LayoutChangeEvent) => setContentH(e.nativeEvent.layout.height)}>
          <View style={styles.header}>
            <Text style={styles.brand}>{BRIEF_COPY.brand} <Text style={{ color: C.cyan }}>{BRIEF_COPY.brandAccent}</Text></Text>
            <Text style={styles.kicker}>{model.kicker}</Text>
            <Text style={styles.range}>{model.range}</Text>
          </View>
          <View style={styles.headRow}>
            <View style={styles.dayCol} />
            {model.columns.map((c, i) => <Text key={i} style={[styles.colHead, { flex: 1 }]}>{c}</Text>)}
          </View>
          {model.rows.map((row, ri) => (
            <View key={ri} style={[styles.row, pub && styles.rowPub]}>
              <Text style={[styles.dayLabel, styles.dayCol]}>{row.label}</Text>
              {row.cells.map((cell, ci) => <Cell key={ci} cell={cell} pub={pub} />)}
            </View>
          ))}
          <Text style={styles.footer1}>{model.footer1}</Text>
          <Text style={styles.footer2}>{model.footer2}</Text>
        </View>
        {framed && (
          <View style={styles.scanlines} pointerEvents="none">
            {Array.from({ length: Math.floor(screen.height / 3) }, (_, i) => <View key={i} style={styles.scanline} />)}
          </View>
        )}
      </View>
    </View>
  );
});

function Cell({ cell, pub }: { cell: WeeklyModelCell; pub: boolean }) {
  if (cell.state === 'empty') return <View style={styles.cell} />;            // nothing at all (ruling A)
  if (cell.state === 'none') return <View style={styles.cell}><Text style={[styles.dash, pub && styles.tagPub]}>—</Text></View>;
  const gold = cell.state === 'straight';
  return (
    <View style={styles.cell}>
      <Text style={[styles.tag, pub && styles.tagPub, { color: gold ? C.goldSoft : C.green }]}>{cell.tag}</Text>
      {cell.chips.length > 0 && (
        <View style={styles.chips}>
          {cell.chips.map((ch, i) => <Text key={i} style={[styles.chip, { color: ch.straight ? C.goldSoft : C.green }]}>{ch.text}</Text>)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: LOGICAL_W, height: LOGICAL_H, backgroundColor: C.bg, overflow: 'hidden' },
  frame: { position: 'absolute', left: 0, top: 0, width: LOGICAL_W, height: LOGICAL_H },
  screen: { position: 'absolute', overflow: 'hidden' },
  // classic: the grid sits vertically centred in the panel (the band is still
  // the fit reference — content taller than the band is refused, never shrunk)
  // the code-drawn glass (strip layout): flat near-black, one thin violet glow
  // line (border + soft shadow), the daily tint/scanline treatment on top
  // the grid is vertically centred when the panel sits at its 846 px minimum
  // (short public grids); a grid that sets the panel height fills it anyway
  drawnPanel: { padding: PAD, backgroundColor: '#0B0914', borderWidth: 1.5, borderColor: '#A855F7', borderRadius: 2, boxShadow: '0 0 6px 1px rgba(168,85,247,0.55)', justifyContent: 'center' } as any,
  classicPanel: { backgroundColor: C.panel, borderRadius: 12, borderWidth: 1, borderColor: C.panelEdge, padding: 12, justifyContent: 'center' },
  glassTint: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: C.glass },
  content: { flexShrink: 0 },
  scanlines: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, gap: 2 },
  scanline: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)' },

  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  brand: { color: C.text, fontFamily: SANS_B, fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
  kicker: { color: C.purpleSoft, fontFamily: SANS_B, fontSize: 7.5, lineHeight: 10, letterSpacing: 2 },
  range: { color: C.textDim, fontFamily: MONO_B, fontSize: 7.5, lineHeight: 10, letterSpacing: 1.5 },

  headRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 1 },
  dayCol: { width: 52 },
  colHead: { color: C.cyanSoft, fontFamily: SANS_B, fontSize: 7, lineHeight: 9, letterSpacing: 1.6, paddingLeft: 2 },

  row: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 0.5, borderTopColor: C.hair, paddingVertical: 1.5 },
  dayLabel: { color: C.purpleSoft, fontFamily: SANS_B, fontSize: 8, lineHeight: 11, paddingTop: 1 },
  cell: { flex: 1, paddingLeft: 2, paddingRight: 3, minHeight: 11 },
  dash: { color: C.dash, fontFamily: MONO_B, fontSize: 7.5, lineHeight: 11 },
  tag: { fontFamily: MONO_B, fontSize: 7.5, lineHeight: 11, letterSpacing: 0.4 },
  tagPub: { fontSize: 11, lineHeight: 15, letterSpacing: 0.8 },
  rowPub: { paddingVertical: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 },
  // 17 pt logical = 34 px at 1080 ≥ the 31.5 px floor (MKT-82 F6)
  chip: { fontFamily: MONO_B, fontSize: 17, lineHeight: 19, letterSpacing: 1.2 },

  footer1: { color: C.goldSoft, fontFamily: SANS_B, fontSize: 7, lineHeight: 10, marginTop: 4 },
  // 7 pt, not 6: at 6 pt Inter Bold's word spaces collapse in the 2× raster ("Sixsignalsaday", 10/11 rig).
  footer2: { color: C.textFaint, fontFamily: SANS_B, fontSize: 7, lineHeight: 10, letterSpacing: 0.3, marginTop: 2 },
});
