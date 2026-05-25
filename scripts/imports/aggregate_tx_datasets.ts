#!/usr/bin/env tsx
/**
 * aggregate_tx_datasets.ts — Aggregate histories_tx → datasets_box + datasets_pair
 * for ZK30 (ARCH-06 step 3b).
 *
 * Reads all TX draws, anchors at the most recent date (or --anchor arg),
 * computes the box (class_id=1) and pair (class_id 2..11) row arrays for
 * BOTH H01Y and H02Y horizons via the pure aggregator, then full-rebuilds
 * the TX rows in datasets_box / datasets_pair via DELETE-then-INSERT.
 *
 * Usage:
 *   tsx scripts/imports/aggregate_tx_datasets.ts                # dry-run
 *   tsx scripts/imports/aggregate_tx_datasets.ts --apply        # WRITE
 *   tsx scripts/imports/aggregate_tx_datasets.ts --anchor 2026-05-25 --apply
 *
 * Credentials: .env.backtest (service-role, NEVER bundled into app).
 *
 * Write pattern: full-delete TX rows under (jurisdiction='TX', scope='allday')
 * across BOTH horizons, then batched 500-row INSERTs. There is a brief
 * window where TX datasets are empty. Acceptable for v1.0 backfill (engine
 * not reading yet); revisit with swap-via-temp-table for v1.1 nightly rebuilds.
 *
 * Always operates on BOTH H01Y and H02Y — per-horizon partial rebuilds
 * are intentionally not supported to avoid the "delete all, re-insert one,
 * lose the other" footgun.
 *
 * Exit codes:
 *   0  success (counts written, validation OK)
 *   1  config error (missing env, bad anchor, unreadable args)
 *   2  no histories_tx rows to aggregate
 *   3  HTTP error during DELETE/INSERT
 */

import { config as loadEnv } from 'dotenv';
import {
  aggregateForHorizon,
  type TxDraw,
  type BoxRow,
  type PairRow,
} from '../../lib/zk30/aggregateTxDatasets';
import { ZK30_HORIZONS, ZK30_AUDIT_ACTIONS } from '../../constants/zk30';

loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGE = 1000;
const BATCH_SIZE = 500;

if (!SUPABASE_URL || !SVC_KEY) {
  console.error(
    '\n[aggregate_tx] Missing credentials.\n' +
    'Copy .env.backtest.example → .env.backtest and fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n',
  );
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1`;
const HDR_BASE = {
  apikey: SVC_KEY,
  Authorization: `Bearer ${SVC_KEY}`,
  'Content-Type': 'application/json',
} as const;

function parseArgs(argv: string[]): { anchor?: string; apply: boolean } {
  const args: { anchor?: string; apply: boolean } = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--anchor') args.anchor = argv[++i];
    else if (a === '--dry-run') args.apply = false;
    else {
      console.error(`[aggregate_tx] Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// BUG-153 pattern: paginate, never trust a single GET to return everything.
async function fetchAllHistoriesTx(): Promise<TxDraw[]> {
  const rows: TxDraw[] = [];
  let from = 0;
  while (true) {
    const url = `${BASE}/histories_tx?select=date_et,session,result_digits,fireball&order=date_et.asc&limit=${PAGE}&offset=${from}`;
    const res = await fetch(url, { headers: HDR_BASE });
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`HTTP ${res.status} on GET histories_tx: ${body.slice(0, 300)}`);
    }
    const chunk = (await res.json()) as TxDraw[];
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function deleteAllTxDatasets(): Promise<void> {
  for (const table of ['datasets_box', 'datasets_pair']) {
    const url = `${BASE}/${table}?jurisdiction=eq.TX&scope=eq.allday`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...HDR_BASE, Prefer: 'return=minimal' },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new Error(`HTTP ${res.status} on DELETE ${table} TX/allday: ${body.slice(0, 300)}`);
    }
    console.log(`[aggregate_tx] deleted from ${table} where jurisdiction='TX' AND scope='allday'`);
  }
}

async function insertBatch(table: string, rows: object[]): Promise<void> {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: { ...HDR_BASE, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`HTTP ${res.status} on INSERT ${table} (${rows.length} rows): ${body.slice(0, 400)}`);
  }
}

async function insertAll(table: string, rows: object[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await insertBatch(table, batch);
    written += batch.length;
  }
  return written;
}

async function writeAuditLog(payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/audit_logs`, {
    method: 'POST',
    headers: { ...HDR_BASE, Prefer: 'return=minimal' },
    body: JSON.stringify({
      action: ZK30_AUDIT_ACTIONS.AGGREGATE_TX_DATASETS,
      target: 'datasets_box,datasets_pair',
      payload_meta: payload,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    console.warn(`[aggregate_tx] audit_logs POST failed (non-fatal): HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  console.log(`[aggregate_tx] mode: ${args.apply ? 'APPLY (will write)' : 'DRY-RUN'}`);

  const draws = await fetchAllHistoriesTx();
  console.log(`[aggregate_tx] fetched ${draws.length} rows from histories_tx`);
  if (draws.length === 0) {
    console.error('[aggregate_tx] no histories_tx rows — nothing to aggregate');
    process.exit(2);
  }

  const anchor = args.anchor ?? draws.reduce((m, r) => (r.date_et > m ? r.date_et : m), draws[0].date_et);
  console.log(`[aggregate_tx] anchor: ${anchor}`);

  const perHorizon: Array<{
    horizon: string;
    windowStart: string;
    windowDraws: number;
    boxRows: BoxRow[];
    pairRows: PairRow[];
    boxNonZero: number;
    pairNonZero: number;
  }> = [];

  for (const h of ZK30_HORIZONS) {
    const r = aggregateForHorizon(draws, anchor, h);
    const boxNonZero = r.boxRows.filter(b => b.times_drawn > 0).length;
    const pairNonZero = r.pairRows.filter(p => p.times_drawn > 0).length;
    console.log(
      `[aggregate_tx] ${h}: window ${r.windowStart} → ${anchor}, ` +
      `${r.windowDraws} draws, ${r.boxRows.length} box (${boxNonZero} non-zero), ` +
      `${r.pairRows.length} pair (${pairNonZero} non-zero)`,
    );
    perHorizon.push({
      horizon: h,
      windowStart: r.windowStart,
      windowDraws: r.windowDraws,
      boxRows: r.boxRows,
      pairRows: r.pairRows,
      boxNonZero,
      pairNonZero,
    });
  }

  if (!args.apply) {
    console.log('[aggregate_tx] dry-run complete — pass --apply to write');
    return;
  }

  try {
    await deleteAllTxDatasets();

    let boxWritten = 0;
    let pairWritten = 0;
    for (const ph of perHorizon) {
      const bw = await insertAll('datasets_box', ph.boxRows);
      const pw = await insertAll('datasets_pair', ph.pairRows);
      console.log(`[aggregate_tx] ${ph.horizon}: inserted ${bw} box + ${pw} pair`);
      boxWritten += bw;
      pairWritten += pw;
    }

    console.log(`[aggregate_tx] done. ${boxWritten} box rows + ${pairWritten} pair rows written.`);

    await writeAuditLog({
      status: 'completed',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      anchor,
      horizons: perHorizon.map(ph => ({
        horizon: ph.horizon,
        window_start: ph.windowStart,
        window_draws: ph.windowDraws,
        box_total: ph.boxRows.length,
        box_non_zero: ph.boxNonZero,
        pair_total: ph.pairRows.length,
        pair_non_zero: ph.pairNonZero,
      })),
      box_rows_written: boxWritten,
      pair_rows_written: pairWritten,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[aggregate_tx] write failure: ${msg}`);
    await writeAuditLog({
      status: 'write_failure',
      started_at: startedAt,
      anchor,
      error: msg.slice(0, 500),
    });
    process.exit(3);
  }
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[aggregate_tx] fatal: ${msg}`);
  process.exit(3);
});
