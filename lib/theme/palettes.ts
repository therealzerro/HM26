/**
 * Dual-mode color palettes for the app.
 *
 * `darkColors` mirrors the legacy `constants/theme.ts` colors object exactly —
 * existing screens that read from the singleton `theme` export get bit-identical
 * output today.
 *
 * `lightColors` is the fully-light palette: light page surfaces AND light
 * cards, with signal hues darkened to WCAG-AA-passing variants on those
 * surfaces. Hue families preserved (BOX is still teal-family, CO purple, etc.).
 *
 * The two palettes share the same KEY set so `useTheme().colors.X` resolves
 * identically regardless of mode (the value differs, not the lookup).
 *
 * ┌─ DESIGN-01 (Phase 3 shipped 2026-05-15) ────────────────────────────────┐
 * │ Light-mode signal hues (BOX/PBURST/CO/DGC + cyan/rose/gold/purple/amber)│
 * │ are darkened to WCAG-AA-passing variants on `#f7f5fb` page bg and on    │
 * │ `#ffffff` card surfaces. Cards flipped from cosmic-dark to light. Hue   │
 * │ family preserved so the BOX-is-teal / CO-is-purple mental model still  │
 * │ holds. See MASTER_AUDIT.md DESIGN-01 closure entry.                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

// Dark palette — copy of the legacy theme.colors, kept in lockstep with the
// `constants/theme.ts` singleton until all consumers migrate to useTheme().
export const darkColors = {
  // Surfaces
  background:   '#0a0613',
  bgElevated:   '#120a1f',
  card:         'rgba(20,12,38,0.72)',
  border:       'rgba(255,255,255,0.08)',
  borderMed:    'rgba(255,255,255,0.16)',

  // Text
  text:          '#ffffff',
  textSecondary: 'rgba(255,255,255,0.72)',
  textTertiary:  'rgba(255,255,255,0.45)',

  // Signal channels — unchanged across modes for now (designed on dark, used
  // inside dark cards even in light mode, hence the "lighter chrome + dark
  // cards" pattern).
  cyan:   '#2bffcc',
  rose:   '#ff3d9a',
  amber:  '#ff6a2b',
  gold:   '#ffd93d',
  purple: '#9b5bff',
  blue:   '#22a3ff',

  BOX:    '#2bffcc',
  PBURST: '#ff3d9a',
  CO:     '#9b5bff',
  DGC:    '#ffd93d',

  freqSignal:    '#2bffcc',
  momoSignal:    '#ff3d9a',
  patternSignal: '#9b5bff',
  consistSignal: '#ffd93d',
  hotStreak:     '#ff6a2b',
  brand:         '#9b5bff',
  neutralCool:   'rgba(43,255,204,0.12)',
  neutralWarm:   'rgba(255,106,43,0.12)',

  hot:  '#ff3b30',
  warm: '#ffcc00',
  mild: '#34c759',
  cold: '#666666',

  success:      '#34c759',
  successLight: 'rgba(52,199,89,0.12)',
  error:        '#ff3b30',
  errorLight:   'rgba(255,59,48,0.12)',
  warning:      '#ffcc00',

  free:    '#666666',
  premium: '#ffd93d',
  admin:   '#9b5bff',

  surface2: '#0d0820',

  primary:      '#9b5bff',
  primaryLight: 'rgba(155,91,255,0.12)',
  surface:      '#120a1f',
  surfaceLight: 'rgba(255,255,255,0.06)',
  surfaceMuted: 'rgba(255,255,255,0.04)',
  crownGold:    '#ffd93d',
  dataBlue:     '#22a3ff',
  dataGreen:    '#34c759',
  dataYellow:   '#ffd93d',
  dataPurple:   '#9b5bff',
  orange:       '#ff6a2b',
  teal:         '#2bffcc',
  tealLight:    'rgba(43,255,204,0.12)',
  cosmic:       '#9b5bff',
  cosmicLight:  'rgba(155,91,255,0.12)',
  goldLight:    'rgba(255,217,61,0.12)',
  roseLight:    'rgba(255,61,154,0.12)',
};

// Widen each value to `string` so lightColors can supply different hex/rgba
// values for the same keys. Key-set equality is enforced via `_CheckKeys`.
export type ColorTokens = { [K in keyof typeof darkColors]: string };

// Light palette — soft warm white surfaces with light cards. Each token MUST
// exist on both palettes; signal channel hues are darkened to WCAG-AA-passing
// variants while keeping the hue family (BOX-is-teal, CO-is-purple, etc.).
//
// ┌─ DESIGN-02 T3 — WCAG contrast pass (2026-07-25) ─────────────────────────┐
// │ Computed WCAG 2.x contrast ratios for every hue used as text/icon color, │
// │ against page bg #f7f5fb AND white cards #ffffff. Target: ≥4.5:1 on both  │
// │ (these hues render at tiny sizes — 7-13pt — where even bold text needs   │
// │ the 4.5:1 normal-text threshold; the 3:1 large-text exemption only       │
// │ applies at ≥18pt regular / ≥14pt bold, which almost nothing here is).    │
// │                                                                          │
// │ Token        before    vs bg / white     after     vs bg / white         │
// │ cyan/teal    #0e9f7a   3.10 / 3.36  →   #0a7d60   4.72 / 5.10           │
// │ rose         #cc1e72   4.86 / 5.26      (kept — passes)                  │
// │ amber        #cc501e   4.10 / 4.44  →   #bf4a1c   4.61 / 4.99           │
// │ gold         #b68d00   2.85 / 3.09  →   #8f6b00   4.54 / 4.92           │
// │ purple       #7a3fd6   5.53 / 5.98      (kept — passes)                  │
// │ blue         #1078d0   4.20 / 4.55  →   #0e70c4   4.70 / 5.08           │
// │ hot/error    #d12d24   4.72 / 5.11      (kept — passes)                  │
// │ warm/warning #c79400   2.53 / 2.74  →   #8a6900   4.73 / 5.12           │
// │ mild/success #1f9d3f   3.26 / 3.53  →   #187a31   5.02 / 5.43           │
// │ cold/free    #9aa0a6   2.44 / 2.64  →   #6c7278   4.50 / 4.87           │
// │                                                                          │
// │ Derived rgba tints (tealLight/goldLight/successLight/neutral*) re-based  │
// │ on the new hues — they are fills, not text, so no ratio requirement,     │
// │ but keeping the derivation honest avoids hue drift inside chips.         │
// └──────────────────────────────────────────────────────────────────────────┘
export const lightColors: ColorTokens = {
  // Surfaces — warm off-white. Avoid pure #fff for the page bg (too harsh
  // next to the saturated signal colors); the slight warmth lines up with the
  // cosmic-purple brand.
  background:   '#f7f5fb',
  bgElevated:   '#ffffff',
  // Cards flip to light: pure white sits one step above the warm-off-white bg.
  // Layering is conveyed by the border + theme.shadows (handled per-component);
  // raising contrast via card tint risks fighting the signal palette.
  card:         '#ffffff',
  border:       'rgba(15,8,32,0.10)',
  borderMed:    'rgba(15,8,32,0.18)',

  // Text — dark cosmic ink on light, mirrors the dark palette's contrast tiers.
  text:          '#120a1f',
  textSecondary: 'rgba(18,10,31,0.72)',
  textTertiary:  'rgba(18,10,31,0.50)',

  // Signal channels — deepened to WCAG-AA-passing variants on #f7f5fb bg AND
  // #ffffff cards (see ratio table above). Hue family preserved so channel
  // coding stays intuitive.
  cyan:   '#0a7d60',  // deep teal (was #2bffcc neon teal on dark)
  rose:   '#cc1e72',  // deep rose (was #ff3d9a hot pink on dark)
  amber:  '#bf4a1c',  // deep amber (was #ff6a2b on dark)
  gold:   '#8f6b00',  // deep gold (was #ffd93d on dark)
  purple: '#7a3fd6',  // deep purple (was #9b5bff on dark)
  blue:   '#0e70c4',  // deep blue (was #22a3ff on dark)

  BOX:    '#0a7d60',  // = cyan
  PBURST: '#cc1e72',  // = rose
  CO:     '#7a3fd6',  // = purple
  DGC:    '#8f6b00',  // = gold

  freqSignal:    '#0a7d60',
  momoSignal:    '#cc1e72',
  patternSignal: '#7a3fd6',
  consistSignal: '#8f6b00',
  hotStreak:     '#bf4a1c',
  brand:         '#7a3fd6',
  // Tinted neutrals — same deep bases as cyan/amber at 10% alpha. Visible on
  // both light bg and white cards.
  neutralCool:   'rgba(10,125,96,0.10)',
  neutralWarm:   'rgba(191,74,28,0.10)',

  hot:  '#d12d24',
  warm: '#8a6900',
  mild: '#187a31',
  cold: '#6c7278',

  success:      '#187a31',
  successLight: 'rgba(24,122,49,0.12)',
  error:        '#d12d24',
  errorLight:   'rgba(209,45,36,0.12)',
  warning:      '#8a6900',

  free:    '#6c7278',
  premium: '#8f6b00',
  admin:   '#7a3fd6',

  // surface2 is "one layer above background" — in light, that's a soft tint
  // a hair darker than bg so layering still reads.
  surface2: '#ebe6f3',

  // Back-compat shims — pick darker variants where the dark version was a
  // pure accent (purple/cyan/gold). These DO get used in the chrome paths,
  // so they need contrast with the light background.
  primary:      '#7a3fd6',
  primaryLight: 'rgba(122,63,214,0.12)',
  surface:      '#ffffff',
  surfaceLight: 'rgba(20,12,38,0.04)',
  surfaceMuted: 'rgba(20,12,38,0.02)',
  crownGold:    '#8f6b00',
  dataBlue:     '#0e70c4',
  dataGreen:    '#187a31',
  dataYellow:   '#8f6b00',
  dataPurple:   '#7a3fd6',
  orange:       '#bf4a1c',
  teal:         '#0a7d60',
  tealLight:    'rgba(10,125,96,0.10)',
  cosmic:       '#7a3fd6',
  cosmicLight:  'rgba(122,63,214,0.10)',
  goldLight:    'rgba(143,107,0,0.12)',
  roseLight:    'rgba(204,30,114,0.10)',
};

// Compile-time assertion that the two palettes have identical key sets.
type AssertSameKeys<A, B extends Record<keyof A, unknown>> = B;
type _CheckKeys = AssertSameKeys<typeof darkColors, typeof lightColors>;
