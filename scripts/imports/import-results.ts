/**
 * import-results.ts — headless daily-results (ledger) importer.
 *
 * Mirrors the app's ledger import path exactly (app/ledger-import.tsx →
 * lib/parseLedger.parseRawLedgerData → useDataIngestion.importLedgerMutation):
 * same parser, same validation, same on_conflict merge-duplicates upsert into
 * `histories`, same imports/audit_logs records, same run-hit-detection trigger
 * per imported date. Exists so multi-day catch-up imports (e.g. post project
 * pause) don't require pasting each day through the app screen.
 *
 * Usage:
 *   npm run import:results -- <file> [<file>...]            # dry-run (parse + report only)
 *   npm run import:results -- <file> [<file>...] --apply    # write to DB
 *   flags: --no-hit-detect   skip run-hit-detection triggers after insert
 *
 * Input files: lottery-post state-header format (STATE NAME line, then
 * Game<TAB>Date<TAB>Result lines) — the same text the app screen accepts.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseRawLedgerData, ParsedLedgerRow } from '../../lib/parseLedger.js';
import { sbPost, sbPatch, invokeFunction } from '../backfill/write.js';

// imports.created_by / audit_logs.actor_id are uuid columns; the app sends
// null when no auth uuid exists (getActorId), so the CLI does the same and
// identifies itself in payload_meta.source instead.
const ACTOR = null;
const BATCH_SIZE = 50; // matches importLedgerMutation

function usage(): never {
  console.error('Usage: npm run import:results -- <file> [<file>...] [--apply] [--no-hit-detect]');
  process.exit(1);
}

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const noHitDetect = argv.includes('--no-hit-detect');
const files = argv.filter((a) => !a.startsWith('--'));
if (files.length === 0) usage();

// ── Parse all files ──────────────────────────────────────────────────────────
// Vertical-format (Game/Date/Result triple-line) normalization now lives inside
// parseRawLedgerData (lib/parseLedger.ts, IMPORT-REHAB-01) — shared with the
// app's import screens, so both accept either lottery-post export shape.

interface FileReport { file: string; rows: ParsedLedgerRow[]; skipped: string[] }

const reports: FileReport[] = files.map((f) => {
  const { rows, skipped } = parseRawLedgerData(readFileSync(f, 'utf8'));
  return { file: basename(f), rows, skipped };
});

// Cross-file dedupe on the histories unique key — the same key the upsert
// merges on, so this only affects the accepted-count arithmetic, not the DB.
const keyOf = (r: ParsedLedgerRow) => `${r.jurisdiction}|${r.game}|${r.date_et}|${r.session}|${r.result_digits}`;
const seen = new Set<string>();
const rows: ParsedLedgerRow[] = [];
let crossFileDupes = 0;
for (const rep of reports) {
  for (const r of rep.rows) {
    // Same validation gate as importLedgerMutation
    if (!r.jurisdiction || !r.game || !r.date_et || !r.session || !/^\d{3}$/.test(r.result_digits)) continue;
    const k = keyOf(r);
    if (seen.has(k)) { crossFileDupes++; continue; }
    seen.add(k);
    rows.push(r);
  }
}

// ── Dry-run report ───────────────────────────────────────────────────────────

const byDateSession = new Map<string, number>();
for (const r of rows) {
  const k = `${r.date_et} ${r.session}`;
  byDateSession.set(k, (byDateSession.get(k) ?? 0) + 1);
}

console.log('── parse report ──────────────────────────────────────────');
for (const rep of reports) {
  console.log(`${rep.file}: ${rep.rows.length} rows parsed, ${rep.skipped.length} lines skipped`);
  for (const s of rep.skipped.slice(0, 5)) console.log(`   skip: ${s}`);
  if (rep.skipped.length > 5) console.log(`   … ${rep.skipped.length - 5} more skips`);
}
if (crossFileDupes > 0) console.log(`cross-file duplicates dropped: ${crossFileDupes}`);
console.log(`total unique rows: ${rows.length}`);
console.log('\ndate        session   rows');
for (const k of [...byDateSession.keys()].sort()) {
  const [d, s] = k.split(' ');
  console.log(`${d}  ${s.padEnd(8)} ${String(byDateSession.get(k)).padStart(4)}`);
}

const dates = [...new Set(rows.map((r) => r.date_et))].sort();
if (dates.length === 0) {
  console.error('\nNo valid rows parsed — nothing to import.');
  process.exit(1);
}
console.log(`\ndate range: ${dates[0]} → ${dates[dates.length - 1]} (${dates.length} days)`);

// Gap check inside the parsed range — a missing day in the middle usually
// means a file didn't copy fully from the source.
const missing: string[] = [];
for (let t = new Date(`${dates[0]}T12:00:00Z`); ; t.setUTCDate(t.getUTCDate() + 1)) {
  const iso = t.toISOString().slice(0, 10);
  if (iso > dates[dates.length - 1]) break;
  if (!dates.includes(iso)) missing.push(iso);
}
if (missing.length > 0) console.log(`⚠ days missing inside range: ${missing.join(', ')}`);

if (!apply) {
  console.log('\nDRY RUN — no writes. Re-run with --apply to import.');
  process.exit(0);
}

// ── Apply ────────────────────────────────────────────────────────────────────

(async () => {
  const importRec = (await sbPost(
    '/imports',
    { type: 'ledger', scope: 'allday', counts: rows.length, status: 'processing', created_by: ACTOR },
    'return=representation',
  )) as Array<{ id: string }> | null;
  const importId = importRec?.[0]?.id;
  if (!importId) throw new Error('imports insert did not return an ID');
  console.log(`\nimports record: ${importId}`);

  let accepted = 0;
  try {
    const payload = rows.map((r) => ({
      jurisdiction: r.jurisdiction,
      game: r.game,
      date_et: r.date_et,
      session: r.session,
      result_digits: r.result_digits,
      comboset_sorted: r.comboset_sorted,
    }));
    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const chunk = payload.slice(i, i + BATCH_SIZE);
      await sbPost(
        '/histories?on_conflict=jurisdiction,game,date_et,session,result_digits',
        chunk,
        'resolution=merge-duplicates,return=minimal',
      );
      accepted += chunk.length;
      process.stdout.write(`\rinserted ${accepted}/${payload.length}`);
    }
    console.log();

    await sbPatch(`/imports?id=eq.${importId}`, { status: 'completed' });
    await sbPost('/audit_logs', {
      actor_id: ACTOR,
      action: 'import_ledger',
      target: 'allday',
      payload_meta: { entryCount: rows.length, accepted, rejected: 0, source: 'import-results.ts', files: files.map((f) => basename(f)) },
    });
  } catch (e) {
    await sbPatch(`/imports?id=eq.${importId}`, { status: 'failed', error_text: String(e).slice(0, 500) }).catch(() => {});
    throw e;
  }

  if (!noHitDetect) {
    for (const date of dates) {
      try {
        const res = await invokeFunction('run-hit-detection', { date });
        console.log(`hit-detection ${date}:`, JSON.stringify(res).slice(0, 200));
      } catch (e) {
        console.warn(`hit-detection ${date} failed (non-fatal — Daily Workflow re-runs it):`, String(e).slice(0, 200));
      }
    }
  } else {
    console.log('hit detection skipped (--no-hit-detect)');
  }

  console.log(`\nDone. ${accepted} rows upserted across ${dates.length} days.`);
  console.log('Reminder: datasets_box/datasets_pair rebuild + slate generation only run via the Daily Workflow button.');
})().catch((e) => {
  console.error('\nIMPORT FAILED:', e);
  process.exit(1);
});
