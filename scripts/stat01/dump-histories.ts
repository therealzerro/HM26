// STAT-01 DUE-01 input: a frozen snapshot of the draw store from the multi-state
// ledger start (2026-04-09) to the study end (2026-09-19). The permutation test
// (Phase 3 primary) reads ONLY ledger.csv; DUE-01 needs draws-since as-of each
// date, which requires draws before the first board date (left-censored at 4/9,
// exactly as the engine's were after DATA-01). Same REST path as build-ledger.ts.
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import 'dotenv/config';
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
if (!URL || !KEY) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env');
const START = '2026-04-09', END = '2026-09-19';
interface H { id: string; jurisdiction: string; game: string; date_et: string; session: string; result_digits: string; comboset_sorted: string; imported_at: string }
async function main() {
  const out: H[] = []; const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${URL}/rest/v1/histories?date_et=gte.${START}&date_et=lte.${END}&select=id,jurisdiction,game,date_et,session,result_digits,comboset_sorted,imported_at&order=id.asc&limit=${PAGE}&offset=${offset}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = (await res.json()) as H[]; out.push(...rows); if (rows.length < PAGE) break;
  }
  out.sort((a, b) => a.date_et.localeCompare(b.date_et) || a.session.localeCompare(b.session) || a.jurisdiction.localeCompare(b.jurisdiction) || a.result_digits.localeCompare(b.result_digits) || a.id.localeCompare(b.id));
  const csv = ['id,jurisdiction,game,date_et,session,result_digits,comboset_sorted,imported_at', ...out.map(r => [r.id, r.jurisdiction, r.game, r.date_et, r.session, r.result_digits, r.comboset_sorted, r.imported_at].map(v => /[,"]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : (v ?? '')).join(','))].join('\n') + '\n';
  const path = 'docs/stat01/histories_snapshot.csv';
  writeFileSync(path, csv);
  const sha = createHash('sha256').update(csv).digest('hex');
  console.log(JSON.stringify({ path, rows: out.length, start: START, end: END, sha256: sha, dates: new Set(out.map(r => r.date_et)).size, jurisdictions: new Set(out.map(r => r.jurisdiction)).size }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
