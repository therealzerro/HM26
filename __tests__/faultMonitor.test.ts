import {
  classOf, logFactorial, logBfDirichlet, logBfNoRepeats, classMixE, digitPositionE,
  monthlyAnchors, scanStream, scanFaults, THRESHOLDS, CLASS_P,
} from '../lib/faultMonitor';

// Deterministic PRNG (mulberry32) so the "fair stream" fixtures are stable.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fairDraws(n: number, seed: number, start = '2026-04-01'): { date: string; digits: string }[] {
  const r = rng(seed);
  const out: { date: string; digits: string }[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push({ date: d.toISOString().slice(0, 10), digits: String(Math.floor(r() * 1000)).padStart(3, '0') });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// DC midday exactly as `histories` holds it: first row 2026-04-09, 13 singles
// through 04-21 (the Smartplay no-repeat fault, disclosed after the fact), then
// the first double on 04-23 once the machine was recertified.
const DC_MIDDAY = [
  ['2026-04-09', '217'], ['2026-04-10', '153'], ['2026-04-11', '914'], ['2026-04-12', '537'], ['2026-04-13', '702'],
  ['2026-04-14', '235'], ['2026-04-15', '725'], ['2026-04-16', '426'], ['2026-04-17', '473'], ['2026-04-18', '971'],
  ['2026-04-19', '617'], ['2026-04-20', '214'], ['2026-04-21', '456'],
  ['2026-04-22', '987'], ['2026-04-23', '929'], ['2026-04-24', '810'], ['2026-04-25', '377'],
].map(([date, digits]) => ({ date, digits }));

describe('faultMonitor — primitives', () => {
  test('classOf', () => {
    expect(classOf('217')).toBe('single');
    expect(classOf('929')).toBe('double');
    expect(classOf('200')).toBe('double');
    expect(classOf('777')).toBe('triple');
  });
  test('logFactorial matches ln(n!)', () => {
    expect(logFactorial(0)).toBe(0);
    expect(logFactorial(5)).toBeCloseTo(Math.log(120), 10);
    expect(logFactorial(20)).toBeCloseTo(Math.log(2432902008176640000), 8);
  });
  test('Dirichlet BF: 1 with no data; expectation exactly 1 under the null (n=1); small for most fair streams', () => {
    expect(Math.exp(logBfDirichlet([0, 0, 0], [0.72, 0.27, 0.01]))).toBeCloseTo(1, 10);
    // E_H0[e] = Σ_class p_class · BF(class) must be 1 for an e-process
    const p = [CLASS_P.single, CLASS_P.double, CLASS_P.triple];
    const e1 = p[0] * Math.exp(logBfDirichlet([1, 0, 0], p)) + p[1] * Math.exp(logBfDirichlet([0, 1, 0], p)) + p[2] * Math.exp(logBfDirichlet([0, 0, 1], p));
    expect(e1).toBeCloseTo(1, 10);
    // heavy tail: under H0 almost every 60-draw fair stream reads well below the WATCH line
    let quiet = 0; const trials = 400;
    for (let t = 0; t < trials; t++) {
      const ds = fairDraws(60, 1000 + t);
      let s = 0, d = 0, tr = 0;
      for (const x of ds) { const c = classOf(x.digits); if (c === 'single') s++; else if (c === 'double') d++; else tr++; }
      if (classMixE(s, d, tr) < 5) quiet++;
    }
    expect(quiet / trials).toBeGreaterThan(0.97);
  });
  test('no-repeats point alternative: 1/.72 per single, dead at the first double', () => {
    expect(Math.exp(logBfNoRepeats(13, 0, 0))).toBeCloseTo(1 / 0.72 ** 13, 6);
    expect(logBfNoRepeats(13, 1, 0)).toBe(-Infinity);
  });
  test('monthly anchors', () => {
    expect(monthlyAnchors('2026-04-01', '2026-06-15')).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
    expect(monthlyAnchors('2026-04-09', '2026-04-21')).toEqual(['2026-04-09']);
  });
});

describe('faultMonitor — DC 2026 fault (validation against the real ledger rows)', () => {
  test('as the ledger has it (from 4/9): e ≈ 36 on 4/21 — rising, below WATCH', () => {
    const asOf = DC_MIDDAY.filter(d => d.date <= '2026-04-21');
    expect(asOf).toHaveLength(13);
    expect(asOf.every(d => classOf(d.digits) === 'single')).toBe(true);
    const e = classMixE(13, 0, 0);
    expect(e).toBeGreaterThan(30);
    expect(e).toBeLessThan(THRESHOLDS.classMix.watch);
    const { signals, eValues } = scanStream('DC|midday', asOf, ['2026-04-09']);
    expect(signals.filter(s => s.kind === 'class-mix')).toHaveLength(0);
    expect(eValues.find(r => r.kind === 'class-mix')!.e).toBeCloseTo(e, 6);
  });
  test('consecutive singles from an anchor: WATCH on the 17th, FLAG on the 24th', () => {
    // ½·(1/.72^n) + ½·Dirichlet: n=16 → 97, n=17 → 134 ; n=23 → 950, n=24 → 1,320
    expect(classMixE(16, 0, 0)).toBeLessThan(THRESHOLDS.classMix.watch);
    expect(classMixE(17, 0, 0)).toBeGreaterThanOrEqual(THRESHOLDS.classMix.watch);
    expect(classMixE(23, 0, 0)).toBeLessThan(THRESHOLDS.classMix.flag);
    expect(classMixE(24, 0, 0)).toBeGreaterThanOrEqual(THRESHOLDS.classMix.flag);
    // DC from 3/31: 22 fault draws per session → WATCH (4/16), not yet FLAG
    const dc22 = fairDraws(22, 7, '2026-03-31').map(d => {
      let s = d.digits; let k = 0;
      while (classOf(s) !== 'single') { s = String((Number(s) + 37 * ++k) % 1000).padStart(3, '0'); }
      return { ...d, digits: s };
    });
    expect(scanStream('DC|midday', dc22, ['2026-03-31']).signals.find(s => s.kind === 'class-mix')?.severity).toBe('WATCH');
    const synthetic = fairDraws(26, 7, '2026-03-31').map(d => {
      // force singles while keeping the digits pseudo-random
      let s = d.digits; let k = 0;
      while (classOf(s) !== 'single') { s = String((Number(s) + 37 * ++k) % 1000).padStart(3, '0'); }
      return { ...d, digits: s };
    });
    const { signals } = scanStream('DC|midday', synthetic, ['2026-03-31']);
    const mix = signals.find(s => s.kind === 'class-mix');
    expect(mix?.severity).toBe('FLAG');
    expect(mix?.detail).toMatch(/NO repeated digits/);
    expect(signals.some(s => s.kind === 'zero-doubles')).toBe(true);
  });
  test('the fix is visible: once doubles return the point alternative dies and e collapses', () => {
    const { eValues } = scanStream('DC|midday', DC_MIDDAY, ['2026-04-09']);
    expect(eValues.find(r => r.kind === 'class-mix')!.e).toBeLessThan(5);
  });
});

describe('faultMonitor — excluded digit (AZ 2013 class)', () => {
  test('digit 7 never in position 1 for 130 draws → absence FLAG; Dirichlet e still low (slow burn)', () => {
    const draws = fairDraws(130, 42).map(d => (d.digits[0] === '7' ? { ...d, digits: '3' + d.digits.slice(1) } : d));
    const { signals, eValues } = scanStream('AZ|evening', draws, ['2026-04-01']);
    const abs = signals.find(s => s.kind === 'digit-absence' && /digit 7 absent from pos 1/.test(s.stat));
    expect(abs?.severity).toBe('FLAG');
    expect(digitPositionE(eValues.find(r => r.kind === 'digit-position' && r.position === 0)!.counts.split(' ').map(Number))).toBeLessThan(THRESHOLDS.digitPosition.watch);
  });
  test('…and at 300 draws the Dirichlet e-process catches it too', () => {
    const draws = fairDraws(300, 43).map(d => (d.digits[0] === '7' ? { ...d, digits: '3' + d.digits.slice(1) } : d));
    const { signals } = scanStream('AZ|evening', draws, ['2026-04-01']);
    expect(signals.some(s => s.kind === 'digit-position' && s.severity === 'FLAG')).toBe(true);
  });
});

describe('faultMonitor — fair streams stay quiet', () => {
  test('75 fair streams × 200 draws: zero FLAGs at any kind', () => {
    const rows: { stream: string; date: string; digits: string }[] = [];
    for (let s = 0; s < 75; s++) for (const d of fairDraws(200, 500 + s)) rows.push({ stream: `S${s}|evening`, ...d });
    const scan = scanFaults(rows, { from: '2026-04-01', asOf: '2026-10-24' });
    expect(scan.streams).toBe(75);
    expect(scan.draws).toBe(75 * 200);
    // P(a digit-absence run ≥ 120 at an instant) ≈ 3.2e-6 × 2,250 cells ≈ .007; class-mix / digit-position FLAGs ≤ .001 each
    expect(scan.signals.filter(s => s.severity === 'FLAG')).toHaveLength(0);
    // WATCH may fire on noise — rarely (absence ≥ 90 ≈ .17 expected across the fixture)
    expect(scan.signals.filter(s => s.severity === 'WATCH').length).toBeLessThanOrEqual(3);
  });
  test('exact-repeat screen fires on a stuck draw and not otherwise', () => {
    const base = fairDraws(30, 9);
    base[10] = { ...base[10], digits: base[9].digits };
    base[20] = { ...base[20], digits: base[19].digits };
    const { signals } = scanStream('X|midday', base, ['2026-04-01']);
    expect(signals.some(s => s.kind === 'exact-repeat')).toBe(true);
    expect(scanStream('Y|midday', fairDraws(30, 11), ['2026-04-01']).signals.some(s => s.kind === 'exact-repeat')).toBe(false);
  });
});
