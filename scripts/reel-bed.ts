// MKT-10 — derive the endcard hum-bed window from the asset itself.
//
// This replaced a hardcoded window (0.0-3.9s) that was measured on the Pro
// endcard and generalised. That generalisation was already wrong when it
// shipped: the FREE endcard's crack lands at ~1.0s, squarely inside it. The
// defect stayed invisible only because Free had never run in bed mode — it
// surfaced the first time it did, via the guard rather than the constant.
//
// So the crack is measured per file and the window derived around it. A new
// motion file that moves its snap can no longer silently poison the bed.
//
// Selection rule, in order:
//   1. PRE-crack  [0, crack - CRACK_PAD]      — preferred: the tension hum is
//                                               level-steady and reads as build.
//   2. POST-crack [crack + CRACK_TAIL, end]   — fallback when the crack is early.
//   3. null                                   — caller fails loudly.
// A candidate must be long enough to palindrome from AND carry usable level:
// the Pro endcard's post-crack hum decays to -46 dB by 9.5s, which is present
// but useless as a bed, so a duration test alone is not sufficient.
import { execSync } from 'node:child_process';

/** Keep the bed clear of the transient by this much on either side. */
export const CRACK_PAD = 0.4;
/** How long the crack's ring takes to decay out of the way. */
export const CRACK_TAIL = 1.2;
/** Shorter than this and the palindrome repeats too obviously. */
export const MIN_BED_SRC = 2.0;
/** Mean RMS below this is "technically audio, audibly nothing". */
export const MIN_BED_RMS = -55;
/**
 * Max p10→p90 RMS spread, dB. A mean-level test alone is not enough: the Free
 * endcard's post-crack span averages a healthy -32dB but decays ~30dB across
 * itself, so palindroming it produces an audible swell-and-fade under the
 * modals. The bed has to be STEADY, not merely present.
 */
export const MAX_BED_SPREAD = 20;

export interface BedWindow {
  start: number;
  end: number;
  /** Where the loudest transient (the bolt snap) actually is. */
  crackAt: number;
  mode: 'pre' | 'post';
  /** Mean RMS of the chosen window, dB. */
  rms: number;
}

interface Slice { t: number; peak: number; rms: number }

/** Per-0.1s peak and RMS across the file — one ffmpeg pass. */
function profile(file: string): Slice[] {
  const out = execSync(
    `ffmpeg -hide_banner -v error -i "${file}" -af ` +
      `"aformat=channel_layouts=mono,asetnsamples=4800,astats=metadata=1:reset=1,` +
      `ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-" -f null - 2>/dev/null || true`,
    { shell: '/bin/bash' },
  ).toString();
  const rmsOut = execSync(
    `ffmpeg -hide_banner -v error -i "${file}" -af ` +
      `"aformat=channel_layouts=mono,asetnsamples=4800,astats=metadata=1:reset=1,` +
      `ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" -f null - 2>/dev/null || true`,
    { shell: '/bin/bash' },
  ).toString();
  const parse = (s: string, key: string): Map<number, number> => {
    const m = new Map<number, number>();
    let t = 0;
    for (const line of s.split('\n')) {
      const pt = line.match(/pts_time:([\d.]+)/);
      if (pt) t = parseFloat(pt[1]);
      const v = line.match(new RegExp(`${key}=(-?[\\d.]+|-?inf)`));
      if (v) m.set(t, v[1] === '-inf' ? -120 : parseFloat(v[1]));
    }
    return m;
  };
  const peaks = parse(out, 'Peak_level');
  const rmss = parse(rmsOut, 'RMS_level');
  return [...peaks.keys()].sort((a, b) => a - b).map(t => ({ t, peak: peaks.get(t)!, rms: rmss.get(t) ?? -120 }));
}

const meanRms = (s: Slice[]): number =>
  s.length ? 10 * Math.log10(s.reduce((a, x) => a + Math.pow(10, x.rms / 10), 0) / s.length) : -120;

/** p10→p90 RMS spread — how much the level moves across the window. */
function spread(s: Slice[]): number {
  if (s.length < 4) return 999;
  const v = s.map(x => x.rms).sort((a, b) => a - b);
  const at = (q: number) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
  return +(at(0.9) - at(0.1)).toFixed(1);
}

/** A candidate is usable only if it is long enough, audible, AND level-steady. */
function usable(s: Slice[]): { ok: boolean; rms: number; spr: number } {
  const rms = meanRms(s), spr = spread(s);
  return { ok: rms > MIN_BED_RMS && spr <= MAX_BED_SPREAD, rms: +rms.toFixed(1), spr };
}

/**
 * Derive the bed window for `file`, searching for the crack within the first
 * `within` seconds (the outro span). Returns null when neither candidate is
 * usable — the caller must fail rather than guess.
 */
export function bedWindow(file: string, within: number): BedWindow | null {
  const slices = profile(file);
  if (!slices.length) return null;
  const head = slices.filter(s => s.t <= within);
  if (!head.length) return null;
  const crack = head.reduce((a, b) => (b.peak > a.peak ? b : a));
  const crackAt = +crack.t.toFixed(2);
  const endOfFile = +slices[slices.length - 1].t.toFixed(2);

  for (const [mode, w] of [
    ['pre', { start: 0, end: +(crackAt - CRACK_PAD).toFixed(2) }],
    ['post', { start: +(crackAt + CRACK_TAIL).toFixed(2), end: endOfFile }],
  ] as const) {
    if (w.end - w.start < MIN_BED_SRC) continue;
    const u = usable(slices.filter(s => s.t >= w.start && s.t <= w.end));
    if (u.ok) return { ...w, crackAt, mode, rms: u.rms };
  }
  return null;
}
