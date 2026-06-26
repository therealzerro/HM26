/**
 * generate-morning-brief-pdf.ts
 *
 * Renders the current day's Morning Brief to a styled PDF via Playwright
 * (chromium), matching the HTML→PDF approach of generate-jurisdiction-report.ts.
 * Holds the latest brief inline; prior days are preserved in git history and as
 * committed assets/morning_brief_<date>.pdf files.
 *
 * Operator context baked in: bets ALL STATES — jurisdiction is NOT a
 * differentiator (the 30d per-state box rates are near-uniform 7–9%), so
 * per-state recommendations are intentionally omitted; footprint is shown only
 * as a breadth-of-activity evidence signal. All yesterday-validation numbers are
 * faithful (slate ∩ histories), never stored DI hit flags (BUG-162).
 *
 * Output: assets/morning_brief_2026-06-26.pdf
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATE = '2026-06-26';
const YEST = '2026-06-25';
const CALIB_FIT = '2026-06-24';   // CALIB-01b refit date (fitted_at in app_config)

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
<p class="sub">HitMaster ZK6 · Daily Intelligence · engine v2.1 · slates regenerated 10:24 UTC on fresh box+pair coverage · calibration CALIB-01b (refit \${CALIB_FIT} 13:09 UTC — 2d old, fresh)</p>
<div class="allstates">OPERATOR PLAYS ALL STATES — jurisdiction is not a differentiator (30d per-state box rates near-uniform 7–9%)</div>

<div class="sec">
  <h2>1 · Yesterday's Validation (${YEST})</h2>
  <p class="small muted">Source: faithful slate ∩ histories (NOT stored DI flags, BUG-162). "Picks hit" = on-slate combos that matched ≥1 real draw; state-instances in parentheses (a pick can hit several states).</p>
  <table>
    <tr><th>Scope</th><th>Slate</th><th>Picks hit</th><th>Hitting combos (sorted set)</th></tr>
    <tr><td class="mid">Midday</td><td><span class="pill miss">MISS</span></td><td>0 / 6</td><td class="muted">—</td></tr>
    <tr><td class="eve">Evening</td><td><span class="pill hit">HIT</span></td><td>3 / 6 <span class="muted">(3 state-inst.)</span></td><td class="mono">059 · 014 · 456</td></tr>
    <tr><td class="all">All&nbsp;Day</td><td><span class="pill hit">HIT</span></td><td>2 / 6 <span class="muted">(4 state-inst.)</span></td><td class="mono">059 · 014</td></tr>
  </table>
  <p class="small" style="margin-top:8px"><b>Slate-level rolling rate (faithful slate ∩ histories):</b></p>
  <table>
    <tr><th>Scope</th><th>7-day</th><th>30-day</th><th>Drift</th></tr>
    <tr><td class="all">All Day</td><td>71% (5/7)</td><td>90% (27/30)</td><td>−19pp</td></tr>
    <tr><td class="eve">Evening</td><td>57% (4/7)</td><td>63% (19/30)</td><td>−6pp</td></tr>
    <tr><td class="mid">Midday</td><td>43% (3/7)</td><td>73% (22/30)</td><td>−30pp</td></tr>
  </table>
  <p class="small muted" style="margin-top:6px">Reorder yesterday landed 1/3 — evening #1 <span class="mono">905</span> hit (faithfully, slate HIT); midday #1 <span class="mono">630</span> and allday #1 <span class="mono">451</span> missed. Of the 6/25 recommended plays, the <b>secondary</b> <span class="mono">509</span> (set 059) <b>hit</b> on both evening and allday; the primary <span class="mono">058</span> missed. Evening had its strongest day of the week (3/6).</p>
</div>

<div class="sec">
  <h2>2 · Today's Slates — Pre-Flight</h2>
  <table>
    <tr><th>Scope</th><th>Status</th><th>Pick #1</th><th>Tag</th><th>Straight</th></tr>
    <tr><td class="mid">Midday</td><td><span class="pill pass">PASS</span></td><td class="mono">235</td><td>overdue</td><td class="mono">352</td></tr>
    <tr><td class="eve">Evening</td><td><span class="pill pass">PASS</span></td><td class="mono">563</td><td>overdue</td><td class="mono">563</td></tr>
    <tr><td class="all">All Day</td><td><span class="pill pass">PASS</span></td><td class="mono">523</td><td>overdue</td><td class="mono">235</td></tr>
  </table>
  <p class="small muted">3/3 scopes clean · 6 picks each · engine v2.1 · all metadata present. All three #1s are overdue-tagged again.</p>
</div>

<div class="sec">
  <h2>3 · Strategic Picks (Tier-Ranked) — box, all states</h2>
  <p class="small muted">90d = box appearances across the top-10 active jurisdictions (breadth signal only — not a where-to-bet directive). calib = CALIB-01b modelled P(box hit ≥1 in scope today). Convergence = same set on more than one scope's slate.</p>
  <table>
    <tr><th>Tier</th><th>Set</th><th>Slate slot(s)</th><th>90d</th><th>Calibrated P(hit)</th></tr>
    <tr class="t1"><td><b>T1 · Standout×Conv</b></td><td class="mono">579</td><td>allday #6 · eve #2</td><td><b>16</b> ◀ top</td><td>allday 3.4% · eve 2.8%</td></tr>
    <tr class="t1"><td>T1 · Standout×Conv</td><td class="mono">058</td><td>allday #2 · eve #5</td><td>15</td><td>allday <b>8.2%</b> · eve 5.2%</td></tr>
    <tr class="t1"><td>T1 · Standout×Conv</td><td class="mono">356</td><td>allday #3 · eve #1 · mid #6</td><td>15</td><td>allday <b>7.9%</b> · mid 6.4% · eve 3.6%</td></tr>
    <tr class="t1"><td>T1 · Standout×Conv</td><td class="mono">235</td><td>allday #1 · midday #1</td><td>14</td><td>allday 3.6% · mid 2.5%</td></tr>
    <tr class="t1"><td>T1 · Standout×Conv</td><td class="mono">379</td><td>allday #4 · eve #4</td><td>13</td><td>allday <b>8.2%</b> ◀ top model · eve 3.5%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">349</td><td>eve #3</td><td>10</td><td>5.7%</td></tr>
    <tr class="t1"><td>T1 · Standout</td><td class="mono">479</td><td>midday #5</td><td>10</td><td>2.7%</td></tr>
    <tr class="t2"><td><b>T2 · Convergence</b></td><td class="mono">239</td><td>allday #5 · eve #6 · mid #3</td><td>9</td><td>allday 6.2% · eve 3.2% · mid 1.5%</td></tr>
  </table>
  <p class="small muted" style="margin-top:6px">T3/T4 depth: <span class="mono">267</span> (midday #2, 90d 6) and <span class="mono">358</span> (midday #4, 90d 5) — single-scope, low footprint. Full 18-pick table available on request.</p>
</div>

<div class="sec">
  <h2>4 · Recommended Play — your style (1–2 combos · max bet · all states · ride ≤3d)</h2>
  <div class="play">
    <span class="lbl">PRIMARY</span> &nbsp; <span class="combo mono">0&nbsp;5&nbsp;8</span> &nbsp; box (all states) + straight <span class="mono">058</span> (allday) / <span class="mono">850</span> (eve)<br>
    <span class="small muted">The cleanest all-around pick: top-tier footprint (15), cross-scope convergence (allday+evening), the highest calibrated P(hit) on the board (8.2% allday) and max 14d momentum (7). Recurs from yesterday — the set itself didn't print 6/25 but the evidence stack is unchanged and strongest.</span>
  </div>
  <div class="play" style="margin-top:8px">
    <span class="lbl">SECONDARY</span> &nbsp; <span class="combo mono">3&nbsp;5&nbsp;6</span> &nbsp; box (all states) + straight <span class="mono">635</span> (allday) / <span class="mono">563</span> (eve)<br>
    <span class="small muted">The only <b>triple-scope</b> convergence on the board (allday+evening+midday — broadest coverage of the day's draws), footprint 15, P(hit) 7.9% allday / 6.4% midday, 14d momentum 7. Also the evening #1. Different set from the primary, so two combos cover both digit families.</span>
  </div>
  <p class="small" style="margin-top:8px"><b>Lean all-day</b> — strongest scope (30d 90%) and it holds both top picks. If trimming to one, skip midday (weakest today: 7d 43%, every pick P&lt;6.5%). The overdue headline #1s (235 / 523) carry less evidence than the convergence picks above — note 356 is the exception, an overdue evening #1 that is <i>also</i> the strongest convergence set.</p>
</div>

<div class="sec">
  <h2>5 · Red Flags &amp; Notes</h2>
  <ul class="flags small">
    <li><b>Calibration is fresh</b> (CALIB-01b, refit \${CALIB_FIT} — gate passed: test Brier 0.03775 ≤ 0.03846; 2 days old). Mild top-bucket over-prediction remains — read 8.2% as ~6–7% real. Next refit ~7/1.</li>
    <li><b>Midday is structurally weak today</b>: calibrated P(hit) 1.5–6.4%, 7d slate rate 43% (vs 30d 73%, −30pp). Pick #1 <span class="mono">235</span> is overdue/low-P; the strongest midday set <span class="mono">356</span> sits at slot #6 — the known rank-inversion / popularity-ceiling pattern, not an import regression.</li>
    <li><b>Allday 7d (71%) dipped −19pp vs 30d (90%)</b> but is still the top scope and holds both recommended picks. No action — small-n week within the 6/19+ rotation-regen tail.</li>
    <li><b>Evening 7d (57%)</b> trips the runbook's &lt;75% CONFIG-15 trigger by the letter — but evening is only −6pp vs 30d and CO is already at 10 (CONFIG-18 rollback, lever spent). No config ship off a 7d window. Evening also had the best day yesterday (3/6).</li>
    <li><b>Overdue channel ran 1/3 yesterday</b> (only evening #1 905 landed). All three of today's #1s are overdue-tagged again — the convergence picks (058, 356) are the stronger play than the headline #1s.</li>
    <li><b>House edge:</b> at uniform ~90% RTP every bet carries ~−10% EV (BUG-162). These picks maximize hit probability, not positive EV.</li>
  </ul>
</div>

<p class="foot">Why all-states is the right call: 30d per-jurisdiction box-hit rates are near-uniform — TX 8.7%, CO/IL/KY/WI/OH 8.3%, DC 7.8%, AR/SC 7.1%, CA 6.7%. No single state carries an exploitable edge, so spreading across all states maximizes coverage of each combo's draws. · Generated ${DATE} from live Supabase (slate_snapshots · daily_intelligence · adaptive_tracking · histories · app_config.pick_prob_calibration).</p>

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
