/**
 * generate-morning-brief-pdf.ts
 *
 * Renders the 2026-06-24 Morning Brief to a styled PDF via Playwright (chromium),
 * matching the HTML→PDF approach of generate-jurisdiction-report.ts.
 *
 * Operator context baked in: bets ALL STATES — jurisdiction is NOT a
 * differentiator (the 30d per-state box rates are near-uniform 7–10%), so
 * per-state recommendations are intentionally omitted; footprint is shown only
 * as a breadth-of-activity evidence signal.
 *
 * Output: assets/morning_brief_2026-06-24.pdf
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATE = '2026-06-24';
const YEST = '2026-06-23';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: letter; margin: 14mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2233; font-size: 11px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.3px; }
  .sub { color: #5b6b86; font-size: 11px; margin: 4px 0 0; }
  .allstates { display:inline-block; margin-top:8px; padding:4px 10px; border-radius:999px; background:#eef4ff; border:1px solid #c3d6ff; color:#1d4ed8; font-weight:700; font-size:10px; letter-spacing:.3px; }
  .sec { margin-top: 18px; }
  .sec h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #0b3a86; border-bottom: 2px solid #0b3a86; padding-bottom: 4px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 4px 7px; border-bottom: 1px solid #e6ebf3; font-size: 10.5px; }
  th { background: #f4f7fc; color: #3a4a64; font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: .5px; }
  .mono { font-family: "SF Mono", "Roboto Mono", Menlo, Consolas, monospace; font-weight: 700; letter-spacing: 1px; }
  .mid { color: #b8860b; } .eve { color: #6d28d9; } .all { color: #0f766e; }
  .pill { display:inline-block; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:700; }
  .hit { background:#dcfce7; color:#15803d; } .miss { background:#fee2e2; color:#b91c1c; } .pass { background:#dbeafe; color:#1d4ed8; }
  .t1 { background:#fff7ed; border-left:3px solid #ea580c; }
  .t2 { background:#f5f3ff; border-left:3px solid #7c3aed; }
  .play { margin-top:6px; padding:10px 12px; border-radius:8px; border:1px solid #c3d6ff; background:#f7faff; }
  .play .combo { font-size:18px; } .play .lbl { font-size:9px; font-weight:800; letter-spacing:1px; color:#1d4ed8; }
  ul.flags { margin:4px 0 0; padding-left:16px; } ul.flags li { margin-bottom:5px; }
  .muted { color:#6b7a93; } .small { font-size:9.5px; }
  .foot { margin-top:16px; padding-top:8px; border-top:1px solid #e6ebf3; color:#8593a8; font-size:9px; }
</style></head><body>

<h1>Morning Brief — ${DATE}</h1>
<p class="sub">HitMaster ZK6 · Daily Intelligence · engine v2.1 · slates regenerated 12:30 UTC on fresh box+pair coverage · calibration refit 13:09 UTC (CALIB-01b)</p>
<div class="allstates">OPERATOR PLAYS ALL STATES — jurisdiction is not a differentiator (30d per-state box rates near-uniform 7–10%)</div>

<div class="sec">
  <h2>1 · Yesterday's Validation (${YEST})</h2>
  <p class="small muted">Source: daily_intelligence (backfilled ${DATE}). "Picks hit" = on-slate picks that matched ≥1 draw; state-instances in parentheses (a pick can hit several states).</p>
  <table>
    <tr><th>Scope</th><th>Slate</th><th>Picks hit</th><th>Hitting combos</th></tr>
    <tr><td class="mid">Midday</td><td><span class="pill miss">MISS</span></td><td>0 / 6</td><td class="muted">—</td></tr>
    <tr><td class="eve">Evening</td><td><span class="pill hit">HIT</span></td><td>2 / 6 <span class="muted">(3 state-inst.)</span></td><td class="mono">146 · 268</td></tr>
    <tr><td class="all">All&nbsp;Day</td><td><span class="pill hit">HIT</span></td><td>2 / 6 <span class="muted">(3 state-inst.)</span></td><td class="mono">689 · 268</td></tr>
  </table>
  <p class="small" style="margin-top:8px"><b>Slate-level rolling rate (faithful, adaptive_tracking):</b></p>
  <table>
    <tr><th>Scope</th><th>7-day</th><th>30-day</th><th>Drift</th></tr>
    <tr><td class="all">All Day</td><td>71% (5/7)</td><td>90% (27/30)</td><td>−19pp</td></tr>
    <tr><td class="eve">Evening</td><td>71% (5/7)</td><td>67% (20/30)</td><td>+5pp ▲</td></tr>
    <tr><td class="mid">Midday</td><td>57% (4/7)</td><td>73% (22/30)</td><td>−16pp</td></tr>
  </table>
  <p class="small muted" style="margin-top:6px">The allday/midday 7d dip is an artifact: 6/19 + 6/21 fall in the window and were rotation-regenerated to 0 hits (the regen dropped the combos that had actually hit). Not a live decline. Evening trending up.</p>
</div>

<div class="sec">
  <h2>2 · Today's Slates — Pre-Flight</h2>
  <table>
    <tr><th>Scope</th><th>Status</th><th>Pick #1</th><th>Tag</th><th>Straight</th></tr>
    <tr><td class="mid">Midday</td><td><span class="pill pass">PASS</span></td><td class="mono">137</td><td>overdue</td><td class="mono">137</td></tr>
    <tr><td class="eve">Evening</td><td><span class="pill pass">PASS</span></td><td class="mono">059</td><td>overdue</td><td class="mono">905</td></tr>
    <tr><td class="all">All Day</td><td><span class="pill pass">PASS</span></td><td class="mono">049</td><td>overdue</td><td class="mono">409</td></tr>
  </table>
  <p class="small muted">3/3 scopes clean · 6 picks each · built on freshly re-imported coverage.</p>
</div>

<div class="sec">
  <h2>3 · Strategic Picks (Tier-Ranked) — box, all states</h2>
  <p class="small muted">90d = box appearances across the active jurisdiction pool (breadth signal only — not a where-to-bet directive). calib = CALIB-01 modelled P(box hit ≥1 in scope today).</p>
  <table>
    <tr><th>Tier</th><th>Combo</th><th>Slate slot(s)</th><th>90d</th><th>Calibrated P(hit)</th></tr>
    <tr class="t1"><td><b>T1 · Standout×Conv</b></td><td class="mono">059</td><td>eve #1 · allday #5</td><td><b>10</b></td><td>allday <b>14.7%</b> · eve 8.8%</td></tr>
    <tr class="t1"><td><b>T1 · Standout×Conv</b></td><td class="mono">047</td><td>eve #5 · midday #5</td><td><b>10</b></td><td>eve 6.5% · mid 2.2%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">236</td><td>midday #6</td><td><b>19</b> ◀ top</td><td>3.1%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">458</td><td>allday #4</td><td>15</td><td>10.3%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">016</td><td>allday #6</td><td>12</td><td>10.3%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">235</td><td>midday #2</td><td>12</td><td>2.5%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">347</td><td>eve #4</td><td>11</td><td>8.5%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">145</td><td>allday #2</td><td>10</td><td>7.5%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">489</td><td>eve #3</td><td>10</td><td>8.1%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">239</td><td>midday #3</td><td>10</td><td>1.5%</td></tr>
    <tr class="t2"><td><b>T2 · Convergence</b></td><td class="mono">049</td><td>allday #1 · eve #2</td><td>6</td><td>allday <b>16.1%</b> ◀ top model</td></tr>
    <tr class="t2"><td>T2 · Convergence</td><td class="mono">358</td><td>eve #6 · midday #4</td><td>6</td><td>mid 4.8% · eve 3.3%</td></tr>
    <tr class="t2"><td>T2 · Overdue</td><td class="mono">137</td><td>midday #1</td><td>6</td><td>3.3%</td></tr>
  </table>
</div>

<div class="sec">
  <h2>4 · Recommended Play — your style (1–2 combos · max bet · all states · ride ≤3d)</h2>
  <div class="play">
    <span class="lbl">PRIMARY</span> &nbsp; <span class="combo mono">0&nbsp;5&nbsp;9</span> &nbsp; box (all states) + straight <span class="mono">905</span> (eve) / <span class="mono">509</span> (allday)<br>
    <span class="small muted">Only pick that is T1 footprint (10) AND cross-scope convergence (eve+allday) AND high model prob (allday 14.7%). Strongest all-around evidence today.</span>
  </div>
  <div class="play" style="margin-top:8px">
    <span class="lbl">SECONDARY</span> &nbsp; <span class="combo mono">0&nbsp;4&nbsp;9</span> &nbsp; box (all states) + straight <span class="mono">409</span><br>
    <span class="small muted">Highest calibrated probability today (allday 16.1%) and an allday+evening convergence pick. Shares 0/9 with the primary — overlapping coverage if you prefer a single ticket.</span>
  </div>
  <p class="small" style="margin-top:8px"><b>Lean all-day</b> — strongest scope (30d 90%) and holds both top picks. If trimming to one, skip midday (weakest today).</p>
</div>

<div class="sec">
  <h2>5 · Red Flags &amp; Notes</h2>
  <ul class="flags small">
    <li><b>Calibration refit today</b> (CALIB-01b, 2026-06-24 — gate passed: test Brier 0.03775 ≤ 0.03846). Top-bucket over-prediction now mild (11.1%→9.5%, was 17.7%→12.2%) — read 16.1% / 14.7% as ~14% / 13% real. Next refit ~7/8.</li>
    <li><b>Midday is structurally weak today</b>: calibrated P(hit) 1.5–4.8% (vs allday up to 16.1%). Pick #1 <span class="mono">137</span> is overdue/modest footprint while the 19-footprint <span class="mono">236</span> sits at slate #6 — the known rank-inversion / popularity-ceiling pattern, not an import regression.</li>
    <li><b>Evening 7d (71%)</b> trips the runbook's &lt;75% CONFIG-15 trigger by the letter — but evening is UP vs 30d (+5pp), so no revert recommended.</li>
    <li><b>6/23 engine_daily_report still shows 0 hits</b> (it ran before today's DI backfill). The DI-based counts above are authoritative; report row refreshes on the next report run.</li>
    <li><b>House edge:</b> at uniform ~90% RTP every bet carries ~−10% EV (BUG-162). These picks maximize hit probability, not positive EV.</li>
  </ul>
</div>

<p class="foot">Why all-states is the right call: 30d per-jurisdiction box-hit rates are near-uniform — DC 10.0%, TX 8.7%, KY/CT/CO/DE/VA/OH/WI 8.3%, SC 7.1%. No single state carries an exploitable edge, so spreading across all states maximizes coverage of each combo's draws. · Generated ${DATE} from live Supabase (slate_snapshots · daily_intelligence · adaptive_tracking · histories · app_config.pick_prob_calibration).</p>

</body></html>`;

(async () => {
  const outDir = join(process.cwd(), 'assets');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `morning_brief_${DATE}.pdf`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({ path: outPath, format: 'Letter', printBackground: true,
    margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' } });
  await browser.close();
  console.log('Wrote ' + outPath);
})().catch(e => { console.error(e); process.exit(1); });
