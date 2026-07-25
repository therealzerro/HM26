/**
 * Public surface for the theme system.
 *
 * Most consumers want:
 *   import { useTheme } from '@/lib/theme';
 *   const { colors } = useTheme();
 *
 * For setting up the provider (root layout only):
 *   import { ThemeProvider } from '@/lib/theme';
 *
 * Spacing/typography/borderRadius/etc. live on the legacy `theme` singleton
 * in `@/constants/theme` — they don't vary by mode, so we don't duplicate them.
 */

export { ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeMode, ResolvedScheme } from './ThemeProvider';
export { darkColors, lightColors } from './palettes';
export type { ColorTokens } from './palettes';
export { darkShadows, lightShadows } from './shadows';
export type { ShadowTokens } from './shadows';
export { darkGradients, lightGradients } from './gradients';
export type { GradientTokens } from './gradients';
export { heatTier, heatColor, heatLabel } from './heat';
export type { HeatTier, HeatTierKey } from './heat';
