// lib/zk30/labelMaps.ts
//
// Operator-vs-subscriber label translation tables. Phase C1 of the ZK30 UI
// Evolution work order: ZK30 surfaces should read approachably for subscribers
// (the majority) while preserving the jargon admins/operators use to debug.
//
// Why static maps instead of an i18n framework:
//   • 3 strings × 2 modes is too small for i18n's overhead.
//   • Operator strings ARE the engine's internal terms — keeping them static
//     avoids translation drift when the engine's vocab evolves (the operator
//     side has to stay accurate or admin debugging breaks).
//   • Subscriber labels are tuned for clarity, not literal translation —
//     "RHYTHM" is a deliberate metaphor for DGC, not a translation of "draw
//     gap consistency".

export type ViewMode = 'operator' | 'subscriber';

/** Signal-channel labels — the 4 columns rendered on SignalBar in PickCard
 *  + PickDetailModal. Subscriber values are the marketing-friendly framing.
 *  Operator values match engineCore.ts / engines/zk30.ts internal naming. */
export const SIGNAL_LABELS: Record<ViewMode, Record<string, string>> = {
  operator: {
    BOX:    'BOX',
    PBURST: 'PBURST',
    CO:     'CO',
    DGC:    'DGC',
  },
  subscriber: {
    BOX:    'FREQUENCY',
    PBURST: 'PAIR HEAT',
    CO:     'CONSISTENCY',
    DGC:    'RHYTHM',
  },
};

/** Energy-tier labels — the 4 tiers returned by components/zk30/types.ts::
 *  energyTier. Subscriber framing leans into the value framing (TOP PICK)
 *  rather than the heat metaphor. */
export const ENERGY_LABELS: Record<ViewMode, Record<string, string>> = {
  operator: {
    ON_FIRE:  'ON FIRE',
    HOT:      'HOT',
    BUILDING: 'BUILDING',
    COLD:     'COLD',
  },
  subscriber: {
    ON_FIRE:  'TOP PICK',
    HOT:      'STRONG',
    BUILDING: 'OVERDUE',
    COLD:     'RECENT HIT',
  },
};

/** Pressure-label phrasing (the "Fresh Xd"/"Building Xd" text on PickCard
 *  rows). Subscriber framing uses plain-English time framing. */
export const FRESHNESS_PHRASES: Record<ViewMode, {
  fresh: (days: number) => string;
  building: (days: number) => string;
  overdue: (days: number) => string;
}> = {
  operator: {
    fresh:    d => `Fresh ${d}d`,
    building: d => `Building ${d}d`,
    overdue:  d => `Overdue ${d}d`,
  },
  subscriber: {
    fresh:    d => `Hit ${d} days ago`,
    building: d => `${d} days since last hit`,
    overdue:  d => `Overdue ${d} days`,
  },
};

/** Maps the energy-tier label (as returned by energyTier()) → its
 *  enum key so we can look up the translation by label or by key. */
export const ENERGY_LABEL_TO_KEY: Record<string, keyof typeof ENERGY_LABELS['operator']> = {
  'ON FIRE':  'ON_FIRE',
  'HOT':      'HOT',
  'BUILDING': 'BUILDING',
  'COLD':     'COLD',
};
