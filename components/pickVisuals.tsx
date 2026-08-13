/* ============================================================================
   pickVisuals.tsx — shared leaf components used by both PickDetailModal
   and PickPosterCard.
   ----------------------------------------------------------------------------
   Living here (vs. duplicated) so future styling changes to the modal
   propagate automatically to the export poster — INVARIANT 4.
   ============================================================================ */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { theme } from '@/constants/theme';
import { heatColor, useTheme, type ColorTokens } from '@/lib/theme';

export type DTokens = {
  bg: string; surface: string; glass: string; glassBorder: string; borderMed: string;
  cyan: string; rose: string; purple: string; gold: string; amber: string; hot: string; success: string;
  text: string; textSub: string; textDim: string;
  mono: string; monoBold: string;
};

export function makeD(colors: ColorTokens): DTokens {
  return {
    bg:          colors.background,
    surface:     colors.bgElevated,
    glass:       colors.card,
    glassBorder: colors.border,
    borderMed:   colors.borderMed,
    cyan:        colors.cyan,
    rose:        colors.rose,
    purple:      colors.purple,
    gold:        colors.gold,
    amber:       colors.amber,
    hot:         colors.hot,
    success:     colors.success,
    text:        colors.text,
    textSub:     colors.textSecondary,
    textDim:     colors.textTertiary,
    mono:        theme.typography.fontFamily.mono,
    monoBold:    theme.typography.fontFamily.monoBold,
  };
}

export function useD(): DTokens {
  const { colors } = useTheme();
  return useMemo(() => makeD(colors), [colors]);
}

// ─── EnergyArc ───────────────────────────────────────────────────────────────
// `animate` defaults to true (existing modal behavior). Posters pass false
// to keep the capture deterministic.
// `palette` overrides the mode-aware theme palette — the mode-locked posters
// (LIGHT-01) pass darkColors; mode-aware surfaces (PickDetailModal) omit it.
export function EnergyArc({ value, size = 80, animate = true, palette }: { value: number; size?: number; animate?: boolean; palette?: ColorTokens }) {
  const { colors: themeColors } = useTheme();
  const colors = palette ?? themeColors;
  const D = useMemo(() => makeD(colors), [colors]);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (animate && value >= 80) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.07, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.96, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    }
  }, [animate, value]);

  const r     = (size - 14) / 2;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * Math.min(1, Math.max(0, value) / 100);
  const gap   = circ - dash;
  // DESIGN-02 T1.1: former local 90/75/60 ramp (hot/amber/gold/cyan) replaced
  // by the canonical heat scale (90/80/65/45) so the same energy score maps to
  // the same color everywhere.
  const accent = heatColor(value, colors);

  return (
    <Animated.View style={{ transform: [{ scale: animate && value >= 80 ? pulse : 1 }] }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="earc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={D.cyan}   />
            <Stop offset="100%" stopColor={accent}   />
          </SvgGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={D.text + theme.alpha.faint} strokeWidth={7} />
        <Circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="url(#earc)" strokeWidth={7}
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: accent, fontFamily: D.monoBold, lineHeight: 22 }}>{value}</Text>
          <Text style={{ fontSize: 9, color: D.textDim, fontWeight: '700', letterSpacing: 0.5 }}>ENERGY</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── SignalPill ──────────────────────────────────────────────────────────────
const makeSp = (D: DTokens) => StyleSheet.create({
  card:   { flex: 1, backgroundColor: D.glass, borderRadius: 10, borderWidth: 1, borderColor: D.glassBorder, paddingVertical: 10, paddingHorizontal: 8, gap: 4, alignItems: 'center' },
  label:  { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  val:    { fontSize: 22, fontWeight: '900', fontFamily: D.monoBold, lineHeight: 24 },
  suffix: { fontSize: 11, fontWeight: '700' },
  track:  { width: '100%', height: 3, backgroundColor: D.text + theme.alpha.faint, borderRadius: 2, overflow: 'hidden' },
  fill:   { height: 3, borderRadius: 2 },
});

export function SignalPill({ label, value, color, palette }: { label: string; value: number; color: string; palette?: ColorTokens }) {
  const { colors: themeColors } = useTheme();
  const D = useMemo(() => makeD(palette ?? themeColors), [palette, themeColors]);
  const sp = useMemo(() => makeSp(D), [D]);
  const pct = Math.round(value * 100);
  return (
    <View style={sp.card}>
      <Text style={[sp.label, { color }]}>{label}</Text>
      <Text style={[sp.val, { color }]}>{pct}<Text style={sp.suffix}>%</Text></Text>
      <View style={sp.track}>
        <View style={[sp.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── RedactedGlyph ───────────────────────────────────────────────────────────
// Pixel-mosaic block that replaces a digit when content is redacted. The
// mosaic uses the digit's intended color (e.g. the temperature color in
// SlatePosterCard) so the card's color hierarchy is preserved — the redacted
// area still reads as the visual hero of the card. Pseudo-random per-cell
// opacity makes it look like an obscured digit rather than missing data.

export interface RedactedGlyphProps {
  /** Approximate visual size in px of a single digit (height ~ size, width ~ size * 0.7). */
  size: number;
  /** Color used for the mosaic cells (typically the original digit color). */
  color: string;
  /** Seed offset so adjacent glyphs use different patterns (default 0). */
  seed?: number;
}

const PRIME_A = 73;
const PRIME_B = 19;
const PRIME_C = 31;

export function RedactedGlyph({ size, color, seed = 0 }: RedactedGlyphProps) {
  const cols = 4;
  const rows = 6;
  const cellW = (size * 0.7) / cols;
  const cellH = size / rows;
  const cells: { opacity: number }[] = [];
  for (let i = 0; i < cols * rows; i++) {
    // Deterministic pseudo-random in [0.35, 0.95]
    const h = ((i + 1) * PRIME_A + seed * PRIME_B) % PRIME_C;
    const opacity = 0.35 + (h / PRIME_C) * 0.6;
    cells.push({ opacity });
  }
  return (
    <View style={{ width: size * 0.7, height: size, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', borderRadius: 3 }}>
      {cells.map((c, i) => (
        <View
          key={i}
          style={{
            width: cellW,
            height: cellH,
            backgroundColor: color,
            opacity: c.opacity,
          }}
        />
      ))}
    </View>
  );
}

// Render N redacted glyphs in a row with the requested gap between them.
export function RedactedDigitRow({
  count, size, color, gap = 12,
}: { count: number; size: number; color: string; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <RedactedGlyph key={i} size={size} color={color} seed={i + 1} />
      ))}
    </View>
  );
}

// ─── WhyRow ──────────────────────────────────────────────────────────────────
const makeWy = (D: DTokens) => StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: D.glassBorder },
  iconBox:  { width: 32, height: 32, borderRadius: 9, backgroundColor: D.text + theme.alpha.faint, alignItems: 'center', justifyContent: 'center' },
  icon:     { fontSize: 16 },
  text:     { flex: 1 },
  label:    { fontSize: 11, fontWeight: '700', color: D.text, lineHeight: 14 },
  desc:     { fontSize: 10, color: D.textDim, marginTop: 2, lineHeight: 13 },
  badge:    { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  badgeNum: { fontSize: 13, fontWeight: '900', fontFamily: D.monoBold },
});

export function WhyRow({ icon, label, desc, score, palette }: { icon: string; label: string; desc: string; score: number; palette?: ColorTokens }) {
  const { colors: themeColors } = useTheme();
  const D = useMemo(() => makeD(palette ?? themeColors), [palette, themeColors]);
  const wy = useMemo(() => makeWy(D), [D]);
  const c = score >= 70 ? D.cyan : score >= 40 ? D.gold : D.textDim;
  return (
    <View style={wy.row}>
      <View style={wy.iconBox}><Text style={wy.icon}>{icon}</Text></View>
      <View style={wy.text}>
        <Text style={wy.label}>{label}</Text>
        <Text style={wy.desc}>{desc}</Text>
      </View>
      <View style={[wy.badge, { borderColor: c + '55', backgroundColor: c + '15' }]}>
        <Text style={[wy.badgeNum, { color: c }]}>{score}%</Text>
      </View>
    </View>
  );
}
