/* ============================================================
   HitMaster — Global Theme (JS / React Native friendly)
   ------------------------------------------------------------
   Single source of truth for colors, typography, spacing, and
   data-driven visual rules. Import wherever you need values:

     import { theme, temperatureTier, channelColor } from './hitmaster-theme';

   Works in plain JS, React, and React Native (no DOM deps).
   ============================================================ */

export const colors = {
  // surfaces
  bg:        '#0a0613',
  bgElev:    '#120a1f',
  card:      'rgba(20, 12, 38, 0.72)',
  cardStrong:'rgba(20, 12, 38, 0.92)',
  border:    'rgba(255, 255, 255, 0.08)',
  divider:   'rgba(255, 255, 255, 0.06)',

  // text
  text:          '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textTertiary:  'rgba(255, 255, 255, 0.45)',
  textDisabled:  'rgba(255, 255, 255, 0.25)',

  // signal channel palette
  cyan:   '#2bffcc', cyan2:   '#15d9a8',
  rose:   '#ff3d9a', rose2:   '#e91e63',
  amber:  '#ff6a2b', amber2:  '#ff3b30',
  gold:   '#ffd93d',
  purple: '#9b5bff', purple2: '#b388ff',
  blue:   '#22a3ff',
};

// Temperature scale per data spec
export const temperature = {
  hot:  { color: '#ff3b30', label: 'HOT',  threshold: 80 },
  warm: { color: '#ffcc00', label: 'WARM', threshold: 60 },
  mild: { color: '#34c759', label: 'MILD', threshold: 40 },
  cold: { color: '#666666', label: 'COLD', threshold: 0  },
};

export function temperatureTier(value) {
  if (value >= 80) return 'hot';
  if (value >= 60) return 'warm';
  if (value >= 40) return 'mild';
  return 'cold';
}
export function temperatureColor(value) {
  return temperature[temperatureTier(value)].color;
}

// Data-spec signal channel → brand color mapping
export const channels = {
  BOX:    { color: colors.cyan,   label: 'Box'    },
  PBURST: { color: colors.rose,   label: 'Pburst' },
  CO:     { color: colors.purple, label: 'CO'     },
  DGC:    { color: colors.gold,   label: 'DGC'    },
};
export const channelColor = (key) => channels[key]?.color || colors.textTertiary;

// Typography
export const typography = {
  fontSans: 'Inter',
  fontMono: 'JetBrainsMono-Regular',  // RN: bundle the .ttf + give it this PostScript name
  weight: { regular: '400', medium: '500', bold: '700', black: '800' },
  size: {
    eyebrow: 10, body: 13, card: 16, h2: 18, h1: 24,
    stat: 32, combo: 38, hero: 72,
  },
  trackEyebrow: 1.6,    // 0.16em ≈ letterSpacing 1.6 at 10pt
};

// Spacing (8px grid)
export const spacing = { 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32 };

// Radii
export const radius = {
  pill: 999, card: 16, tile: 12, chip: 10, bar: 2, banner: 8,
};

// SlateCard / SignalBar metrics (per data spec)
export const slatecard = {
  paddingX: 12, paddingY: 8, gap: 8,
  rankWidth: 32, rankPaddingRight: 8,
};
export const signalbar = {
  height: 4, gap: 6,
  labelWidth: 60, fillMaxWidth: 60, valueWidth: 22,
  fontSize: 9,    // 9pt → 9
};

// Motion
export const motion = {
  ease: 'cubic-bezier(.22,.61,.36,1)',
  durFast: 160, durMed: 320, durSlow: 800,
};

// Glow recipes (web only — RN ignores)
export const glow = {
  cyan:   '0 0 0 1.5px #2bffcc, 0 0 22px rgba(43,255,204,.45), inset 0 0 18px rgba(43,255,204,.08)',
  rose:   '0 0 0 1.5px #ff3d9a, 0 0 22px rgba(255,61,154,.45), inset 0 0 18px rgba(255,61,154,.08)',
  amber:  '0 0 0 1.5px #ff6a2b, 0 0 22px rgba(255,106,43,.55), inset 0 0 18px rgba(255,106,43,.10)',
  gold:   '0 0 0 1.5px #ffd93d, 0 0 22px rgba(255,217,61,.45), inset 0 0 18px rgba(255,217,61,.08)',
  purple: '0 0 0 1.5px #9b5bff, 0 0 22px rgba(155,91,255,.45), inset 0 0 18px rgba(155,91,255,.08)',
};

// Bundled default export
export const theme = {
  colors, temperature, channels, typography, spacing, radius,
  slatecard, signalbar, motion, glow,
};
export default theme;
