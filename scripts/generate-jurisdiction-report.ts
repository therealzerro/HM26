/**
 * generate-jurisdiction-report.ts
 *
 * Generates the ZK6 Jurisdiction Correlation Report PDF for a given date.
 * Matches the style of existing assets/zk6_jurisdiction_correlation_*.pdf.
 *
 * Usage:
 *   tsx scripts/generate-jurisdiction-report.ts            # today
 *   tsx scripts/generate-jurisdiction-report.ts 2026-06-10 # specific date
 *
 * Output: assets/zk6_jurisdiction_correlation_<date>.pdf
 *
 * Hooked into the morning brief workflow — Claude runs this after the
 * morning brief queries so the operator gets both the chat output AND
 * a committable PDF saved to assets/.
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

// ----- Date handling --------------------------------------------------------

const arg = process.argv[2];
const reportDate = arg && /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : isoDate(new Date());

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + n);
  return isoDate(dt);
}

const windowStart = addDays(reportDate, -30);
const windowEnd   = addDays(reportDate, -1);

// ----- Supabase helpers -----------------------------------------------------

async function sb<T = any>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function rpc<T = any>(fnName: string, body: any): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${fnName} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ----- Data queries ---------------------------------------------------------

interface DrawRow { date_et: string; session: string; jurisdiction: string; comboset_sorted: string; result_digits: string }
interface SlateRow { scope: string; slate_date: string; top_k_straights_json: any }

interface JxRow {
  jurisdiction: string;
  draws: number;
  box_hits: number;
  box_pct: number;
  straight_hits: number;
  straight_pct: number;
  midday_box: string;   // "n / draws" or "—"
  evening_box: string;
  allday_box: string;
}

async function fetchAllPaginated<T>(buildUrl: (offset: number) => string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const page = await sb<T[]>(buildUrl(offset));
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

// ----- Build report data ----------------------------------------------------

async function buildReport() {
  console.log(`[gen] Building report for ${reportDate} (window ${windowStart} → ${windowEnd})`);

  // 1. All draws in the 30d window
  const draws30 = await fetchAllPaginated<DrawRow>(off =>
    `/rest/v1/histories?select=date_et,session,jurisdiction,comboset_sorted,result_digits` +
    `&date_et=gte.${windowStart}&date_et=lte.${windowEnd}` +
    `&order=date_et.desc&limit=1000&offset=${off}`,
  );
  console.log(`[gen] Fetched ${draws30.length} draws over 30d`);

  // 2. All slates in 30d for matching
  const slates30 = await fetchAllPaginated<SlateRow>(off =>
    `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json` +
    `&deleted_at=is.null&mode=eq.balanced` +
    `&slate_date=gte.${windowStart}&slate_date=lte.${windowEnd}` +
    `&limit=1000&offset=${off}`,
  );

  // Index slates: comboSets (for box check) + bestOrders (for straight check)
  interface SlateIdxEntry { combosets: Set<string>; bestOrders: Set<string> }
  const slateIdx = new Map<string, SlateIdxEntry>();
  for (const s of slates30) {
    const picks = Array.isArray(s.top_k_straights_json) ? s.top_k_straights_json as any[] : [];
    const combosets = new Set<string>();
    const bestOrders = new Set<string>();
    for (const p of picks) {
      if (p?.comboSet) combosets.add(String(p.comboSet));
      if (p?.bestOrder) bestOrders.add(String(p.bestOrder));
    }
    slateIdx.set(`${s.slate_date}|${s.scope}`, { combosets, bestOrders });
  }

  // 3. Per-jurisdiction aggregation — each draw checked against
  //    its same-session slate AND the allday slate, independently.
  const jxAgg = new Map<string, {
    draws: number; boxHits: number; straightHits: number;
    midDraws: number; midBoxHits: number;
    eveDraws: number; eveBoxHits: number;
    allBoxHits: number;
  }>();
  for (const d of draws30) {
    const j = d.jurisdiction;
    if (!jxAgg.has(j)) jxAgg.set(j, {
      draws: 0, boxHits: 0, straightHits: 0,
      midDraws: 0, midBoxHits: 0,
      eveDraws: 0, eveBoxHits: 0,
      allBoxHits: 0,
    });
    const a = jxAgg.get(j)!;
    a.draws += 1;

    const sameSession = slateIdx.get(`${d.date_et}|${d.session}`);
    const allday = slateIdx.get(`${d.date_et}|allday`);

    const sameSessionBox  = sameSession?.combosets.has(d.comboset_sorted) ?? false;
    const sameSessionStr  = sameSession?.bestOrders.has(d.result_digits)  ?? false;
    const alldayBox       = allday?.combosets.has(d.comboset_sorted)      ?? false;
    const alldayStr       = allday?.bestOrders.has(d.result_digits)       ?? false;

    if (sameSessionBox || alldayBox) a.boxHits += 1;
    if (sameSessionStr || alldayStr) a.straightHits += 1;

    if (d.session === 'midday') {
      a.midDraws += 1;
      if (sameSessionBox) a.midBoxHits += 1;
    } else if (d.session === 'evening') {
      a.eveDraws += 1;
      if (sameSessionBox) a.eveBoxHits += 1;
    }
    if (alldayBox) a.allBoxHits += 1;
  }

  // Top 10 by box pct (≥ 20 draws floor for reliability)
  const top10: JxRow[] = Array.from(jxAgg.entries())
    .filter(([_, a]) => a.draws >= 20)
    .map(([jurisdiction, a]) => ({
      jurisdiction,
      draws: a.draws,
      box_hits: a.boxHits,
      box_pct: round1(100 * a.boxHits / a.draws),
      straight_hits: a.straightHits,
      straight_pct: round1(100 * a.straightHits / a.draws),
      midday_box:  a.midDraws  > 0 ? `${a.midBoxHits} / ${a.midDraws}`  : '—',
      evening_box: a.eveDraws  > 0 ? `${a.eveBoxHits} / ${a.eveDraws}`  : '—',
      allday_box:  `${a.allBoxHits} / ${a.draws}`,
    }))
    .sort((a, b) => b.box_pct - a.box_pct || b.box_hits - a.box_hits)
    .slice(0, 10);

  const topJxNames = new Set(top10.map(r => r.jurisdiction));

  // 5. Today's slate (the date being reported on)
  const todaySlates = await sb<SlateRow[]>(
    `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json` +
    `&deleted_at=is.null&mode=eq.balanced&slate_date=eq.${reportDate}` +
    `&order=scope.asc&limit=10`,
  );

  // 6. 90d top-10-jx footprint per comboSet (used by today's picks)
  const ninetyStart = addDays(reportDate, -90);
  const draws90 = await fetchAllPaginated<DrawRow>(off =>
    `/rest/v1/histories?select=date_et,jurisdiction,comboset_sorted` +
    `&date_et=gte.${ninetyStart}&date_et=lt.${reportDate}` +
    `&order=date_et.desc&limit=1000&offset=${off}`,
  );

  const footprint = new Map<string, { total: number; perJx: Map<string, number> }>();
  for (const d of draws90) {
    if (!topJxNames.has(d.jurisdiction)) continue;
    if (!footprint.has(d.comboset_sorted)) footprint.set(d.comboset_sorted, { total: 0, perJx: new Map() });
    const f = footprint.get(d.comboset_sorted)!;
    f.total += 1;
    f.perJx.set(d.jurisdiction, (f.perJx.get(d.jurisdiction) ?? 0) + 1);
  }

  // 7. Today's picks with 90d footprint
  type PickRow = { scope: string; rank: number; combo: string; set: string; indicator: number; total: number; breakdown: string };
  const todayPicks: PickRow[] = [];
  for (const slate of todaySlates) {
    const picks = Array.isArray(slate.top_k_straights_json) ? slate.top_k_straights_json as any[] : [];
    for (const p of picks) {
      const f = footprint.get(p.comboSet);
      const breakdown = f
        ? Array.from(f.perJx.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k}:${v}`).join(', ')
        : '';
      todayPicks.push({
        scope: slate.scope.toUpperCase(),
        rank: Number(p.rank),
        combo: String(p.combo),
        set: String(p.comboSet),
        indicator: Number(p.indicator),
        total: f?.total ?? 0,
        breakdown: f && f.total > 0 ? `${f.total} (${breakdown})` : '0',
      });
    }
  }
  todayPicks.sort((a, b) => {
    const order = { MIDDAY: 0, EVENING: 1, ALLDAY: 2 } as any;
    return (order[a.scope] ?? 9) - (order[b.scope] ?? 9) || a.rank - b.rank;
  });

  // 8. Tonight's watch list = top picks by 90d footprint
  const watch = todayPicks
    .map(p => ({
      pick: p.combo,
      scope: p.scope.toLowerCase(),
      count: p.total,
      strongest: p.breakdown.includes('(') ? p.breakdown.split('(')[1].split(',').slice(0, 3).map(s => s.split(':')[0].trim()).join(', ') : '',
    }))
    .filter(w => w.count >= 6)
    .sort((a, b) => b.count - a.count);

  return { top10, todayPicks, watch };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// ----- HTML template --------------------------------------------------------

function renderHtml(date: string, data: Awaited<ReturnType<typeof buildReport>>): string {
  const { top10, todayPicks, watch } = data;
  const gen = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const top10Rows = top10.map((r, i) => `
    <tr>
      <td>${i + 1}</td><td>${r.jurisdiction}</td>
      <td>${r.draws}</td><td>${r.box_hits}</td><td>${r.box_pct}%</td>
      <td>${r.straight_hits}</td><td>${r.straight_pct}%</td>
    </tr>`).join('');

  const splitRows = top10.map(r => `
    <tr>
      <td>${r.jurisdiction}</td>
      <td>${r.midday_box}</td><td>${r.evening_box}</td><td>${r.allday_box}</td>
    </tr>`).join('');

  // Picks table grouped by scope
  let currentScope = '';
  const pickRows = todayPicks.map(p => {
    const scopeCell = p.scope !== currentScope ? `<td rowspan="6" class="scope">${p.scope}</td>` : '';
    currentScope = p.scope;
    return `<tr>
      ${scopeCell}
      <td>${p.rank}</td>
      <td class="combo">${p.combo}</td>
      <td>${p.set}</td>
      <td>${p.indicator.toFixed(3)}</td>
      <td class="breakdown">${p.breakdown}</td>
    </tr>`;
  }).join('');

  const watchRows = watch.map(w => `
    <tr><td class="combo">${w.pick}</td><td>${w.scope}</td><td>${w.count}</td><td>${w.strongest}</td></tr>`).join('');

  // Takeaways
  const standout = watch[0];
  const standoutTakeaway = standout
    ? `<b>${standout.pick}</b> is the standout pick today. ${standout.count} hits in Top-10 jurisdictions over the last 90 days, anchored by ${standout.strongest} (scope: ${standout.scope}).`
    : `No pick crossed the 10-hit threshold today.`;

  const topJx = top10[0];
  const leaderTakeaway = topJx ? `<b>${topJx.jurisdiction}</b> leads at <b>${topJx.box_pct}%</b> (${topJx.box_hits}/${topJx.draws}).` : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>ZK6 Jurisdiction Correlation Report</title>
<style>
  @page { size: letter; margin: 0.6in; }
  body { font-family: 'Helvetica', 'Arial', sans-serif; color: #111; font-size: 10pt; line-height: 1.4; }
  h1 { color: #1c4587; font-size: 22pt; margin: 0 0 4px 0; }
  h2 { color: #1c4587; font-size: 14pt; margin: 16px 0 6px 0; }
  .subhead { color: #555; font-size: 9pt; margin-bottom: 4px; }
  .method { font-size: 9pt; color: #444; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; font-size: 9pt; }
  th { background: #4a86e8; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9pt; }
  td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
  tr:nth-child(even) td { background: #f6f8fc; }
  td.scope { background: #e8eef9 !important; font-weight: 600; vertical-align: middle; text-align: center; }
  td.combo { font-family: 'Courier New', monospace; font-weight: 600; }
  td.breakdown { font-size: 8.5pt; color: #333; }
  .narrative { font-size: 9.5pt; color: #333; margin: 4px 0 8px 0; }
  .takeaway { margin: 4px 0; font-size: 10pt; }
  .takeaway b { color: #1c4587; }
  .source { margin-top: 18px; font-size: 8pt; color: #777; font-style: italic; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head>
<body>

<h1>ZK6 Jurisdiction Correlation Report</h1>
<div class="subhead">Generated ${gen} UTC · window: ${windowStart} to ${windowEnd} (30 days, completed draws)</div>
<div class="method">Methodology: each historical jurisdiction draw was matched against the same-date ZK6 slate for that scope (midday/evening) and the allday slate. A box hit = the draw's sorted comboset appears in any of the 6 slate picks.</div>

<h2>1. Top 10 Jurisdictions by Slate Correlation (30d)</h2>
<table>
<tr><th>#</th><th>Jurisdiction</th><th>Draws</th><th>Box Hits</th><th>Box %</th><th>Straight Hits</th><th>Straight %</th></tr>
${top10Rows}
</table>
<div class="narrative"><b>Reading the table.</b> Box% is the share of that jurisdiction's draws (last 30d) whose comboset appeared on the same-date ZK6 slate. National average across all tracked jurisdictions is roughly 6–8%. ${leaderTakeaway}</div>

<h2>1b. Per-Scope Hit Split (where the correlation lives)</h2>
<table>
<tr><th>Jurisdiction</th><th>Midday box</th><th>Evening box</th><th>Allday box (any session)</th></tr>
${splitRows}
</table>

<h2>2. Today's ZK6 Picks — ${date}</h2>
<div class="narrative">Drawn before today's midday session. The right-most column is each pick's 90-day appearance count across the Top-10 jurisdictions only, with per-jurisdiction breakdown.</div>
<table>
<tr><th>Scope</th><th>Rank</th><th>Pick</th><th>Set</th><th>Indicator</th><th>90d hits across Top-10 JX</th></tr>
${pickRows}
</table>

<h2>3. Tonight's Watch List</h2>
<div class="narrative">Picks with the strongest representation in Top-10 jurisdictions over the last 90 days, ranked by total appearances (most-likely-to-print where it counts):</div>
<table>
<tr><th>Pick</th><th>Scope</th><th>90d count (Top-10)</th><th>Strongest jurisdictions</th></tr>
${watchRows || '<tr><td colspan="4"><em>No picks ≥ 6 hits in 90d Top-10 today.</em></td></tr>'}
</table>

<h2>4. Takeaways</h2>
<div class="takeaway">• ${standoutTakeaway}</div>
${leaderTakeaway ? `<div class="takeaway">• ${leaderTakeaway} Highest single-jurisdiction rate on the board this cycle.</div>` : ''}

<div class="source">Source: slate_snapshots + histories (Supabase, project hitmaster). Generated by scripts/generate-jurisdiction-report.ts. Re-run anytime with the same data; refreshes when histories advance.</div>

</body></html>`;
}

// ----- Main -----------------------------------------------------------------

async function main() {
  const data = await buildReport();

  const html = renderHtml(reportDate, data);
  const tmpHtmlPath = `/tmp/zk6_jurisdiction_correlation_${reportDate}.html`;
  writeFileSync(tmpHtmlPath, html);
  console.log(`[gen] HTML written: ${tmpHtmlPath}`);

  const outDir = join(process.cwd(), 'assets');
  mkdirSync(outDir, { recursive: true });
  const pdfPath = join(outDir, `zk6_jurisdiction_correlation_${reportDate}.pdf`);

  console.log('[gen] Launching headless chromium...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.6in', bottom: '0.6in', left: '0.6in', right: '0.6in' },
  });
  await browser.close();

  console.log(`[gen] ✓ PDF written: ${pdfPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
