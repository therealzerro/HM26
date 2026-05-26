// lib/theme/zk30Theme.ts
//
// ZK30-specific color palette. Centralizes hex literals previously scattered
// across app/(tabs)/zk30.tsx, components/zk30/*, lib/zk30/svg/TexasOutline.
//
// The TX accent (`accentTX`) is the focal color for Texas-specific UI:
//   • lone star glyph in the masthead
//   • "TX-only" tag on the fireball sub-band in HitsTimelineView
//   • fireball badge edges + tile fireball corner (when we want louder)
//
// Future jurisdictions (SC/OH/NJ/NY/FL in v2.0) should add their own
// {jurisdiction}Theme.ts module with the matching state-flag accent.

export const ZK30_THEME = {
  // Brand blues — the existing sky-palette used since v1.0.
  primary:      '#0ea5e9',   // sky-500
  primaryDark:  '#0284c7',   // sky-600
  primaryLight: '#bae6fd',   // sky-200
  primaryBg:    '#0c1929',   // dark blue panel canvas

  // Texas accent — TX flag red (Pantone 193 C-ish). Used sparingly for
  // jurisdiction-flavor moments; never for warnings or errors so it doesn't
  // collide with the global `colors.error` token.
  accentTX:     '#bf0a30',

  // Energy tier colors (Phase B1 single-source-of-truth — these mirror the
  // hex values in components/zk30/types.ts::energyTier).
  energyOnFire:   '#ff4444',
  energyHot:      '#ff8800',
  energyBuilding: '#ffaa00',
  energyCold:     '#64748b',

  // Signal channel accents. Currently the only consumer is the
  // soon-to-be subscriber-mode SignalBar palette — operator mode keeps the
  // existing global theme.colors mapping (cyan/rose/blue/gold).
  signalBox:    '#10b981',   // emerald — frequency
  signalPburst: '#ec4899',   // pink    — pair heat
  signalCo:     '#3b82f6',   // blue    — consistency
  signalDgc:    '#eab308',   // yellow  — rhythm
} as const;

export type ZK30ThemeColor = keyof typeof ZK30_THEME;
