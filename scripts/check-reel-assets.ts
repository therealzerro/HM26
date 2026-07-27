/**
 * check-reel-assets — MKT-06: preflight contract validator for reel inputs.
 *
 * Run after ANY endcard/carrier swap, BEFORE assembling:
 *     npm run reel:check
 *
 * Encodes the assembler contracts (assemble-allday-reels.ts /
 * assemble-verification-reel.ts) as mechanical checks so a bad asset drop
 * fails HERE with a named reason instead of producing a broken daily reel
 * (or aborting mid-assembly). Born from the 2026-07-27 incident where a
 * GitHub web "rename" quietly replaced an endcard with a 2-byte placeholder.
 *
 * Per asset: FAIL = assembly would break or produce a defective reel;
 * WARN = assembles fine but quality is degraded (upscale, low fps, VO
 * chop risk, weak crack). Exit 1 on any FAIL.
 */
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ASSETS = resolve('assets/marketing');
const OPEN = 1.2, BODY = 16.0, CARD = 6.5, BED_SRC_START = 2.0; // assembler constants (body measured at runtime; 16.0 = current renderer)
const VOICE_HARD_END = OPEN + BODY + 1.1; // 18.3s — overlap-mode fade-out deadline

interface Finding { level: 'PASS' | 'WARN' | 'FAIL'; asset: string; msg: string }
const findings: Finding[] = [];
const add = (level: Finding['level'], asset: string, msg: string): void => { findings.push({ level, asset, msg }); };

function probe(file: string, args: string): string {
  return execSync(`ffprobe -v error ${args} "${file}"`).toString().trim();
}

interface Streams { vDur: number; aDur: number; w: number; h: number; fps: number; hasAudio: boolean }
function streams(file: string): Streams {
  const vd = probe(file, `-select_streams v:0 -show_entries stream=duration,width,height,r_frame_rate -of csv=p=0`);
  const [w, h, rate, dur] = vd.split(',');
  const [num, den] = (rate ?? '0/1').split('/').map(Number);
  let aDur = 0, hasAudio = false;
  try {
    const ad = probe(file, `-select_streams a:0 -show_entries stream=duration -of csv=p=0`);
    if (ad) { aDur = parseFloat(ad); hasAudio = Number.isFinite(aDur) && aDur > 0; }
  } catch { /* no audio stream */ }
  return { vDur: parseFloat(dur), aDur, w: parseInt(w, 10), h: parseInt(h, 10), fps: den ? num / den : 0, hasAudio };
}

/** Peak level (dB) within a time window — used to find the crack transient. */
function peakDb(file: string, from: number, to: number): number {
  const out = execSync(
    `ffmpeg -ss ${from} -to ${to} -i "${file}" -af volumedetect -f null - 2>&1 | grep max_volume || true`,
    { shell: '/bin/bash' },
  ).toString();
  const m = out.match(/max_volume:\s*(-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : -99;
}

/** Silence windows (start,end) via silencedetect — for VO-end analysis. */
function silences(file: string): { start: number; end: number }[] {
  const out = execSync(
    `ffmpeg -i "${file}" -af "silencedetect=noise=-35dB:d=0.4" -f null - 2>&1 | grep -E "silence_(start|end)" || true`,
    { shell: '/bin/bash' },
  ).toString();
  const res: { start: number; end: number }[] = [];
  let cur: number | null = null;
  for (const line of out.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) cur = parseFloat(s[1]);
    if (e && cur != null) { res.push({ start: cur, end: parseFloat(e[1]) }); cur = null; }
  }
  const total = parseFloat(probe(file, `-show_entries format=duration -of csv=p=0`));
  if (cur != null) res.push({ start: cur, end: total }); // trailing silence to EOF
  return res;
}

function exists(name: string): string | null {
  const p = join(ASSETS, name);
  if (!existsSync(p)) { add('FAIL', name, 'file missing'); return null; }
  const size = statSync(p).size;
  if (size < 100_000) { add('FAIL', name, `file is ${size} bytes — placeholder/corrupt (GitHub web-rename destroys binaries; recover from the upload commit)`); return null; }
  return p;
}

function checkAlldayEndcard(variant: 'pro' | 'free', carrierDur: number | null): void {
  const name = `allday_${variant}_endcard.mp4`;
  const p = exists(name);
  if (!p) return;
  const s = streams(p);
  if (!Number.isFinite(s.vDur) || s.vDur < CARD) return add('FAIL', name, `video ${s.vDur?.toFixed(1)}s < ${CARD}s outro window`);
  if (!s.hasAudio) return add('FAIL', name, 'no audio stream — assembler filter graph requires one');
  // Audio requirement mirrors the assembler abort: outro always needs CARD;
  // short carriers additionally need the hum bed from BED_SRC_START.
  let audioNeed = CARD;
  if (carrierDur != null && carrierDur < OPEN + BODY - 0.05) {
    const voiceSpan = Math.min(carrierDur - 0.2, OPEN + BODY);
    audioNeed = Math.max(CARD, BED_SRC_START + (OPEN + BODY - voiceSpan));
  }
  if (s.aDur + 0.05 < audioNeed) return add('FAIL', name, `audio ${s.aDur.toFixed(1)}s < required ${audioNeed.toFixed(1)}s (outro/bed)`);
  add('PASS', name, `video ${s.vDur.toFixed(1)}s · audio ${s.aDur.toFixed(1)}s (need ${audioNeed.toFixed(1)}s)`);
  if (s.h < 1920) add('WARN', name, `${s.w}x${s.h} — will be upscaled to 1080x1920 (deliver native 1080x1920 for full sharpness)`);
  if (s.fps < 30) add('WARN', name, `${s.fps.toFixed(0)}fps — assembler duplicates to 60fps (motion slightly steppy; 30-60fps source preferred)`);
  const crack = peakDb(p, 0, CARD);
  if (crack < -12) add('WARN', name, `no strong transient in first ${CARD}s (peak ${crack.toFixed(1)}dB) — bolt-snap crack may be missing/weak`);
}

function checkAlldayCarrier(variant: 'pro' | 'free'): number | null {
  const name = `allday_${variant}_carrier.mp4`;
  const p = exists(name);
  if (!p) return null;
  const s = streams(p);
  if (!s.hasAudio) { add('FAIL', name, 'no audio stream — the carrier IS the voiceover'); return null; }
  const dur = s.aDur;
  const overlap = dur >= OPEN + BODY - 0.05;
  const voiceSpan = overlap ? Math.min(dur - 0.1, VOICE_HARD_END) : Math.min(dur - 0.2, OPEN + BODY);
  const mode = overlap ? `overlap (voice 0-${voiceSpan.toFixed(1)}s, wall-to-wall)` : `hum-bed (voice 0-${voiceSpan.toFixed(1)}s, endcard hum beds the rest)`;
  add('PASS', name, `audio ${dur.toFixed(1)}s → ${mode}`);
  // VO-chop risk: is there actual signal (not silence) at the fade point?
  const sil = silences(p);
  const fadeStart = voiceSpan - 0.25;
  const inSilence = sil.some(x => x.start <= fadeStart && x.end >= voiceSpan);
  if (!inSilence && dur > voiceSpan + 0.05) {
    add('WARN', name, `audio still active at the ${voiceSpan.toFixed(1)}s fade — narration may cut mid-phrase (script the VO to finish by ${(overlap ? VOICE_HARD_END - 0.5 : OPEN + BODY - 0.5).toFixed(1)}s)`);
  }
  return dur;
}

function checkVerify(): void {
  const c = exists('verif_carrier.mp4');
  if (c) {
    const s = streams(c);
    if (!s.hasAudio) add('FAIL', 'verif_carrier.mp4', 'no audio stream — it supplies the entire reel soundtrack');
    else if (s.aDur + 0.05 < 10) add('FAIL', 'verif_carrier.mp4', `audio ${s.aDur.toFixed(1)}s < 10.0s — reel goes silent early (nothing aborts on this)`);
    else add('PASS', 'verif_carrier.mp4', `audio ${s.aDur.toFixed(1)}s (10.0s used)`);
  }
  const e = exists('verif_endcard.mp4');
  if (e) {
    const s = streams(e);
    if (!Number.isFinite(s.vDur) || s.vDur < 2.5) add('FAIL', 'verif_endcard.mp4', `video ${s.vDur?.toFixed(1)}s < 2.5s tail window`);
    else add('PASS', 'verif_endcard.mp4', `video ${s.vDur.toFixed(1)}s (last 2.5s + tail frame used; audio not used)`);
    if (s.h < 1920) add('WARN', 'verif_endcard.mp4', `${s.w}x${s.h} — will be upscaled to 1080x1920`);
  }
}

// MKT-07: smoke-render the slate stamp so a broken renderer (moved font files,
// playwright update) fails HERE instead of aborting the daily assembly.
function checkStamp(): void {
  const name = 'render-reel-stamp';
  const probePng = join(tmpdir(), 'reel-stamp-probe.png');
  try {
    execSync(`npx tsx scripts/render-reel-stamp.ts drop 20260101 ALL-DAY "${probePng}"`, { stdio: 'pipe' });
    const [w, h, fmt] = probe(probePng, `-select_streams v:0 -show_entries stream=width,height,pix_fmt -of csv=p=0`).split(',');
    if (w !== '1080' || h !== '1920') return add('FAIL', name, `probe stamp is ${w}x${h} — expected 1080x1920`);
    if (!fmt.includes('rgba')) return add('FAIL', name, `probe stamp pix_fmt ${fmt} — transparency lost, chip would blank the frame`);
    add('PASS', name, 'probe stamp rendered 1080x1920 rgba (JetBrains Mono loaded)');
  } catch (e) {
    add('FAIL', name, `stamp renderer errored — ${String((e as any).stderr ?? e).slice(0, 200)}`);
  } finally {
    try { execSync(`rm -f "${probePng}"`); } catch { /* best-effort */ }
  }
}

const proCarrier = checkAlldayCarrier('pro');
const freeCarrier = checkAlldayCarrier('free');
checkAlldayEndcard('pro', proCarrier);
checkAlldayEndcard('free', freeCarrier);
checkVerify();
checkStamp();

const ICON = { PASS: '✅', WARN: '⚠️ ', FAIL: '⛔' } as const;
for (const f of findings) console.log(`${ICON[f.level]} ${f.asset} — ${f.msg}`);
const fails = findings.filter(f => f.level === 'FAIL').length;
const warns = findings.filter(f => f.level === 'WARN').length;
console.log(`\n${fails ? '⛔ NOT SAFE TO ASSEMBLE' : warns ? '✅ safe to assemble (with warnings)' : '✅ all clear'} — ${fails} fail, ${warns} warn`);
if (fails > 0) process.exit(1);
