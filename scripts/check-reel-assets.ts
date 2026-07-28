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
import { resolveCarrier, orphanedParts, audioDur } from './reel-carrier';
import { available, sourcePath, publicPath, sha256, clearanceFor } from './reel-panels';
import { PANELS, PANEL_W, PUBLIC_DIR } from './panel-config';
import { MODAL_COUNT, PANEL_URL_BASE, panelSequence, rotationDegenerate } from '../constants/reelPanels';

const ASSETS = resolve('assets/marketing');
const OPEN = 1.2, BODY = 19.0, CARD = 6.5; // assembler constants (body measured at runtime; 19.0 = current renderer)
const BED_SRC_START = 0.0, BED_SRC_END = 3.9; // MKT-10: crack-free hum-bed window
// MKT-08: with an active anchor intro the VO enters at introDur−0.4, so the
// usable VO window (on the CARRIER's own timeline) shrinks 17.2 → 16.4s and
// the overlap fade-out deadline 18.3 → 17.5s. Set by checkAnchorIntro().
let INTRO_ACTIVE = false;
const voiceWindow = () => (INTRO_ACTIVE ? BODY + 0.4 : OPEN + BODY);
const voiceHardEnd = () => voiceWindow() + 1.1;

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

/** Dev-server origin the renderers drive (BASE in render-allday-body.ts). */
const DEV_BASE = 'http://localhost:8081';

/** HTTP status / content-type / bytes for a URL. code 0 = unreachable. */
function httpProbe(url: string): { code: number; type: string; len: number } {
  try {
    const out = execSync(
      `curl -s -o /dev/null --max-time 6 -w "%{http_code} %{content_type} %{size_download}" "${url}" || true`,
      { shell: '/bin/bash' },
    ).toString().trim().split(/\s+/);
    return { code: parseInt(out[0], 10) || 0, type: out[1] ?? '', len: parseInt(out[2], 10) || 0 };
  } catch {
    return { code: 0, type: '', len: 0 };
  }
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

/** Avg per-frame luma spread (YHIGH−YLOW) over the file's final 0.5s. */
function tailLumaSpread(file: string): number {
  const out = execSync(
    `ffmpeg -sseof -0.5 -i "${file}" -vf "signalstats,metadata=print" -f null - 2>&1 | grep -oE "Y(HIGH|LOW)=[0-9.]+" || true`,
    { shell: '/bin/bash' },
  ).toString();
  const hi = [...out.matchAll(/YHIGH=([\d.]+)/g)].map(m => parseFloat(m[1]));
  const lo = [...out.matchAll(/YLOW=([\d.]+)/g)].map(m => parseFloat(m[1]));
  if (!hi.length || hi.length !== lo.length) return 999;
  return hi.reduce((a, v, i) => a + (v - lo[i]), 0) / hi.length;
}

// MKT-08: anchor intro contract. Missing = fine (legacy open, note only);
// present-but-defective = loud FAIL, since assemblers silently fall back.
// Returns whether the intro lane will actually be ACTIVE at assembly.
function checkAnchorIntro(): boolean {
  const name = 'anchor_intro.mp4';
  const p = join(ASSETS, name);
  if (!existsSync(p)) {
    add('PASS', name, 'not present — reels assemble with the legacy endcard-lockup open (intro lane dormant)');
    return false;
  }
  const size = statSync(p).size;
  if (size < 100_000) { add('FAIL', name, `file is ${size} bytes — placeholder/corrupt (assemblers will fall back to the legacy open)`); return false; }
  const s = streams(p);
  let ok = true;
  if (!s.hasAudio) { add('FAIL', name, 'no audio stream — intro audio is load-bearing before the VO enters'); ok = false; }
  if (!Number.isFinite(s.vDur) || s.vDur < 3.5 || s.vDur > 6.5) { add('FAIL', name, `video ${s.vDur?.toFixed(1)}s outside the 3.5-6.5s intro window`); ok = false; }
  if (s.w < 720 || s.h < 1280) { add('FAIL', name, `${s.w}x${s.h} — below the 720x1280 minimum`); ok = false; }
  if (!ok) { add('WARN', name, 'defective — assemblers fall back to the legacy open (daily reels still build)'); return false; }
  add('PASS', name, `video ${s.vDur.toFixed(1)}s · audio ${s.aDur.toFixed(1)}s — intro lane ACTIVE (allday ${(s.vDur + 22.5).toFixed(1)}s, verify ${(s.vDur + 8.8).toFixed(1)}s)`);
  if (s.h < 1920) add('WARN', name, `${s.w}x${s.h} — will be upscaled to 1080x1920`);
  if (s.fps < 30) add('WARN', name, `${s.fps.toFixed(0)}fps — duplicated to 60fps`);
  const spread = tailLumaSpread(p);
  if (spread > 170) add('FAIL', name, `final 0.5s luma spread ${spread.toFixed(0)} — not near-uniform smoke; the dissolve into the UI will pop`);
  else if (spread > 120) add('WARN', name, `final 0.5s luma spread ${spread.toFixed(0)} — dissolve source is busy (target: full-frame smoke)`);
  return spread <= 170;
}

function checkAlldayEndcard(variant: 'pro' | 'free', carrierDur: number | null): void {
  const name = `allday_${variant}_endcard.mp4`;
  const p = exists(name);
  if (!p) return;
  const s = streams(p);
  if (!Number.isFinite(s.vDur) || s.vDur < CARD) return add('FAIL', name, `video ${s.vDur?.toFixed(1)}s < ${CARD}s outro window`);
  if (!s.hasAudio) return add('FAIL', name, 'no audio stream — assembler filter graph requires one');
  // Audio requirement mirrors the assembler abort: the outro always needs CARD.
  // MKT-10: the bed palindrome-fills from a fixed window, so a short carrier
  // no longer inflates the requirement — only the window itself must exist.
  const needsBed = carrierDur != null && carrierDur < voiceWindow() - 0.05;
  const audioNeed = needsBed ? Math.max(CARD, BED_SRC_END) : CARD;
  if (s.aDur + 0.05 < audioNeed) return add('FAIL', name, `audio ${s.aDur.toFixed(1)}s < required ${audioNeed.toFixed(1)}s (outro/bed)`);
  add('PASS', name, `video ${s.vDur.toFixed(1)}s · audio ${s.aDur.toFixed(1)}s (need ${audioNeed.toFixed(1)}s)`);
  if (s.h < 1920) add('WARN', name, `${s.w}x${s.h} — will be upscaled to 1080x1920 (deliver native 1080x1920 for full sharpness)`);
  if (s.fps < 30) add('WARN', name, `${s.fps.toFixed(0)}fps — assembler duplicates to 60fps (motion slightly steppy; 30-60fps source preferred)`);
  const crack = peakDb(p, 0, CARD);
  if (crack < -12) add('WARN', name, `no strong transient in first ${CARD}s (peak ${crack.toFixed(1)}dB) — bolt-snap crack may be missing/weak`);
  // MKT-10 guard: the hum bed is lifted from BED_SRC_START-BED_SRC_END and
  // replayed under the modals, so the crack must NOT fall inside that window.
  // When it did (the old 2.0s start), the reel played the bolt snap twice.
  if (needsBed) {
    const inBed = peakDb(p, BED_SRC_START, BED_SRC_END);
    if (inBed > crack - 6) {
      add('FAIL', name, `loudest transient (${inBed.toFixed(1)}dB) falls inside the hum-bed window ${BED_SRC_START}-${BED_SRC_END}s — the bolt crack would be replayed under the modals. Keep the crack after ${BED_SRC_END}s.`);
    }
  }
}

/**
 * MKT-09: resolve a carrier's delivered parts and report the join. Returns the
 * path the assembler will read (the join when parts exist, else the base file).
 */
function checkCarrierParts(base: string, name: string): string {
  const orphans = orphanedParts(ASSETS, base);
  for (const o of orphans) {
    add('FAIL', o.split('/').pop()!, `unreachable — an earlier part is missing, so this audio would be silently dropped and the narration would have a hole. Deliver the missing ${base}_ptN.mp4.`);
  }
  const res = resolveCarrier(ASSETS, base);
  if (res.joined) {
    const list = res.parts.map(x => x.split('/').pop()).join(' + ');
    const durs = res.parts.map(x => audioDur(x));
    add('PASS', name, `${res.parts.length} parts joined (${list}) — ${durs.map(d => d.toFixed(1) + 's').join(' + ')}`);
  }
  return res.path;
}

function checkAlldayCarrier(variant: 'pro' | 'free'): number | null {
  const base = `allday_${variant}_carrier`;
  let name = `${base}.mp4`;
  const p0 = exists(name);
  if (!p0) return null;
  // MKT-09: validate what the assembler will actually read — the JOIN when
  // parts were delivered, not just part 1. Checking part 1 alone would clear a
  // carrier whose narration overruns the ceiling only after the join.
  const p = checkCarrierParts(base, name);
  if (p !== p0) name = `${base}.mp4 + parts`;
  const s = streams(p);
  if (!s.hasAudio) { add('FAIL', name, 'no audio stream — the carrier IS the voiceover'); return null; }
  const dur = s.aDur;
  const overlap = dur >= voiceWindow() - 0.05;
  const voiceSpan = overlap ? Math.min(dur - 0.1, voiceHardEnd()) : Math.min(dur - 0.2, voiceWindow());
  const mode = overlap ? `overlap (voice 0-${voiceSpan.toFixed(1)}s of carrier, wall-to-wall)` : `hum-bed (voice 0-${voiceSpan.toFixed(1)}s of carrier, endcard hum beds the rest)`;
  add('PASS', name, `audio ${dur.toFixed(1)}s → ${mode}${INTRO_ACTIVE ? ' · intro-shifted window' : ''}`);
  // VO-chop risk: is there actual signal (not silence) at the fade point?
  const sil = silences(p);
  const fadeStart = voiceSpan - 0.25;
  const inSilence = sil.some(x => x.start <= fadeStart && x.end >= voiceSpan);
  if (!inSilence && dur > voiceSpan + 0.05) {
    add('WARN', name, `audio still active at the ${voiceSpan.toFixed(1)}s fade — narration may cut mid-phrase (script the VO to finish by ${(overlap ? voiceHardEnd() - 0.5 : voiceWindow() - 0.5).toFixed(1)}s of carrier)`);
  }
  return dur;
}

function checkVerify(): void {
  const c0 = exists('verif_carrier.mp4');
  if (c0) {
    const c = checkCarrierParts('verif_carrier', 'verif_carrier.mp4');
    const s = streams(c);
    // MKT-08: with the intro active the carrier enters at introDur−0.4 and
    // covers to the end, so the need is a flat 9.2s regardless of intro length
    // (intro audio carries everything before that). Legacy need is 10.0s.
    const need = INTRO_ACTIVE ? 9.2 : 10.0;
    if (!s.hasAudio) add('FAIL', 'verif_carrier.mp4', 'no audio stream — it supplies the reel soundtrack after the intro');
    else if (s.aDur + 0.05 < need) add('FAIL', 'verif_carrier.mp4', `audio ${s.aDur.toFixed(1)}s < ${need.toFixed(1)}s — reel goes silent early (nothing aborts on this)`);
    else add('PASS', 'verif_carrier.mp4', `audio ${s.aDur.toFixed(1)}s (${need.toFixed(1)}s used${INTRO_ACTIVE ? ', intro-shifted' : ''})`);
  }
  const e = exists('verif_endcard.mp4');
  if (e) {
    const s = streams(e);
    if (!Number.isFinite(s.vDur) || s.vDur < 2.5) add('FAIL', 'verif_endcard.mp4', `video ${s.vDur?.toFixed(1)}s < 2.5s tail window`);
    else add('PASS', 'verif_endcard.mp4', `video ${s.vDur.toFixed(1)}s (last 2.5s + tail frame used; audio not used)`);
    if (s.h < 1920) add('WARN', 'verif_endcard.mp4', `${s.w}x${s.h} — will be upscaled to 1080x1920`);
  }
}

// MKT-11: panels render INSIDE the app's pick-detail modal during capture, so
// they are not a video layer — what must hold is that the app can load them
// (published under public/) and that their copy is still cleared. Clearance is
// manual and PINNED TO THE FILE HASH, because no OCR exists in-env and OCR
// misses stylized type; a changed PNG voids clearance here rather than shipping.
function checkPanels(): void {
  let usableCount = 0;
  for (const p of PANELS) {
    const src = sourcePath(ASSETS, p);
    if (!existsSync(src)) {
      // Non-blocking by contract: the app drops it from the rotation.
      add('WARN', p.file, `not delivered — dropped from the rotation (${p.label})`);
      continue;
    }
    const cl = clearanceFor(p);
    if (!cl?.sha256) {
      add('FAIL', p.file, 'no clearance hash pinned — review the copy, then run npm run panel:build -- --print-hashes');
      continue;
    }
    const actual = sha256(src);
    if (actual !== cl.sha256) {
      add('FAIL', p.file, `artwork changed since clearance ${cl.cleared} (hash ${actual.slice(0, 12)}… ≠ ${cl.sha256.slice(0, 12)}…) — re-review the copy and re-pin the hash`);
      continue;
    }
    const pub = publicPath(p);
    if (!existsSync(pub)) {
      add('WARN', p.file, `cleared but not published to ${PUBLIC_DIR} — run npm run panel:build (app drops it from the rotation until then)`);
      continue;
    }
    const [w, h] = probe(pub, `-select_streams v:0 -show_entries stream=width,height -of csv=p=0`).split(',').map(Number);
    if (w !== PANEL_W) { add('FAIL', p.file, `published ${w}x${h} — width must be ${PANEL_W}`); continue; }
    usableCount++;
    add('PASS', p.file, `${w}x${h} · cleared ${cl.cleared} · ${p.label}`);
  }
  if (usableCount === 0) {
    add('WARN', 'panels', 'none usable — the modal renders without a panel');
    return;
  }
  if (rotationDegenerate(usableCount)) {
    add('WARN', 'panels', `${usableCount} panels with a ${MODAL_COUNT}-modal stride cycles through only a couple of distinct subsets — add or remove one for daily variety`);
  }
  // The renderer must actually unlock the panel, or the whole lane is inert.
  const renderer = execSync(`grep -c "hm:reel-capture" scripts/render-allday-body.ts || true`, { shell: '/bin/bash' }).toString().trim();
  if (renderer === '0') {
    add('FAIL', 'panels', 'render-allday-body.ts no longer sets hm:reel-capture — panels would silently vanish from every reel');
  }
  // On-disk presence is NOT enough: the app fetches panels over HTTP from the
  // dev server. If Expo is up but not serving public/, every modal renders
  // without a panel and NOTHING errors — the reel just quietly loses them.
  // A dead server is only a WARN: the render itself aborts loudly on connection
  // refused, so that case is already covered and reel:check may legitimately be
  // run before the server is started.
  const usable = available().usable;
  if (httpProbe(`${DEV_BASE}/`).code === 0) {
    add('WARN', 'panels', `dev server unreachable at ${DEV_BASE} — cannot verify panels are actually served (start it before rendering; the render aborts on its own if it is still down)`);
  } else {
    let served = 0;
    for (const p of usable) {
      const rel = `${PANEL_URL_BASE}/${p.file}`;
      const r = httpProbe(`${DEV_BASE}${rel}`);
      if (r.code !== 200) add('FAIL', p.file, `dev server returned HTTP ${r.code} for ${rel} — the modal would render with no panel and nothing would error`);
      else if (!r.type.startsWith('image/')) add('FAIL', p.file, `dev server served content-type "${r.type}" for ${rel} — not an image (public/ probably isn't being served)`);
      else if (r.len < 1024) add('FAIL', p.file, `dev server served only ${r.len} bytes for ${rel}`);
      else served++;
    }
    if (served === usable.length) add('PASS', 'panels', `all ${served} served over HTTP from ${DEV_BASE}${PANEL_URL_BASE}/`);
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const seq = panelSequence(today, usable);
  add('PASS', 'panels', `today's sequence: ${seq.map((p, i) => `${i + 1}·${p.label}`).join('  ')}`);
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

// Intro FIRST — it sets INTRO_ACTIVE, which shifts the carrier VO window.
INTRO_ACTIVE = checkAnchorIntro();
const proCarrier = checkAlldayCarrier('pro');
const freeCarrier = checkAlldayCarrier('free');
checkAlldayEndcard('pro', proCarrier);
checkAlldayEndcard('free', freeCarrier);
checkVerify();
checkPanels();
checkStamp();

const ICON = { PASS: '✅', WARN: '⚠️ ', FAIL: '⛔' } as const;
for (const f of findings) console.log(`${ICON[f.level]} ${f.asset} — ${f.msg}`);
const fails = findings.filter(f => f.level === 'FAIL').length;
const warns = findings.filter(f => f.level === 'WARN').length;
console.log(`\n${fails ? '⛔ NOT SAFE TO ASSEMBLE' : warns ? '✅ safe to assemble (with warnings)' : '✅ all clear'} — ${fails} fail, ${warns} warn`);
if (fails > 0) process.exit(1);
