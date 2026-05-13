import { theme } from '@/constants/theme';

/**
 * Returns the scope-specific accent color (enhancements §8.5).
 * Subtle visual identity: midday=warm gold (sun), evening=cool purple (moon),
 * allday=cyan (neutral default — also the engine's trust signal color).
 *
 * Use as a tint for active states, not for engine semantics. Energy
 * coloring (hot/warm/mild/cold), signal colors (BOX/PBURST/CO/DGC), and
 * hit color (gold/cyan for straight/box) all stay scope-agnostic.
 */
export function scopeAccent(scope: string | undefined): string {
  switch ((scope ?? '').toLowerCase()) {
    case 'midday':  return theme.colors.gold;
    case 'evening': return theme.colors.purple;
    case 'allday':  return theme.colors.cyan;
    default:        return theme.colors.cyan;
  }
}
