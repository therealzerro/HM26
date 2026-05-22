/**
 * diff.ts — field-level deep equality between live and edge captures.
 *
 * Excludes fields that legitimately differ (timestamps, UUIDs, source marker).
 * Floating-point comparison uses 1e-9 tolerance — engineCore math is IEEE-754
 * deterministic but cross-runtime FP rounding can produce sub-ULP noise.
 */

import type { Capture } from './capture.js';

const EPS = 1e-9;

// Fields excluded from row-level diff (per table), as paths relative to the row root.
// Top-level keys are bare ('id'); nested keys use dot-notation ('parent.child').
// Maps table → set of relative paths.
const EXCLUDE: Record<string, Set<string>> = {
  slate_snapshots: new Set([
    'id', 'created_at', 'updated_at_et', 'deleted_at',
    'admin_published',                  // both write true
    'horizons_present_json._source',    // by design: 'live' vs 'edge'
  ]),
  daily_intelligence: new Set(['id', 'created_at']),
  adaptive_tracking:  new Set(['id', 'created_at', 'result_at']),
  engine_runs:        new Set([
    'id', 'started_at', 'completed_at',
    'generated_at_utc',                 // DB-side timestamp (probably DEFAULT now())
    'generated_at_et',                  // Engine-written wall-clock; differs by ~2s between sequential invocations
    'source',                           // by design: 'live' vs 'edge'
  ]),
};

// Top-level SlateSnapshot return fields excluded (these differ legitimately
// or are derived runtime metadata).
const SNAPSHOT_EXCLUDE = new Set([
  'id', 'updated_at_et',
  // mode is identical (same weightsKey); engineVersion compared explicitly
  // source is intentionally different ('live' vs 'edge') — see horizons_present_json._source diff handler
]);

// Inside horizons_present_json metadata block, exclude _source (live vs edge).
const HORIZONS_META_EXCLUDE = new Set(['_source']);

export interface Diff {
  path: string;
  live: unknown;
  edge: unknown;
  delta?: number;
}

function numericClose(a: unknown, b: unknown): boolean {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < EPS;
}

function deepDiff(
  live: any, edge: any,
  path: string, relPath: string,
  out: Diff[],
  excludePath?: (relPath: string) => boolean,
): void {
  if (live === edge) return;
  if (live == null || edge == null) {
    if (live !== edge) out.push({ path, live, edge });
    return;
  }
  if (typeof live !== typeof edge) {
    out.push({ path, live, edge });
    return;
  }
  if (numericClose(live, edge)) return;
  if (typeof live !== 'object') {
    if (typeof live === 'number' && typeof edge === 'number') {
      out.push({ path, live, edge, delta: edge - live });
    } else {
      out.push({ path, live, edge });
    }
    return;
  }
  if (Array.isArray(live) || Array.isArray(edge)) {
    if (!Array.isArray(live) || !Array.isArray(edge)) {
      out.push({ path, live, edge });
      return;
    }
    if (live.length !== edge.length) {
      out.push({ path: `${path}.length`, live: live.length, edge: edge.length });
    }
    const minLen = Math.min(live.length, edge.length);
    for (let i = 0; i < minLen; i++) {
      deepDiff(live[i], edge[i], `${path}[${i}]`, relPath ? `${relPath}[${i}]` : `[${i}]`, out, excludePath);
    }
    return;
  }
  const keys = new Set([...Object.keys(live), ...Object.keys(edge)]);
  for (const k of keys) {
    const newRel = relPath ? `${relPath}.${k}` : k;
    if (excludePath && excludePath(newRel)) continue;
    deepDiff(live[k], edge[k], path ? `${path}.${k}` : k, newRel, out, excludePath);
  }
}

/** Diff a single row from a table, applying that table's exclude list (path-based). */
export function diffRow(table: string, live: any, edge: any, identifier: string): Diff[] {
  const skip = EXCLUDE[table] ?? new Set<string>();
  const out: Diff[] = [];
  deepDiff(live, edge, `${table}[${identifier}]`, '', out, (rel) => skip.has(rel));
  return out;
}

/** Diff rows of a table by index (both arrays sorted to a canonical order by caller). */
export function diffRows(table: string, liveRows: any[], edgeRows: any[]): Diff[] {
  const out: Diff[] = [];
  if (liveRows.length !== edgeRows.length) {
    out.push({
      path: `${table}.row_count`, live: liveRows.length, edge: edgeRows.length,
    });
  }
  const minLen = Math.min(liveRows.length, edgeRows.length);
  for (let i = 0; i < minLen; i++) {
    const liveRow = liveRows[i];
    const edgeRow = edgeRows[i];
    const idDesc = liveRow?.rank != null ? `rank=${liveRow.rank}` :
                   liveRow?.combo != null ? `combo=${liveRow.combo}` :
                   `idx=${i}`;
    out.push(...diffRow(table, liveRow, edgeRow, idDesc));
  }
  return out;
}

/** Diff returned SlateSnapshot objects. Handles horizons_present_json nested metadata. */
export function diffSnapshot(live: any, edge: any): Diff[] {
  const out: Diff[] = [];
  const keys = new Set([...Object.keys(live ?? {}), ...Object.keys(edge ?? {})]);
  for (const k of keys) {
    if (SNAPSHOT_EXCLUDE.has(k)) continue;
    if (k === 'horizons_present_json') {
      // Excludes _source (live vs edge); all other metadata must match.
      const lh = live?.[k] ?? {}; const eh = edge?.[k] ?? {};
      const hkeys = new Set([...Object.keys(lh), ...Object.keys(eh)]);
      for (const hk of hkeys) {
        if (HORIZONS_META_EXCLUDE.has(hk)) continue;
        deepDiff(lh[hk], eh[hk], `snapshot.${k}.${hk}`, `${k}.${hk}`, out);
      }
      continue;
    }
    if (k === 'source') continue;  // top-level live/edge marker; not a parity signal
    deepDiff(live?.[k], edge?.[k], `snapshot.${k}`, k, out);
  }
  return out;
}

export function diffCaptures(live: Capture, edge: Capture): {
  snapshotDiffs: Diff[];
  tableDiffs: Record<string, Diff[]>;
} {
  // Snapshot-row diff comparing the most-recent non-deleted row in each.
  const liveActive = live.slate_snapshots.filter(r => !r.deleted_at);
  const edgeActive = edge.slate_snapshots.filter(r => !r.deleted_at);
  return {
    snapshotDiffs: diffRows('slate_snapshots', liveActive, edgeActive),
    tableDiffs: {
      daily_intelligence: diffRows('daily_intelligence', live.daily_intelligence, edge.daily_intelligence),
      adaptive_tracking:  diffRows('adaptive_tracking',  live.adaptive_tracking,  edge.adaptive_tracking),
      engine_runs:        diffRows('engine_runs',        live.engine_runs,        edge.engine_runs),
    },
  };
}
