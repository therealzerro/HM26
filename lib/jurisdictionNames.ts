/**
 * jurisdictionNames — the full display name for a jurisdiction code as it is
 * stored in `histories.jurisdiction` / `adaptive_tracking.matched_state`.
 *
 * MKT-86 (2026-10-15): the verify reel's STRAIGHT MATCH stamp names the state
 * in full ("STRAIGHT MATCH · WISCONSIN"), so the code needs a name. The
 * ledger parser keeps a private name→code map for the other direction
 * (lib/parseLedger.ts STATE_MAP); this is the code→name side, kept small and
 * explicit. Composite codes follow the house conventions: "ME,NH,VT" is the
 * Tri-State draw, "W.Canada" is Western Canada. An unknown code returns the
 * code itself, so a renderer never prints an empty name.
 */
const NAMES: Record<string, string> = {
  AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', MA: 'Massachusetts',
  MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi',
  NC: 'North Carolina', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', TN: 'Tennessee', TX: 'Texas',
  VA: 'Virginia', VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia',
  ON: 'Ontario', QC: 'Quebec', BC: 'British Columbia', AB: 'Alberta',
  WC: 'Western Canada', 'W.CANADA': 'Western Canada', 'ME,NH,VT': 'Tri-State',
};

/** Full name for a jurisdiction code; the code itself when unknown. */
export function jurisdictionName(code: string): string {
  const k = (code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return NAMES[k] ?? code;
}

/** Upper-case display form for stamps and board badges ("TRI-STATE"). */
export function jurisdictionNameUpper(code: string): string {
  return jurisdictionName(code).toUpperCase();
}
