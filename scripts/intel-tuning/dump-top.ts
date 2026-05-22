/**
 * Print local replay's top 10 by finalScore for 5/12 midday + show 592's signals.
 */
import { dbGet } from '../backtest/data.js';
import { CONFIGS } from '../backtest/configs.js';
import {
  toComboSet, multiplicityOf, topPairOf, sortedPair, maxNorm,
  computeDGC, computeBoxSignal, buildUniverse,
  normalizeBoxKey, normalizePairKey, MULTIPLICITY_PRIORS,
  getPairSignalFromMap,
} from '../../lib/engineCore.js';

const H_ALL = ['H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y'];

async function fetchBoxRows() {
  const perH = await Promise.all(H_ALL.map(h =>
    dbGet<any[]>(`/datasets_box?class_id=eq.1&scope=eq.midday&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=is.null&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`)));
  return perH.flat();
}

async function fetchPairRows() {
  return await dbGet<any[]>(`/datasets_pair?scope=eq.midday&deleted_at=is.null&jurisdiction=is.null&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=50000`);
}

(async () => {
  const cfg = CONFIGS.default;
  const w = cfg.presets.balanced;
  const boxRows = await fetchBoxRows();
  const pairRows = await fetchPairRows();

  const timesDrawnMap = new Map<string, number>();
  const dsRawMap = new Map<string, number>();
  for (const row of boxRows) {
    if (!row?.key) continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const nk = normalizeBoxKey(row.key);
    const td = row.times_drawn ?? 0;
    const ds = row.ds_raw ?? 0;
    if (td > (timesDrawnMap.get(nk) ?? 0)) timesDrawnMap.set(nk, td);
    if (h === 'H01Y' || !dsRawMap.has(nk)) {
      const existing = dsRawMap.get(nk) ?? 0;
      if (existing === 0 || ds > 0) dsRawMap.set(nk, ds);
    }
  }

  const pairMetaMap = new Map<string, Map<number, { dsRaw: number; drawsSince: number; timesDrawn: number }>>();
  for (const row of pairRows) {
    if (!row?.class_id) continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const pk = normalizePairKey(row.key_pair ?? row.key);
    if (h === 'H01Y' || !pairMetaMap.get(pk)?.has(row.class_id)) {
      if (!pairMetaMap.has(pk)) pairMetaMap.set(pk, new Map());
      pairMetaMap.get(pk)!.set(row.class_id, {
        dsRaw: row.ds_raw ?? 0, drawsSince: row.ds_raw ?? 500, timesDrawn: row.times_drawn ?? 0,
      });
    }
  }

  const universe = buildUniverse();
  let maxTd = 0;
  for (let i = 0; i < 1000; i++) {
    const td = timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTd) maxTd = td;
  }
  let maxPairTd = 0;
  for (const cm of pairMetaMap.values()) for (const m of cm.values()) if (m.timesDrawn > maxPairTd) maxPairTd = m.timesDrawn;
  console.log(`maxTimesDrawn=${maxTd}, maxPairTimesDrawn=${maxPairTd}`);

  const getPairSignal = (pk: string, classId: number): number =>
    getPairSignalFromMap(pairMetaMap, pk, classId, maxPairTd);

  const rawBox = new Array(1000).fill(0);
  const rawPburst = new Array(1000).fill(0);
  const rawCo = new Array(1000).fill(0);
  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const nk = toComboSet(combo);
    const td = timesDrawnMap.get(nk) ?? 0;
    if (td > 0) {
      const ds = dsRawMap.get(nk) ?? 0;
      rawBox[i] = computeBoxSignal(td, ds, maxTd, cfg.pressureThreshold);
    }
    const [a, b, c] = combo;
    const ab = sortedPair(a, b), bc = sortedPair(b, c), ac = sortedPair(a, c);
    rawPburst[i] = (getPairSignal(ab, 2) + getPairSignal(bc, 3) + getPairSignal(ac, 4)) / 3;
    let coSum = 0;
    for (const cid of [5, 6, 7, 8, 9, 10, 11]) {
      coSum += getPairSignal(ab, cid) + getPairSignal(bc, cid) + getPairSignal(ac, cid);
    }
    rawCo[i] = coSum / 21;
  }
  const realBoxMasked = rawBox.map((v, i) => (timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0);
  const normBox = maxNorm(realBoxMasked, true).map((v, i) => (timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v);
  const normPburst = maxNorm(rawPburst, true);
  const normCo = maxNorm(rawCo, true);

  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const m = MULTIPLICITY_PRIORS[multiplicityOf(universe[i])];
    finalScores[i] = w.BOX*normBox[i] + w.PBURST*normPburst[i] + w.CO*normCo[i] + 0*0 + m; // DGC=0 since I skipped it for speed
  }
  const idx = Array.from({length:1000},(_,i)=>i).sort((a,b)=>finalScores[b]-finalScores[a]);
  console.log('\n=== TOP 15 by finalScore (local replay reproduction, no DGC for speed) ===');
  for (let r=0;r<15;r++){
    const i=idx[r], c=universe[i], nk=toComboSet(c);
    console.log(`  #${r+1} ${c} cs=${nk} ind=${finalScores[i].toFixed(3)} BOX=${normBox[i].toFixed(3)} PB=${normPburst[i].toFixed(3)} CO=${normCo[i].toFixed(3)} td=${timesDrawnMap.get(nk)} ds=${dsRawMap.get(nk)}`);
  }
  for (const c of ['592','320','426','248']) {
    const i = universe.indexOf(c);
    const nk = toComboSet(c);
    console.log(`SPECIFIC ${c}: ind=${finalScores[i].toFixed(3)} BOX=${normBox[i].toFixed(3)} PB=${normPburst[i].toFixed(3)} CO=${normCo[i].toFixed(3)} td=${timesDrawnMap.get(nk)} ds=${dsRawMap.get(nk)}`);
  }
})();
