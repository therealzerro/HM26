/**
 * Mode-aware shadow tokens.
 *
 * Dark-mode shadows are colored cosmic glows (`shadowColor` is a signal hue
 * — purple/cyan/rose) at high opacity, designed against dark backgrounds.
 * On a white card, those would read as bizarre colored auras.
 *
 * Light-mode shadows are conventional grey drop-shadows: shadowColor near-
 * black, low opacity, slightly larger radius for softer falloff. Key set
 * matches dark exactly so `theme.shadows.glow` / `useShadows().glow` resolves
 * structurally identical regardless of mode (values differ, not lookups).
 */

import type { ViewStyle } from 'react-native';

type ShadowStyle = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const darkShadows = {
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#9b5bff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  cyan: {
    shadowColor: '#2bffcc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  rose: {
    shadowColor: '#ff3d9a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

export type ShadowTokens = { [K in keyof typeof darkShadows]: ShadowStyle };

// Light-mode shadows: standard grey drop shadows. The "colored glow" shadows
// (glow/cyan/rose) get translated to subtle accent-tinted shadows so a card
// asking for `theme.shadows.cyan` in light mode still hints at the channel
// (a faint tint) without screaming neon.
export const lightShadows: ShadowTokens = {
  soft: {
    shadowColor: 'rgba(20,12,38,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: 'rgba(20,12,38,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  glow: {
    shadowColor: 'rgba(20,12,38,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cyan: {
    shadowColor: '#0e9f7a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  rose: {
    shadowColor: '#cc1e72',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
};

// Compile-time assertion that both shadow sets share the same keys.
type AssertSameKeys<A, B extends Record<keyof A, unknown>> = B;
type _CheckShadowKeys = AssertSameKeys<typeof darkShadows, typeof lightShadows>;
