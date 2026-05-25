#!/usr/bin/env tsx
/**
 * import_tx_raw.ts — CLI importer for TX Pick 3 raw draws (ARCH-06 step 3).
 *
 * Reads a paste/file of tab-separated TX draws, calls the shared parser
 * (lib/zk30/parseTxRaw.ts), batched-inserts valid rows into histories_tx
 * with idempotent on_conflict=(date_et,session), and logs the run to
 * audit_logs.
 *
 * Usage:
 *   tsx scripts/imports/import_tx_raw.ts <path/to/file.txt>
 *   ./scripts/imports/import_tx_raw.ts <path/to/file.txt>   # via shebang
 *
 * Credentials:
 *   Loaded from .env.backtest (service-role key, NEVER bundled into app).
 *   .env.backtest is gitignored. Service-role bypasses RLS.
 *
 * Idempotency contract:
 *   on_conflict=date_et,session + resolution=ignore-duplicates → re-running
 *   the same paste skips existing rows silently. Corrections to
 *   result_digits / fireball after the first insert must go through PATCH
 *   (see ARCH-06 step 3a.0 in MASTER_AUDIT.md).
 *
 * Exit codes:
 *   0  success (some/all rows inserted or skipped as dupes)
 *   1  config error (missing env, missing argv, unreadable file)
 *   2  parser produced zero valid records
 *   3  HTTP error during batch insert
 */

import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { parseTxRawText, type TxRawRecord } from '../../lib/zk30/parseTxRaw';

loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = 500;

if (!SUPABASE_URL || !SVC_KEY) {
  console.error(
    '\n[import_tx_raw] Missing credentials.\n' +
    'Copy .env.backtest.example → .env.backtest and fill in:\n' +
    '  SUPABASE_URL=https://<project-ref>.supabase.co\n' +
    '  SUPABASE_SERVICE_ROLE_KEY=<from Supabase Dashboard → Project Settings → API>\n',
  );
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: import_tx_raw.ts <path/to/file.txt>');
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(`[import_tx_raw] Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1`;
const HEADERS_BASE = {
  'apikey': SVC_KEY,
  'Authorization': `Bearer ${SVC_KEY}`,
  'Content-Type': 'application/json',
} as const;

async function insertBatch(records: TxRawRecord[]): Promise<number> {
  const url = `${BASE}/histories_tx?on_conflict=date_et,session`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS_BASE,
      'Prefer': 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(records),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const inserted = (await res.json()) as unknown[];
  return Array.isArray(inserted) ? inserted.length : 0;
}

async function writeAuditLog(summary: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/audit_logs`, {
    method: 'POST',
    headers: {
      ...HEADERS_BASE,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      action: 'import_tx_raw',
      target: 'histories_tx',
      payload_meta: summary,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    console.warn(`[import_tx_raw] audit_logs write failed (non-fatal): HTTP ${res.status} ${body.slice(0, 200)}`);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const { records, rejected } = parseTxRawText(raw);

  console.log(`[import_tx_raw] file:     ${filePath}`);
  console.log(`[import_tx_raw] parsed:   ${records.length} valid, ${rejected.length} rejected`);

  if (rejected.length > 0) {
    const byReason = rejected.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[import_tx_raw] rejected by reason: ${JSON.stringify(byReason)}`);
    const sample = rejected.slice(0, 5);
    for (const r of sample) {
      console.log(`  line ${r.line_number} [${r.reason}]: ${r.raw.slice(0, 100)}`);
    }
    if (rejected.length > 5) console.log(`  ... and ${rejected.length - 5} more`);
  }

  if (records.length === 0) {
    console.error('[import_tx_raw] no valid records — nothing to import');
    process.exit(2);
  }

  let totalInserted = 0;
  let batchesAttempted = 0;
  try {
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      batchesAttempted++;
      const inserted = await insertBatch(batch);
      totalInserted += inserted;
      console.log(`[import_tx_raw] batch ${batchesAttempted}: ${inserted}/${batch.length} new rows (rest were dupes)`);
    }
  } catch (err) {
    console.error(`[import_tx_raw] batch ${batchesAttempted} failed: ${err instanceof Error ? err.message : String(err)}`);
    await writeAuditLog({
      status: 'partial_failure',
      started_at: startedAt,
      file_path: filePath,
      parsed_valid: records.length,
      parsed_rejected: rejected.length,
      batches_attempted: batchesAttempted,
      rows_inserted: totalInserted,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    });
    process.exit(3);
  }

  const skipped = records.length - totalInserted;
  console.log(`[import_tx_raw] done.    ${totalInserted} inserted, ${skipped} skipped (already present)`);

  await writeAuditLog({
    status: 'completed',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    file_path: filePath,
    parsed_valid: records.length,
    parsed_rejected: rejected.length,
    rejected_by_reason: rejected.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {}),
    rows_inserted: totalInserted,
    rows_skipped_as_dupes: skipped,
    batches: batchesAttempted,
  });
}

main().catch((err) => {
  console.error(`[import_tx_raw] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
});
