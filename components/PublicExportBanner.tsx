/* ============================================================================
   PublicExportBanner
   ----------------------------------------------------------------------------
   Static brand banner appended to the bottom of every PUBLIC image export
   (1080×~150 region of a 1080×1920 PNG).

   Two prior attempts at width-fitting (static font shrink, then padding-as-
   constraint) both leaked: the inner Text isn't actually constrained by the
   outer banner's padding when alignItems='center', because an overflowing
   centered child overflows symmetrically. This version measures the text
   width in the DOM and shrinks the font until it fits.

   This is the single source of truth for CTA copy/styling in exports.
   Banner content changes require a code edit here — intentional, prevents
   accidental drift on a public-facing surface.
   ============================================================================ */
import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from '@/constants/theme';

interface PublicExportBannerProps {
  /** Fixed banner height in pixels (default 150 per spec). */
  height?: number;
  /** Copy variant — 'public' (JOIN FREE) or 'pro_upsell' for the free group's
   *  redacted Midday/Evening drops (SOCIAL-13). */
  variant?: 'public' | 'pro_upsell';
}

// ── Geometry constants ──────────────────────────────────────────────────────
// The banner is rendered inside the export stage's stageScaleWrap (390 logical
// px wide, scaled 2.769× to fill 1080 output px). Anything wider than the
// stageScaleWrap leaks symmetrically out both sides because the banner uses
// alignItems: 'center'. Hence: measure, then shrink to fit.
const STAGE_LOGICAL_WIDTH       = 390;
const STAGE_SCALE               = 1080 / STAGE_LOGICAL_WIDTH;   // ≈ 2.769
const BANNER_PADDING_LOGICAL    = 22;                            // ≈ 61 output px each side
const MAX_TEXT_LOGICAL          = STAGE_LOGICAL_WIDTH - 2 * BANNER_PADDING_LOGICAL; // 346 logical ≈ 958 output px
const MAX_TEXT_OUTPUT_PX        = MAX_TEXT_LOGICAL * STAGE_SCALE; // ≈ 958 (spec wants ≤960)
const BASE_FONT_SIZE            = 21;
const BOLT_RATIO                = 23 / 21;   // bolt has historically rendered slightly larger than body
const SAFETY_FACTOR             = 0.97;      // headroom for subpixel slack + bolt-glyph overhang

// U+FE0E (VARIATION SELECTOR-15) forces a text-style glyph for ⚡ instead of
// the OS emoji-font substitution, which would ignore our gold color.
const BOLT = '⚡︎';
const SEG_DIVIDER = '  ·  ';
const SEG_GAP     = '  ';
// Per-variant copy (SOCIAL-13): 'public' is the classic public/cross-post
// JOIN FREE banner; 'pro_upsell' rides the FREE group's redacted Midday/
// Evening drops, where the CTA is the Pro tier, not the free group.
const SEGMENTS: Record<'public' | 'pro_upsell', { primary: string; cta: string }> = {
  public:     { primary: 'FULL SLATE INSIDE',  cta: 'JOIN FREE' },
  pro_upsell: { primary: 'FULL SESSION DROP',  cta: 'FIRST IN PRO' },
};

const NAVY  = '#0A1525';
const WHITE = '#FFFFFF';
const CYAN  = '#00D4FF';
const GOLD  = '#FFD700';

/**
 * Measure a CSS-styled text string's rendered width in logical px using a
 * detached hidden span — this is the only browser-portable way to capture
 * letter-spacing accurately (CanvasRenderingContext2D.measureText ignores
 * letterSpacing in many engines). Returns 0 if document is unavailable.
 */
function measureLogicalWidth(text: string, fontSize: number, letterSpacing: number, fontFamily: string): number {
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('span');
  probe.style.position    = 'absolute';
  probe.style.left        = '-10000px';
  probe.style.top         = '-10000px';
  probe.style.visibility  = 'hidden';
  probe.style.whiteSpace  = 'nowrap';
  probe.style.fontFamily  = fontFamily;
  probe.style.fontWeight  = '900';
  probe.style.fontSize    = `${fontSize}px`;
  probe.style.letterSpacing = `${letterSpacing}px`;
  probe.textContent = text;
  document.body.appendChild(probe);
  const w = probe.offsetWidth;
  document.body.removeChild(probe);
  return w;
}

export function PublicExportBanner({ height = 150, variant = 'public' }: PublicExportBannerProps) {
  const [fontSize, setFontSize] = useState<number>(BASE_FONT_SIZE);
  const seg = SEGMENTS[variant];

  useLayoutEffect(() => {
    if (Platform.OS !== 'web') return;
    const family   = theme.typography.fontFamily.monoBold;
    const fullText = seg.primary + SEG_DIVIDER + seg.cta + SEG_GAP + BOLT;
    const ls       = 1.2;

    // 1) Probe at BASE_FONT_SIZE → measured logical width.
    const probeWidth = measureLogicalWidth(fullText, BASE_FONT_SIZE, ls, family);
    if (probeWidth <= 0) return; // measurement unavailable; fall back to BASE_FONT_SIZE

    // 2) Compute the largest font size whose text fits within MAX_TEXT_LOGICAL.
    //    Width scales approximately linearly with font size for the same
    //    string, so a single ratio computation + safety factor is sufficient.
    const fitRatio = MAX_TEXT_LOGICAL / probeWidth;
    const fitted =
      probeWidth <= MAX_TEXT_LOGICAL
        ? BASE_FONT_SIZE
        // Round DOWN to nearest 0.5px so we never re-overflow due to rounding.
        : Math.floor(BASE_FONT_SIZE * fitRatio * SAFETY_FACTOR * 2) / 2;

    // 3) Verify by re-measuring at the fitted size. Logged so a CI screenshot
    //    or operator can confirm the geometry without an eyeball check.
    const verifiedWidth = measureLogicalWidth(fullText, fitted, ls, family);
    const verifiedOutputPx = verifiedWidth * STAGE_SCALE;
    const marginEachSidePx = (1080 - verifiedOutputPx) / 2;

    // eslint-disable-next-line no-console
    console.log('[banner-fit]', {
      probeFontSize:        BASE_FONT_SIZE,
      probeWidthLogical:    probeWidth,
      probeWidthOutputPx:   Math.round(probeWidth * STAGE_SCALE),
      maxTextLogical:       MAX_TEXT_LOGICAL,
      maxTextOutputPx:      Math.round(MAX_TEXT_OUTPUT_PX),
      fittedFontSize:       fitted,
      fittedWidthLogical:   verifiedWidth,
      fittedWidthOutputPx:  Math.round(verifiedOutputPx),
      canvasWidthPx:        1080,
      marginEachSidePx:     Math.round(marginEachSidePx),
      passes:               verifiedOutputPx <= MAX_TEXT_OUTPUT_PX && marginEachSidePx >= 30,
    });

    if (fitted !== BASE_FONT_SIZE) setFontSize(fitted);
  }, [seg.primary, seg.cta]);

  const boltSize = fontSize * BOLT_RATIO;

  return (
    <View style={[styles.banner, { height }]}>
      <View style={styles.topRule} />
      <View style={styles.content}>
        <Text style={[styles.text, { fontSize }]} numberOfLines={1} ellipsizeMode="clip">
          <Text style={styles.primary}>{seg.primary}</Text>
          <Text style={styles.divider}>{SEG_DIVIDER}</Text>
          <Text style={styles.cta}>{seg.cta}</Text>
          <Text>{SEG_GAP}</Text>
          <Text style={[styles.bolt, { fontSize: boltSize }]}>{BOLT}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    backgroundColor: NAVY,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: BANNER_PADDING_LOGICAL,
    // Defense-in-depth: if a future copy change exceeds what the dynamic-fit
    // measurement can shrink to, overflow clips at the banner edge rather
    // than bleeding past the 1080 canvas.
    overflow: 'hidden',
  },
  topRule: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1.5,
    backgroundColor: CYAN,
    opacity: 0.55,
  },
  content: {
    // Hard width cap matching the measurement target. numberOfLines=1 will
    // ellipsize/clip if anything ever exceeds this — but the useLayoutEffect
    // above sizes the font so the natural width sits comfortably inside it.
    maxWidth: MAX_TEXT_LOGICAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  primary: {
    color: WHITE,
  },
  divider: {
    color: WHITE,
    opacity: 0.6,
  },
  cta: {
    color: CYAN,
  },
  bolt: {
    color: GOLD,
  },
});
