/**
 * Dual-mode color palettes for the app.
 *
 * `darkColors` mirrors the legacy `constants/theme.ts` colors object exactly —
 * existing screens that read from the singleton `theme` export get bit-identical
 * output today.
 *
 * `lightColors` is the new "lighter chrome + dark cards" palette: page surfaces,
 * headers, and the tab bar go light; cards/modals stay in the cosmic dark palette
 * so signal colors (cyan/rose/gold/purple) keep their contrast. This is the
 * lower-risk path — fully-light surfaces require designing parallel light-mode
 * signal colors, which is parked until beta reactions on phase 1+2 come back.
 *
 * The two palettes share the same KEY set so `useTheme().colors.X` resolves
 * identically regardless of mode (the value differs, not the lookup).
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

// Light palette — soft warm white surfaces, dark cosmic cards retained. Each
// token MUST exist on both palettes; if a token isn't meaningfully different
// in light mode (signal accent colors, brand, tiers, etc.), it keeps the dark
// value verbatim so cards rendered inside light pages still look correct.
export const lightColors: ColorTokens = {
  // Surfaces — warm off-white. Avoid pure #fff (too harsh next to the saturated
  // signal colors); the slight warmth lines up with the cosmic-purple brand.
  background:   '#f7f5fb',
  bgElevated:   '#ffffff',
  // Cards stay dark cosmic — preserves contrast for signal chips, hit pills,
  // pick combos. Slightly opaqued vs the dark-mode card so it reads as a
  // deliberate inset on a light page.
  card:         'rgba(20,12,38,0.92)',
  border:       'rgba(15,8,32,0.10)',
  borderMed:    'rgba(15,8,32,0.18)',

  // Text — dark cosmic ink on light, mirrors the dark palette's contrast tiers.
  text:          '#120a1f',
  textSecondary: 'rgba(18,10,31,0.72)',
  textTertiary:  'rgba(18,10,31,0.50)',

  // Signal channels — UNCHANGED. They live on dark cards/chips even when the
  // page is light. The chrome (tab bar, headers) avoids using these colors
  // as fills against light bg; small accents (icons, focus rings) are fine.
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
  // Tinted neutrals get darker bases on light bg so the 12%-alpha actually
  // reads as a tint instead of disappearing.
  neutralCool:   'rgba(20,140,108,0.10)',
  neutralWarm:   'rgba(204,80,30,0.10)',

  hot:  '#d12d24',
  warm: '#c79400',
  mild: '#1f9d3f',
  cold: '#9aa0a6',

  success:      '#1f9d3f',
  successLight: 'rgba(31,157,63,0.12)',
  error:        '#d12d24',
  errorLight:   'rgba(209,45,36,0.12)',
  warning:      '#c79400',

  free:    '#9aa0a6',
  premium: '#b68d00',
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
  crownGold:    '#b68d00',
  dataBlue:     '#1078d0',
  dataGreen:    '#1f9d3f',
  dataYellow:   '#b68d00',
  dataPurple:   '#7a3fd6',
  orange:       '#cc501e',
  teal:         '#0e9f7a',
  tealLight:    'rgba(14,159,122,0.10)',
  cosmic:       '#7a3fd6',
  cosmicLight:  'rgba(122,63,214,0.10)',
  goldLight:    'rgba(182,141,0,0.12)',
  roseLight:    'rgba(204,30,114,0.10)',
};

// Compile-time assertion that the two palettes have identical key sets.
type AssertSameKeys<A, B extends Record<keyof A, unknown>> = B;
type _CheckKeys = AssertSameKeys<typeof darkColors, typeof lightColors>;
