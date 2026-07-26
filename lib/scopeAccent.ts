import type { ColorTokens } from '@/lib/theme';

/**
 * Returns the scope-specific accent color (enhancements §8.5).
 * Subtle visual identity: midday=warm gold (sun), evening=cool purple (moon),
 * allday=cyan (neutral default — also the engine's trust signal color).
 *
 * Use as a tint for active states, not for engine semantics. Energy
 * coloring (hot/warm/mild/cold), signal colors (BOX/PBURST/CO/DGC), and
 * hit color (gold/cyan for straight/box) all stay scope-agnostic.
 *
 * Mode-aware (LIGHT-01): takes the palette from useTheme() like heatTier —
 * this was the last consumer read of the dark singleton, which leaked neon
 * dark hues into light mode on every scope tint.
 */
export function scopeAccent(scope: string | undefined, colors: ColorTokens): string {
  switch ((scope ?? '').toLowerCase()) {
    case 'midday':  return colors.gold;
    case 'evening': return colors.purple;
    case 'allday':  return colors.cyan;
    default:        return colors.cyan;
  }
}
