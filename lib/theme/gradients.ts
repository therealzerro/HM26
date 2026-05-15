/**
 * Mode-aware gradient tokens.
 *
 * Dark gradients use neon signal hues (cyanPurple, purpleRose, etc.) that
 * pop on a black page. On a white page those gradients read as harsh and
 * fight the rest of the UI.
 *
 * Light gradients are softened toward pastel/translucent versions of the
 * same hue pairings so direction/channel mapping is preserved.
 */

export const darkGradients = {
  purpleRose:  ['#9b5bff', '#ff3d9a'] as [string, string],
  cyanPurple:  ['#2bffcc', '#9b5bff'] as [string, string],
  goldAmber:   ['#ffd93d', '#ff6a2b'] as [string, string],
  header:      ['#120a1f', '#0a0613'] as [string, string],
  hotEnergy:   ['#ff3b30', '#ff6a2b'] as [string, string],
  warmEnergy:  ['#ff6a2b', '#ffd93d'] as [string, string],
  mildEnergy:  ['#ffd93d', '#2bffcc'] as [string, string],
  coolEnergy:  ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.08)'] as [string, string],
} as const;

export type GradientTokens = { [K in keyof typeof darkGradients]: [string, string] };

// Light gradients use the deepened signal hues but at low alpha so they
// behave as soft tints on a white card rather than full saturated fills.
export const lightGradients: GradientTokens = {
  purpleRose:  ['rgba(122,63,214,0.12)', 'rgba(204,30,114,0.10)'],
  cyanPurple:  ['rgba(14,159,122,0.12)', 'rgba(122,63,214,0.10)'],
  goldAmber:   ['rgba(182,141,0,0.14)',  'rgba(204,80,30,0.12)'],
  header:      ['#ffffff', '#f7f5fb'],
  hotEnergy:   ['rgba(209,45,36,0.14)',  'rgba(204,80,30,0.12)'],
  warmEnergy:  ['rgba(204,80,30,0.14)',  'rgba(182,141,0,0.12)'],
  mildEnergy:  ['rgba(182,141,0,0.12)',  'rgba(14,159,122,0.12)'],
  coolEnergy:  ['rgba(20,12,38,0.04)',   'rgba(20,12,38,0.02)'],
};

type AssertSameKeys<A, B extends Record<keyof A, unknown>> = B;
type _CheckGradientKeys = AssertSameKeys<typeof darkGradients, typeof lightGradients>;
