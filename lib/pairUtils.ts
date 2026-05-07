/**
 * Utility functions for handling pair-based logic in ZK6 analysis.
 */

/**
 * Returns the front, back, and split pairs for a 3-digit combo.
 * Given "123", returns { front: "12", back: "23", split: "13" }.
 */
export function getPairs(combo: string): { front: string; back: string; split: string } {
  if (combo.length !== 3) {
    return { front: "", back: "", split: "" };
  }
  return {
    front: combo[0] + combo[1],
    back: combo[1] + combo[2],
    split: combo[0] + combo[2],
  };
}

/**
 * Normalizes a pair key to a consistent format (e.g., handles "12" or "21").
 * Currently returns the input sorted digits.
 */
export function normalizePairKey(key: string): string {
  if (!key) return "";
  return key.split('').sort().join('');
}
