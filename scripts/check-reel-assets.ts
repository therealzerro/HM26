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
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveCarrier, orphanedParts, audioDur } from './reel-carrier';
import { bedWindow } from './reel-bed';
import { available, sourcePath, builtPath, sha256, clearanceFor } from './reel-panels';
import { PANELS, PANEL_W } from './panel-config';
import { MODAL_COUNT, PANEL_BUCKET, panelUrl, panelSequence, rotationDegenerate } from '../constants/reelPanels';
import { STINGERS, STINGER_DUR, INTRO_XFADE, stingerFile } from './stinger-config';
import { ENDCARDS } from './endcard-config';
import { REEL_SCOPES, SCOPES, reelKind } from './reel-scopes';
import { allIntroFiles, introCandidates } from './anchor-intros';
import { INTRO_MIN, INTRO_MAX } from './reel-intro';

// The app resolves panel URLs from EXPO_PUBLIC_SUPABASE_URL; load it so the
// bucket probe below checks the same origin the app will.
loadEnv({ path: resolve('.env'), quiet: true });

const ASSETS = resolve('assets/marketing');
const OPEN = 1.2, BODY = 19.0, CARD = 6.5; // assembler constants (body measured at runtime; 19.0 = current renderer)
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

/**
 * MKT-08 intro contract, MKT-17 applied to EVERY file the rotation can reach.
 *
 * Checking only the legacy filename was safe when there was one intro. With a
 * rotating set a defective member is worse than a missing one: it drops for the
 * day with a log line nobody reads, and the reel quietly opens on something
 * else. So the split is deliberate —
 *   MISSING  → WARN. The resolver's ordered fallback handles it by design.
 *   DEFECTIVE→ FAIL. "A bad variant must fail preflight rather than silently
 *              degrading a run" (work order).
 *
 * Returns whether the intro lane will be ACTIVE for SLATE reels today, which is
 * what shifts the carrier VO window.
 */
function checkIntros(): boolean {
  const files = allIntroFiles();
  const usable = new Set<string>();

  for (const name of files) {
    const p = join(ASSETS, name);
    if (!existsSync(p)) {
      add('WARN', name, 'not delivered — drops from the intro selection; the resolver falls back (missing is degradable, defective is not)');
      continue;
    }
    const size = statSync(p).size;
    if (size < 100_000) { add('FAIL', name, `file is ${size} bytes — placeholder/corrupt`); continue; }
    const s = streams(p);
    let ok = true;
    if (!s.hasAudio) { add('FAIL', name, 'no audio stream — intro audio is load-bearing before the VO enters'); ok = false; }
    if (!Number.isFinite(s.vDur) || s.vDur < INTRO_MIN || s.vDur > INTRO_MAX) {
      add('FAIL', name, `video ${s.vDur?.toFixed(2)}s outside the ${INTRO_MIN}-${INTRO_MAX}s intro window — the generator's 10s preset is the usual cause; trim it`);
      ok = false;
    }
    if (s.w < 720 || s.h < 1280) { add('FAIL', name, `${s.w}x${s.h} — below the 720x1280 minimum`); ok = false; }
    const spread = tailLumaSpread(p);
    if (spread > 170) { add('FAIL', name, `final 0.5s luma spread ${spread.toFixed(0)} — not near-uniform smoke; the dissolve into the UI will pop`); ok = false; }
    if (!ok) continue;

    usable.add(name);
    // Reel total = intro + stinger(2.7 after its crossfade) + body(19.0) + outro(6.5).
    add('PASS', name, `video ${s.vDur.toFixed(2)}s · audio ${s.aDur.toFixed(2)}s · tail spread ${spread.toFixed(0)} — slate reel ${(s.vDur + 28.2).toFixed(2)}s`);
    if (s.h < 1920) add('WARN', name, `${s.w}x${s.h} — will be upscaled to 1080x1920`);
    if (s.fps < 30) add('WARN', name, `${s.fps.toFixed(0)}fps — duplicated to 60fps`);
    if (spread > 120) add('WARN', name, `final 0.5s luma spread ${spread.toFixed(0)} — dissolve source is busy (target: full-frame smoke)`);
  }

  // What actually plays today, per kind — the run-summary line the operator
  // reads. Resolved from the same registry the assembler uses, so it cannot
  // disagree with what gets built.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const shown: string[] = [];
  let slateActive = false;
  for (const kind of ['allday_pro', 'verify', 'allday_public']) {
    const pick = introCandidates(kind, today).find(c => usable.has(c.file));
    shown.push(`${kind} → ${pick ? `${pick.file} [${pick.label}]` : 'LEGACY OPEN'}`);
    if (kind === 'allday_pro' && pick) slateActive = true;
  }
  add('PASS', 'intro selection', `today (${today}): ${shown.join('  ·  ')}`);
  return slateActive;
}

/**
 * MKT-16 lesson, generalised: a carrier part whose name ALMOST matches the
 * multi-part pattern is a silent-drop class. `public_carrier_pt_.mp4` matched
 * neither `carrierParts` (`_pt2`…`_ptN`) nor `orphanedParts` (same pattern), so
 * it would have been dropped with preflight still reporting a healthy
 * single-file carrier. That is the second silent-drop this system has had, so
 * near-miss names are now a hard FAIL.
 */
function checkPartNaming(): void {
  const bad = readdirSync(ASSETS).filter(f => /_pt/i.test(f) && !/_pt\d+\.mp4$/.test(f));
  for (const f of bad) {
    add('FAIL', f, 'name contains "_pt" but does not match _pt<N>.mp4 — invisible to BOTH the joiner and the orphan scan, so its audio would be silently dropped. Rename it.');
  }
}

/**
 * Files nothing reads, on purpose. Listed WITH a reason so the exemption is
 * visible in the run summary instead of being an invisible allowlist that rots.
 * Remove an entry the moment its reason expires.
 */
const UNREFERENCED_OK: Record<string, string> = {
  'anchor_intro_powerup.mp4':
    'REJECTED by MKT-17 — never reaches full-frame smoke (5.6-6.5s is smoke inside a phone, bezel still framing it). Awaiting regeneration with the camera pushing fully into the screen.',
  'public_carrier.mp4': 'MKT-16 public cut — delivered, kind not registered yet (Phase 1 pending).',
  'public_carrier_pt2.mp4': 'MKT-16 public cut — part 2 of the above.',
  'watermark_source.mp4': 'MKT-14 source, parked with the lane.',
};

/** Preserved generation masters and pre-swap backups — structurally unread. */
const ARCHIVE_RE = /(_master(_\d+s)?|_backup)\.mp4$/i;

/**
 * Stray-asset scan — the general form of the `_pt_` failure above.
 *
 * Every other check in this file starts from a REGISTRY and asks "is the file
 * it names healthy?". That direction cannot see a file the registries never
 * name, so a delivery landing as `allday_pro_endcard_final.mp4` produces a
 * clean preflight and a reel built from the previous week's endcard. Four
 * near-miss classes share that shape — endcard, stinger, carrier and intro —
 * and one is worse: if BOTH the carrier and endcard of a kind are misnamed,
 * checkScopes() reports it as healthy-DORMANT rather than missing.
 *
 * So this scans the other way: enumerate every filename the registries can
 * produce, diff it against what is on disk, and report the remainder. WARN not
 * FAIL — an unread file breaks nothing today; it means an asset was delivered
 * and is not reaching a reel, which is a question for the operator, not a
 * reason to block the daily run.
 */
function checkStrays(): void {
  const referenced = new Set<string>();

  for (const v of Object.values(ENDCARDS)) { referenced.add(v.out); referenced.add(v.motion); }
  for (const [variant, cfg] of Object.entries(STINGERS)) {
    // Disabled variants included deliberately: a prebuilt stinger for a kind
    // whose flag is currently off is intended to sit there, not a stray.
    referenced.add(stingerFile(variant));
    referenced.add(cfg.motion);
  }
  const carrierBases = [
    ...SCOPES.flatMap(s => REEL_SCOPES[s].variants.map(v => `${reelKind(s, v)}_carrier`)),
    'verif_carrier',
  ];
  for (const base of carrierBases) {
    referenced.add(`${base}.mp4`);
    for (let n = 2; n <= 9; n++) referenced.add(`${base}_pt${n}.mp4`);
  }
  for (const f of allIntroFiles()) referenced.add(f);

  const known: string[] = [];
  for (const f of readdirSync(ASSETS)) {
    if (!f.endsWith('.mp4') || referenced.has(f) || ARCHIVE_RE.test(f)) continue;
    const reason = UNREFERENCED_OK[f];
    if (reason) { known.push(`${f} — ${reason}`); continue; }
    add('WARN', f, 'no registry references this file — it is delivered but reaches no reel. A near-miss filename (endcard/stinger/carrier/intro) lands here instead of erroring, so check the spelling against the registry; if it is deliberate, add it to UNREFERENCED_OK with a reason.');
  }
  for (const k of known) add('PASS', 'unreferenced (known)', k);

  // Same scan for panel source art, whose registry is PANELS.
  const panelDir = join(ASSETS, 'panels');
  if (existsSync(panelDir)) {
    const namedPanels = new Set(PANELS.map(p => p.file));
    for (const f of readdirSync(panelDir)) {
      if (!f.endsWith('.png') || namedPanels.has(f)) continue;
      add('WARN', `panels/${f}`, 'not in the panel registry — it will never enter the rotation. Add it to REEL_PANELS (with a clearance hash) or remove it.');
    }
  }
}

function checkSlateEndcard(kind: string, carrierDur: number | null): void {
  const name = `${kind}_endcard.mp4`;
  const p = exists(name);
  if (!p) return;
  const s = streams(p);
  if (!Number.isFinite(s.vDur) || s.vDur < CARD) return add('FAIL', name, `video ${s.vDur?.toFixed(1)}s < ${CARD}s outro window`);
  if (!s.hasAudio) return add('FAIL', name, 'no audio stream — assembler filter graph requires one');
  // Audio requirement mirrors the assembler abort: the outro always needs CARD.
  // MKT-10: the bed palindrome-fills from a fixed window, so a short carrier
  // no longer inflates the requirement — only the window itself must exist.
  const needsBed = carrierDur != null && carrierDur < voiceWindow() - 0.05;
  const audioNeed = CARD;
  if (s.aDur + 0.05 < audioNeed) return add('FAIL', name, `audio ${s.aDur.toFixed(1)}s < required ${audioNeed.toFixed(1)}s (outro/bed)`);
  add('PASS', name, `video ${s.vDur.toFixed(1)}s · audio ${s.aDur.toFixed(1)}s (need ${audioNeed.toFixed(1)}s)`);
  if (s.h < 1920) add('WARN', name, `${s.w}x${s.h} — will be upscaled to 1080x1920 (deliver native 1080x1920 for full sharpness)`);
  if (s.fps < 30) add('WARN', name, `${s.fps.toFixed(0)}fps — assembler duplicates to 60fps (motion slightly steppy; 30-60fps source preferred)`);
  const crack = peakDb(p, 0, CARD);
  if (crack < -12) add('WARN', name, `no strong transient in first ${CARD}s (peak ${crack.toFixed(1)}dB) — bolt-snap crack may be missing/weak`);
  // MKT-10: the bed window is DERIVED from this file, so the check is no longer
  // "does the crack avoid a fixed window" but "does a usable window exist at
  // all". Null means the crack is too early or the audio decays away — the
  // assembler aborts rather than replaying the bolt snap under the modals.
  if (needsBed) {
    const bed = bedWindow(p, CARD);
    if (!bed) {
      add('FAIL', name, `no usable hum-bed window (loudest transient at ${peakDb(p, 0, CARD).toFixed(1)}dB leaves no crack-free, level-steady stretch) — this variant needs a wall-to-wall carrier, not a shorter one`);
    } else {
      add('PASS', name, `hum bed ← ${bed.mode}-crack ${bed.start}-${bed.end}s · crack measured at ${bed.crackAt}s · mean ${bed.rms}dB`);
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

function checkSlateCarrier(kind: string): number | null {
  const base = `${kind}_carrier`;
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
    const built = builtPath(ASSETS, p);
    if (!existsSync(built)) {
      add('WARN', p.file, `cleared but not built — run npm run panel:build (app drops it from the rotation until then)`);
      continue;
    }
    const [w, h] = probe(built, `-select_streams v:0 -show_entries stream=width,height -of csv=p=0`).split(',').map(Number);
    if (w !== PANEL_W) { add('FAIL', p.file, `built ${w}x${h} — width must be ${PANEL_W}`); continue; }
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
  // On-disk presence is NOT enough: the APP loads panels from the public
  // `app-panels` bucket, so a panel can be built locally and still be missing
  // or stale in the bucket — in which case every user sees an empty slot and
  // nothing errors. Compare the served bytes against the local build.
  const usable = available(ASSETS).usable;
  const probeUrl = panelUrl(usable[0]?.file ?? '');
  if (!probeUrl) {
    add('WARN', 'panels', 'EXPO_PUBLIC_SUPABASE_URL not set — cannot verify the bucket; the app resolves panel URLs from it at runtime');
  } else if (httpProbe(probeUrl).code === 0) {
    add('WARN', 'panels', `${PANEL_BUCKET} bucket unreachable — cannot verify what the app will serve`);
  } else {
    let served = 0;
    for (const p of usable) {
      const u = panelUrl(p.file)!;
      const r = httpProbe(u);
      const localBytes = statSync(builtPath(ASSETS, p)).size;
      if (r.code !== 200) add('FAIL', p.file, `bucket returned HTTP ${r.code} — every user would see an empty panel slot and nothing would error`);
      else if (!r.type.startsWith('image/')) add('FAIL', p.file, `bucket served content-type "${r.type}" — not an image`);
      else if (Math.abs(r.len - localBytes) > 1024) add('FAIL', p.file, `bucket copy is ${r.len} bytes but the local build is ${localBytes} — STALE, re-run npm run panel:build to republish`);
      else served++;
    }
    if (served === usable.length) add('PASS', 'panels', `all ${served} served from the ${PANEL_BUCKET} bucket and byte-matching the local build`);
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

/**
 * MKT-12: a stinger that is configured-and-enabled but never built assembles
 * SILENTLY without branding (probeStinger never throws, by design). That is the
 * right runtime behaviour and the wrong preflight behaviour — the daily run
 * would just quietly lose the brand beat — so surface it here.
 */
function checkStingers(): void {
  for (const [variant, cfg] of Object.entries(STINGERS)) {
    if (!cfg.enabled) continue;
    const file = stingerFile(variant);
    const p = join(ASSETS, file);
    if (!existsSync(p)) {
      add('WARN', file, `enabled for ${variant} but not built — run npm run stinger:build ${variant} (the reel assembles without the branded beat)`);
      continue;
    }
    if (statSync(p).size < 100_000) { add('FAIL', file, `${statSync(p).size} bytes — placeholder/corrupt`); continue; }
    const s = streams(p);
    if (!Number.isFinite(s.vDur) || s.vDur < STINGER_DUR - 0.05) {
      add('FAIL', file, `video ${s.vDur?.toFixed(1)}s < the ${STINGER_DUR}s window the assembler trims to`);
    } else if (!s.hasAudio) {
      add('FAIL', file, 'no audio stream — the stinger impact is load-bearing');
    } else {
      add('PASS', file, `video ${s.vDur.toFixed(1)}s · "${cfg.lines[1]}" — adds ${(STINGER_DUR - INTRO_XFADE).toFixed(1)}s to ${variant}`);
    }
  }
}

/**
 * MKT-13: every scope × variant the assemblers can build.
 *
 * DORMANT-SAFE, same contract as the MKT-08 intro and MKT-09 parts: a scope with
 * NO assets delivered is a note, not a failure — otherwise adding the session
 * registry would have started failing the daily All-Day preflight for assets
 * nobody has yet. A scope with SOME assets is checked in full, so a half
 * delivery is still a loud FAIL rather than a silent half-reel.
 */
function checkScopes(): void {
  for (const scope of SCOPES) {
    for (const v of REEL_SCOPES[scope].variants) {
      const kind = reelKind(scope, v);
      const hasCarrier = existsSync(join(ASSETS, `${kind}_carrier.mp4`));
      const hasEndcard = existsSync(join(ASSETS, `${kind}_endcard.mp4`));
      if (!hasCarrier && !hasEndcard) {
        add('PASS', kind, `no assets delivered — dormant (npm run reel:${scope} would abort until a carrier + endcard land)`);
        continue;
      }
      const carrier = checkSlateCarrier(kind);
      checkSlateEndcard(kind, carrier);
    }
  }
}

// Intro FIRST — it sets INTRO_ACTIVE, which shifts the carrier VO window.
INTRO_ACTIVE = checkIntros();
checkPartNaming();
checkStrays();
checkScopes();
checkStingers();
checkVerify();
checkPanels();
checkStamp();

const ICON = { PASS: '✅', WARN: '⚠️ ', FAIL: '⛔' } as const;
for (const f of findings) console.log(`${ICON[f.level]} ${f.asset} — ${f.msg}`);
const fails = findings.filter(f => f.level === 'FAIL').length;
const warns = findings.filter(f => f.level === 'WARN').length;
console.log(`\n${fails ? '⛔ NOT SAFE TO ASSEMBLE' : warns ? '✅ safe to assemble (with warnings)' : '✅ all clear'} — ${fails} fail, ${warns} warn`);
if (fails > 0) process.exit(1);
