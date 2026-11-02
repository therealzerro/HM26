import { dbGet } from '../../backtest/data.js';
import { writeFileSync } from 'fs';
type R = { id: string; date_et: string; session: string; jurisdiction: string; result_digits: string; comboset_sorted: string };
async function main() {
  const out: string[] = ['id,date_et,session,jurisdiction,result_digits,comboset_sorted'];
  let lastId = '';
  for (;;) {
    const q = `/histories?select=id,date_et,session,jurisdiction,result_digits,comboset_sorted&jurisdiction=not.is.null&date_et=gte.2026-03-01&date_et=lte.2026-10-31&order=id.asc&limit=1000` + (lastId ? `&id=gt.${lastId}` : '');
    const rows = await dbGet<R[]>(q);
    if (!rows.length) break;
    for (const r of rows) out.push([r.id, r.date_et, r.session, JSON.stringify(r.jurisdiction), r.result_digits, JSON.stringify(r.comboset_sorted)].join(','));
    lastId = rows[rows.length - 1].id;
    if (rows.length < 1000) break;
  }
  writeFileSync(process.argv[2], out.join('\n') + '\n');
  console.log('rows', out.length - 1);
}
main().catch(e => { console.error(e); process.exit(1); });
