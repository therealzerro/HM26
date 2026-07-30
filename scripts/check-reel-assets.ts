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
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveCarrier, undeclaredParts, carrierCandidates, audioDur, OVERLAP_EPSILON, carrierBoundarySlack, BOUNDARY_WARN_AT } from './reel-carrier';
import { CARRIERS, allCarrierFiles, PART1_DUR_TOLERANCE } from './carrier-config';
import { bedWindow } from './reel-bed';
import { available, sourcePath, builtPath, sha256, clearanceFor } from './reel-panels';
import { PANELS, PANEL_W } from './panel-config';
import { MODAL_COUNT, PANEL_BUCKET, panelUrl, panelSequence, rotationDegenerate } from '../constants/reelPanels';
import { STINGERS, STINGER_DUR, INTRO_XFADE, stingerFile } from './stinger-config';
import { ENDCARDS } from './endcard-config';
import {
  stingerMotionSetFor, ENDCARD_MOTIONS, allMotionFiles, tierFor,
  builtEndcardName, builtStingerName, readMotionMeta, VERIFY_SEAL_MOTION,
} from './brand-motion';
import { endcardCandidates } from './reel-endcard';
import { stingerCandidates } from './reel-stinger';
import { REEL_SCOPES, SCOPES, reelKind, captureModeFor } from './reel-scopes';
import { allIntroFiles, introCandidates } from './anchor-intros';
import { INTRO_MIN, INTRO_MAX } from './reel-intro';

// The app resolves panel URLs from EXPO_PUBLIC_SUPABASE_URL; load it so the
// bucket probe below checks the same origin the app will.
loadEnv({ path: resolve('.env'), quiet: true });

const ASSETS = resolve('assets/marketing');
/** ET date, no clock — the same basis the rotations use, so the reported
 *  selection is what a run this morning actually resolves. */
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
 * Ratio of the darker outer edge column to the centre, over the final 0.5s.
 *
 * Blind spot this exists to cover: `tailLumaSpread` measures UNIFORMITY, and
 * smoke rendered inside a phone screen is just as uniform as smoke filling the
 * frame — `anchor_intro_powerup` measured 105 at its candidate out-point,
 * comfortably inside the ≤120 pass band, while every frame still had the
 * handset bezel and notch around it. Dissolving from that would ghost a phone
 * outline through the UI body. The spread check cannot see it; a dark border
 * can be seen, because a bezel is two near-black columns the centre does not
 * have.
 *
 * Measured at each intro's own dissolve bed: powerup 0.41 (out 6.0s) / 0.36
 * (6.5s) against standard 1.17, public 0.90, deadpan 0.75.
 */
function tailEdgeRatio(file: string): number {
  const y = (crop: string): number => {
    const out = execSync(
      `ffmpeg -sseof -0.5 -i "${file}" -vf "crop=${crop},signalstats,metadata=print" -f null - 2>&1 | grep -oE "YAVG=[0-9.]+" || true`,
      { shell: '/bin/bash' },
    ).toString();
    const v = [...out.matchAll(/YAVG=([\d.]+)/g)].map(m => parseFloat(m[1]));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
  };
  const centre = y('iw*0.5:ih*0.5:iw*0.25:ih*0.25');
  if (!Number.isFinite(centre) || centre <= 0) return 1;
  const edge = Math.min(y('iw*0.04:ih:0:0'), y('iw*0.04:ih:iw*0.96:0'));
  return Number.isFinite(edge) ? edge / centre : 1;
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
    // WARN, never FAIL: this is a heuristic tuned against ONE known-bad file,
    // and a legitimately dark-edged smoke frame would trip it. It asks for the
    // eye check that actually caught powerup — it does not substitute for it.
    const edge = tailEdgeRatio(p);
    if (edge < 0.6) {
      add('WARN', name, `dissolve bed is ${(edge * 100).toFixed(0)}% as bright at the edges as at the centre (passing intros: 75-117%) — the smoke may be INSIDE a device frame rather than filling the frame. The luma-spread check cannot see this. Look at the last frame: if a bezel is visible it will ghost through the UI body and the clip needs regenerating, not trimming.`);
    }
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
  // MKT-16 (2026-07-30): public_carrier.mp4 + _pt2 left this list — they are
  // registered under allday_public in carrier-config.ts and are now validated
  // like every other carrier pair.
  'watermark_source.mp4': 'MKT-14 source, parked with the lane.',
  // MKT-21 — the generated-body class, assessed and REJECTED 2026-07-29. Listed
  // so four warnings read as a decision rather than a backlog, the same way
  // anchor_intro_powerup does. Deliberately NOT deleted: they are the evidence
  // for the ruling, and a future proposal to retry generated bodies should be
  // able to look at what actually came back.
  'public_body_pt1.mp4':
    'MKT-21 REJECTED — seven-segment readout legible 6.9-8.0s (reads 8.18), plus SYSTEM CONFIDENCE percentages and gibberish labels (NOWQ, CONSEET). Fails the any-legible-numeral standard. NB it would likely PASS the coded Q1/Q2 — 8.18 is not a 3-digit number — which is why the gate is not the control here.',
  'public_body_pt2.mp4':
    'MKT-21 REJECTED — first 4s render an investment-return dashboard (True Nots 5064, $61,1.82, +12.79% in gain-green), the four blocking terms (STRAIGHT, BOX, PLAY, digit rows) and a baked date (Jul 29, 2026 at 4:48 AM). Fails Q1 and Q2. Only ~5.0-10.0s of it is clean.',
  'group_body_pt1.mp4':
    'MKT-21 REJECTED — fabricated digits that DRIFT between frames (BOX SET {1,7,8}->{1,8,8}->{2,9,9}), STRAIGHT and BOX on screen. Named "group" but intended for CROSS-POST, where both Two-Question answers must be NO; fails both.',
  'group_body_pt2.mp4':
    'MKT-21 REJECTED — byte-identical to public_body_pt2 (placeholder made when generation budget ran out), so it inherits every failure above.',
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

  for (const [kind, v] of Object.entries(ENDCARDS)) {
    referenced.add(v.out);        // pre-MKT-19 unversioned build (resolver's last resort)
    referenced.add(v.motion);
    // MKT-19: the built matrix. Derived with builtEndcardName from the registry
    // `out` field — the SAME call the resolver uses — so the expected set cannot
    // disagree with what the assembler reads. Constructing these independently
    // is how checkStrays would start reporting phantom strays for verify.
    for (const m of ENDCARD_MOTIONS[tierFor(kind)]) referenced.add(builtEndcardName(v.out, m.tag));
  }
  for (const m of allMotionFiles()) referenced.add(m);
  for (const [variant, cfg] of Object.entries(STINGERS)) {
    // Disabled variants included deliberately: a prebuilt stinger for a kind
    // whose flag is currently off is intended to sit there, not a stray.
    referenced.add(stingerFile(variant));   // pre-MKT-19 unversioned build
    referenced.add(cfg.motion);
    // Per-kind set: verify's includes its pinned seal (MKT-29).
    for (const m of stingerMotionSetFor(variant)) referenced.add(builtStingerName(variant, m.tag));
  }
  // MKT-20: enumerate the carrier REGISTRY — every part-1 rotation member plus
  // each kind's shared continuation. Deliberately NOT the old `_pt2…_pt9` sweep
  // per base: that swept name space pre-blessed any continuation number, so an
  // undeclared `_pt3` counted as referenced and reached no reel silently. It is
  // now a stray here and a FAIL in checkCarrierSet.
  for (const f of allCarrierFiles()) referenced.add(f);
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

/**
 * MKT-19 — check EVERY built endcard the rotation can reach, not just today's.
 *
 * Checking only the resolved pick would leave tomorrow's endcard unvalidated
 * until tomorrow, which is a preflight that finds a defect on the morning it
 * ships rather than the morning before. Same MKT-17 asymmetry: MISSING is a WARN
 * (the ordered resolver walks past it) but DEFECTIVE is a FAIL, because a
 * defective member drops the day it comes up, with a log line nobody reads.
 */
function checkSlateEndcard(kind: string, carrierDur: number | null): void {
  const spec = ENDCARDS[kind];
  if (!spec) return;
  const needsBed = carrierDur != null && carrierDur < voiceWindow() - 0.05;
  const meta = readMotionMeta(ASSETS);
  const set = ENDCARD_MOTIONS[tierFor(kind)];
  // Bed viability is a property of the MOTION and is what the resolver filters
  // on, so a build-up motion must not be failed for lacking a bed on a hum-bed
  // day — it correctly drops out. Only the motions the resolver could actually
  // land on get the bed requirement applied.
  const bedViable = (m: { file: string }) => meta[m.file]?.bedUsable !== false;
  for (const m of set) {
    const built = builtEndcardName(spec.out, m.tag);
    if (!existsSync(join(ASSETS, built))) {
      add('WARN', built, `not built — ${m.label} drops from ${kind}'s rotation on the days it comes up. Run npm run endcard:build ${kind}`);
      continue;
    }
    checkOneEndcard(kind, built, needsBed && bedViable(m), needsBed && !bedViable(m) ? m.label : null);
  }
  // The pre-MKT-19 unversioned build is the resolver's last resort, so it is
  // still load-bearing while it exists and is still checked.
  if (existsSync(join(ASSETS, spec.out))) checkOneEndcard(kind, spec.out, needsBed, null);

  // What this kind actually closes on today — same candidate ordering the
  // assembler walks, taken from the resolver rather than re-derived here.
  const cands = endcardCandidates(ASSETS, kind, TODAY, needsBed) ?? [];
  const pick = cands.find(c => existsSync(join(ASSETS, c.name)));
  if (pick) {
    add('PASS', `${kind} endcard selection`, `today (${TODAY}): ${pick.name} [${pick.motion.label}]${needsBed ? ' · bed-aware (short carrier)' : ''}`);
  } else {
    add('FAIL', `${kind} endcard selection`, `nothing resolves — tried ${cands.map(c => c.name).join(', ')}. A reel cannot assemble without a close; the assembler will abort. Run npm run endcard:build ${kind}`);
  }
}

/**
 * `bedExempt` names the motion when a hum-bed day is expected to skip this file
 * rather than require a bed of it — reported so the drop is visible, not silent.
 */
function checkOneEndcard(kind: string, name: string, needsBed: boolean, bedExempt: string | null): void {
  const p = exists(name);
  if (!p) return;
  const s = streams(p);
  if (!Number.isFinite(s.vDur) || s.vDur < CARD) return add('FAIL', name, `video ${s.vDur?.toFixed(1)}s < ${CARD}s outro window`);
  if (!s.hasAudio) return add('FAIL', name, 'no audio stream — assembler filter graph requires one');
  // Audio requirement mirrors the assembler abort: the outro always needs CARD.
  // MKT-10: the bed palindrome-fills from a fixed window, so a short carrier
  // no longer inflates the requirement — only the window itself must exist.
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
  if (bedExempt) {
    add('PASS', name, `no hum bed by design (${bedExempt} is a build-up) — MKT-19 drops it from ${kind}'s rotation on this short-carrier day rather than aborting`);
  } else if (needsBed) {
    const bed = bedWindow(p, CARD);
    if (!bed) {
      add('FAIL', name, `no usable hum-bed window (loudest transient at ${peakDb(p, 0, CARD).toFixed(1)}dB leaves no crack-free, level-steady stretch) — this variant needs a wall-to-wall carrier, not a shorter one`);
    } else {
      add('PASS', name, `hum bed ← ${bed.mode}-crack ${bed.start}-${bed.end}s · crack measured at ${bed.crackAt}s · mean ${bed.rms}dB`);
    }
  }
}

// MKT-09's `checkCarrierParts` was removed by MKT-20. It existed to report the
// derived join and to surface parts orphaned behind a gap — both of which were
// artefacts of derive-by-name. Under explicit pairing there is no gap to fall
// behind: the join is reported by checkSlateCarrier against the day's resolved
// part 1, and a continuation the config does not declare is caught by
// `undeclaredParts` as a FAIL rather than being silently swept up by a
// `_pt2…_pt9` name sweep. Verified by injection, not assumed (see MKT-20).

/**
 * MKT-20 — validate EVERY part 1 in a kind's set, plus the shared continuation.
 *
 * Three jobs, and the first two are new. (a) Every rotation member is checked,
 * not just the one today draws, for the same reason as the endcard matrix: a
 * defect found on the morning it ships is a preflight that ran too late.
 * (b) The DURATION INVARIANT is asserted — every part 1 in a set must be the
 * same length, because the continuation's offset in the join is part 1's FILE
 * duration. A variant delivered longer or shorter shifts the VO ceiling on the
 * one morning in four that it plays, and looks like nothing on the other three.
 * (c) The shared continuation is REQUIRED where declared: missing it does not
 * shorten the reel, it converts the run to hum-bed mode and publishes half a
 * narration, so it fails here rather than at assembly.
 */
function checkCarrierSet(kind: string): void {
  const spec = CARRIERS[kind];
  if (!spec) return;
  // Undeclared `_ptN` — MKT-09's orphan guard, re-pointed at explicit pairing.
  for (const f of undeclaredParts(ASSETS, kind)) {
    add('FAIL', f, `named as a continuation but NOT declared in carrier-config.ts for ${kind} — explicit pairing means it will simply never be read, and the reel ships missing that narration. Add it to the kind's \`rest\`, or rename it.`);
  }
  for (const f of spec.rest) {
    if (!existsSync(join(ASSETS, f))) {
      add('FAIL', f, `declared continuation for ${kind} is MISSING. This does not merely shorten the carrier: it drops the reel below the ${voiceWindow().toFixed(2)}s overlap threshold, engages hum-bed mode, and publishes a reel with roughly half its narration replaced by hum — with nothing erroring. Deliver it or remove it from carrier-config.ts.`);
    }
  }
  // Duration invariant, asserted against entry 0 (the incumbent) rather than a
  // hardcoded 10.005 so a future set delivered at another length still holds.
  //
  // NOTE the deliberate use of raw existsSync rather than the shared `exists()`
  // helper: that helper REPORTS a missing file as a FAIL, which is right for a
  // singleton asset and wrong for a rotation member. A missing member is a WARN
  // by contract — the resolver walks past it — and routing it through `exists()`
  // emitted both a FAIL and the WARN, blocking the run on an asset whose whole
  // point is to be optional. Caught by injection, not by reading.
  const refPath = spec.set[0] ? join(ASSETS, spec.set[0].file) : '';
  const refDur = refPath && existsSync(refPath) ? audioDur(refPath) : NaN;
  for (const v of spec.set) {
    const p = join(ASSETS, v.file);
    if (!existsSync(p)) {
      add('WARN', v.file, `not delivered — "${v.label}" drops from ${kind}'s rotation on the days it comes up; the next candidate is used`);
      continue;
    }
    // Corrupt/placeholder IS a hard failure even for an optional member: it
    // resolves as present and then produces a broken reel (MKT-06's 2-byte
    // endcard). Only ABSENCE is the tolerated state.
    const size = statSync(p).size;
    if (size < 100_000) { add('FAIL', v.file, `file is ${size} bytes — placeholder/corrupt`); continue; }
    const s = streams(p);
    if (!s.hasAudio) { add('FAIL', v.file, 'no audio stream — the carrier IS the voiceover'); continue; }
    const d = audioDur(p);
    if (Number.isFinite(refDur) && Math.abs(d - refDur) > PART1_DUR_TOLERANCE) {
      add('FAIL', v.file, `${d.toFixed(3)}s against the set's ${refDur.toFixed(3)}s (${spec.set[0].file}). Every part 1 in a set must match: the continuation's offset is part 1's FILE duration, so this variant silently moves the VO ceiling on the days it plays and looks correct on every other day.`);
    } else {
      add('PASS', v.file, `${d.toFixed(3)}s · "${v.label}"${spec.set.length > 1 ? ` — ${kind} rotation member` : ''}`);
    }
  }
  const pick = carrierCandidates(kind, TODAY).find(v => existsSync(join(ASSETS, v.file)));
  add(
    pick ? 'PASS' : 'FAIL',
    `${kind} carrier selection`,
    pick
      ? `today (${TODAY}): ${pick.file} [${pick.label}]${spec.rest.length ? ` + ${spec.rest.join(' + ')}` : ' (single part)'}`
      : `nothing resolves — the carrier IS the voiceover, so the assembler will abort. Deliver ${spec.set[0]?.file ?? 'a part 1'}.`,
  );
}

function checkSlateCarrier(kind: string): number | null {
  const spec = CARRIERS[kind];
  if (!spec) return null;
  checkCarrierSet(kind);
  // Validate what the assembler will ACTUALLY read for today — the join, using
  // today's resolved part 1, not the incumbent. Checking part 1 alone would
  // clear a carrier whose narration overruns the ceiling only after the join.
  const pick = carrierCandidates(kind, TODAY).find(v => existsSync(join(ASSETS, v.file)));
  if (!pick) return null;
  if (spec.rest.some(f => !existsSync(join(ASSETS, f)))) return null;  // already FAILed above
  const res = resolveCarrier(ASSETS, kind, TODAY);
  const p = res.path;
  let name = pick.file;
  if (res.joined) {
    add('PASS', name, `${res.parts.length} parts joined (${res.parts.map(x => x.split('/').pop()).join(' + ')}) — ${res.parts.map(x => audioDur(x).toFixed(1) + 's').join(' + ')}`);
    name = `${pick.file} + parts`;
  }
  const s = streams(p);
  if (!s.hasAudio) { add('FAIL', name, 'no audio stream — the carrier IS the voiceover'); return null; }
  const dur = s.aDur;
  const overlap = dur >= voiceWindow() - OVERLAP_EPSILON;
  const voiceSpan = overlap ? Math.min(dur - 0.1, voiceHardEnd()) : Math.min(dur - 0.2, voiceWindow());
  const mode = overlap ? `overlap (voice 0-${voiceSpan.toFixed(1)}s of carrier, wall-to-wall)` : `hum-bed (voice 0-${voiceSpan.toFixed(1)}s of carrier, endcard hum beds the rest)`;
  add('PASS', name, `audio ${dur.toFixed(1)}s → ${mode}${INTRO_ACTIVE ? ' · intro-shifted window' : ''}`);
  // MKT-21: proximity to the overlap/hum-bed flip. Thin slack is not a defect
  // today, but it means the mode is decided by a tie rather than a margin, and
  // a flip halves the narration with nothing else reporting it.
  const slack = carrierBoundarySlack(dur, voiceWindow());
  if (Math.abs(slack) < BOUNDARY_WARN_AT) {
    add('WARN', name, `only ${Math.abs(slack).toFixed(4)}s from the overlap/hum-bed boundary (threshold ${(voiceWindow() - OVERLAP_EPSILON).toFixed(3)}s) — "${overlap ? 'overlap' : 'hum-bed'}" is decided on a tie. A re-encode, a container rewrite or a slightly longer body would flip the reel into the other mode silently.`);
  }
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
  checkCarrierSet('verify');
  const c0 = exists('verif_carrier.mp4');
  if (c0) {
    // ⚠ THERE IS NO SINGLE "NEED" FOR VERIFY ANY MORE (MKT-27). This asserted a
    // flat 9.2s, which was true while the body was a fixed 6.3s. The body is now
    // 8.6-14.0s built from the row selection, so the need is bodyDur+2.9 =
    // 11.5-16.9s and preflight CANNOT know which — the body has not been
    // rendered when this runs.
    //
    // So the check stops pretending to verify coverage and verifies the two
    // things it actually can: that part 1 exists with audio at roughly its
    // declared length, and that a declared continuation joins. The coverage
    // PICTURE is reported rather than asserted, because on short days the
    // uncovered tail is a deliberate ruling and failing on it would be noise.
    // The assembler prints the real number for the day it builds.
    const resolved = resolveCarrier(ASSETS, 'verify', TODAY);
    const s = streams(resolved.path);
    const P1_FLOOR = 9.0;
    if (!s.hasAudio) add('FAIL', 'verif_carrier.mp4', 'no audio stream — it supplies the reel soundtrack after the intro');
    else if (!resolved.joined && s.aDur + 0.05 < P1_FLOOR) {
      add('FAIL', 'verif_carrier.mp4', `audio ${s.aDur.toFixed(1)}s < ${P1_FLOOR.toFixed(1)}s — part 1 is short, the opening beats go silent`);
    } else {
      // Mirrors resolveCarrier's fits-whole gate: the join is used only when the
      // day's window can take it whole.
      const bodyCovered = +(s.aDur - 2.9).toFixed(1);
      add('PASS', 'verif_carrier.mp4',
        `audio ${s.aDur.toFixed(2)}s${resolved.joined ? ` (joined: ${resolved.parts.map(p => p.split('/').pop()).join(' + ')})` : ' (part 1 alone)'}` +
        ` — fully covers a body up to ${bodyCovered.toFixed(1)}s; longer bodies play the remainder in silence, ` +
        `and on days the window cannot take the join whole the continuation is dropped (MKT-27)`);
    }
    // The SHORT sign-off slot: optional by design, so absence is a WARN with
    // its reason, never a FAIL — the lane it upgrades already ships without it.
    for (const f of CARRIERS.verify.restShort ?? []) {
      // NOT exists(): that helper FAILs on absence, and the short slot is
      // optional by design — absence is a WARN with its budget-gated reason.
      if (!existsSync(join(ASSETS, f))) {
        add('WARN', f, 'declared but not delivered (budget-gated) — 0-straight days close in ~5.7s of silence until it lands');
        continue;
      }
      const e = join(ASSETS, f);
      const ss = streams(e);
      if (!ss.hasAudio) add('FAIL', f, 'no audio stream — the short sign-off IS audio');
      else if (ss.aDur > 5.0) add('FAIL', f, `audio ${ss.aDur.toFixed(2)}s — the short slot exists to fit windows the 16.02s full join cannot; trim to speech (~3.0s), master kept, same convention as verif_carrier_pt2`);
      else add('PASS', f, `audio ${ss.aDur.toFixed(2)}s — short sign-off; used when the full join cannot fit the day's window`);
    }
  }
  // MKT-19 — verify's endcard rotates too, and this was the eighth reader: a
  // hardcoded `verif_endcard.mp4`, the same literal the verify assembler used
  // twice. Left alone it would have validated the unversioned build while the
  // assembler read a motion-tagged one — a green preflight on a file the run
  // never opens, on the single reel whose job is to catch failures. Verify never
  // beds (its soundtrack is verif_carrier), so needsBed is false.
  const cands = endcardCandidates(ASSETS, 'verify', TODAY, false) ?? [];
  for (const c of cands) {
    const e = exists(c.name);
    if (!e) {
      if (!c.legacy) add('WARN', c.name, `not built — ${c.motion.label} drops from verify's rotation on the days it comes up. Run npm run endcard:build verify`);
      continue;
    }
    const s = streams(e);
    if (!Number.isFinite(s.vDur) || s.vDur < 2.5) add('FAIL', c.name, `video ${s.vDur?.toFixed(1)}s < 2.5s tail window`);
    else add('PASS', c.name, `video ${s.vDur.toFixed(1)}s (last 2.5s + tail frame used; audio not used)`);
    if (s.h < 1920) add('WARN', c.name, `${s.w}x${s.h} — will be upscaled to 1080x1920`);
  }
  const pick = cands.find(c => existsSync(join(ASSETS, c.name)));
  add(
    pick ? 'PASS' : 'FAIL',
    'verify endcard selection',
    pick
      ? `today (${TODAY}): ${pick.name} [${pick.motion.label}] — supplies the close and, on the legacy path, the fallback open frame`
      : `nothing resolves — tried ${cands.map(c => c.name).join(', ')}. Run npm run endcard:build verify`,
  );
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
    // ⚠ THE HOLE IN THE MIDDLE OF THE CLEARANCE CHAIN, found 2026-07-29 by
    // walking into it. The chain was: source hash == pinned hash (clearance),
    // and bucket bytes == built bytes (delivery). Both passed, and the artwork
    // being SERVED was still the old copy — because nothing checked that the
    // build was produced from the source that got cleared. Re-pinning a hash
    // without rebuilding therefore produced a fully green preflight while every
    // subscriber still read the superseded panel.
    //
    // FAIL, not WARN: a stale build means the cleared copy is not the copy on
    // screen, which is a clearance violation rather than a missing artifact —
    // and clearance failures are FAILs everywhere else in this function.
    // mtime rather than a content hash because the build re-encodes (crop,
    // feather, resize), so built bytes never equal source bytes by design;
    // freshness is the only comparable property. Same staleness test the
    // carrier join cache uses.
    if (statSync(built).mtimeMs < statSync(src).mtimeMs) {
      add('FAIL', p.file, `built artwork is OLDER than the cleared source — the copy that was reviewed is NOT the copy being served. Run npm run panel:build to rebuild and upload.`);
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
/**
 * MKT-19 — validate every motion in every set, and guard the empty-set edge.
 *
 * Two jobs. First, the same reasoning as the intro set: with rotation a
 * defective member is worse than a missing one, because it degrades a day
 * quietly. Second, and this is the one that can only bite at 08:29 on a
 * short-carrier morning: the bed-aware resolver filters to bed-viable motions
 * when a hum bed is needed, and if a whole TIER has none the filtered set is
 * empty. It currently falls back to the incumbent, which only helps because the
 * pro incumbent happens to have a usable bed — luck, not a guarantee, and it
 * evaporates the day the incumbent is replaced. So assert it here, where it is
 * cheap, rather than discovering it there.
 */
function checkMotions(): void {
  const meta = readMotionMeta(ASSETS);
  for (const f of allMotionFiles()) {
    const p = join(ASSETS, f);
    // A held motion is a deliberate exemption, not a defect — report it with
    // its reason so the hold stays visible instead of reading as a stray.
    if (f === VERIFY_SEAL_MOTION.file && VERIFY_SEAL_MOTION.held) {
      add('WARN', f, `REGISTERED BUT HELD — ${VERIFY_SEAL_MOTION.held}`);
      continue;
    }
    if (!existsSync(p)) { add('WARN', f, 'not delivered — drops from its rotation; the resolver falls back'); continue; }
    if (statSync(p).size < 100_000) { add('FAIL', f, `${statSync(p).size} bytes — placeholder/corrupt`); continue; }
    const st = streams(p);
    if (!st.hasAudio) { add('FAIL', f, 'no audio stream — motion audio is load-bearing (stinger impact / endcard crack)'); continue; }
    const m = meta[f];
    const bedNote = m ? (m.bedUsable ? `bed ok @ ${m.bedRms}dB` : 'NO BED — drops on hum-bed days only') : 'bed not yet derived (run endcard:build)';
    add('PASS', f, `video ${st.vDur.toFixed(2)}s · audio ${st.aDur.toFixed(2)}s · ${bedNote}`);
    if (st.h < 1920) add('WARN', f, `${st.w}x${st.h} — will be upscaled to 1080x1920`);
  }
  // The empty-set guard, per tier.
  for (const tier of ['pro', 'free'] as const) {
    const set = ENDCARD_MOTIONS[tier];
    const delivered = set.filter(m => existsSync(join(ASSETS, m.file)));
    const viable = delivered.filter(m => meta[m.file]?.bedUsable !== false);
    if (!delivered.length) {
      add('FAIL', `${tier} endcard motions`, 'no motion in this tier is delivered — reels of this tier cannot close');
    } else if (!viable.length) {
      add('FAIL', `${tier} endcard motions`, `NONE of the ${delivered.length} delivered motions has a usable hum bed. A short carrier on a ${tier}-tier kind would leave the bed-aware resolver with an empty set and abort the run. Deliver a motion with a level-steady pre-crack window, or keep ${tier} carriers wall-to-wall.`);
    } else {
      add('PASS', `${tier} endcard motions`, `${viable.length}/${delivered.length} bed-viable (${viable.map(m => m.tag).join(', ')}) — short-carrier days can always resolve a close`);
    }
  }
}

function checkStingers(): void {
  for (const [variant, cfg] of Object.entries(STINGERS)) {
    if (!cfg.enabled) continue;
    // MKT-19: every built member of the rotation, plus the unversioned build
    // while it survives as the resolver's last resort. Checking only today's
    // pick would validate one of three files and call the set healthy.
    for (const m of stingerMotionSetFor(variant)) checkOneStinger(variant, cfg, builtStingerName(variant, m.tag), m.label);
    if (existsSync(join(ASSETS, stingerFile(variant)))) checkOneStinger(variant, cfg, stingerFile(variant), null);

    const cands = stingerCandidates(variant, TODAY);
    const pick = cands.find(c => existsSync(join(ASSETS, c.name)));
    add(
      pick ? 'PASS' : 'WARN',
      `${variant} stinger selection`,
      pick
        ? `today (${TODAY}): ${pick.name} [${pick.motion ? pick.motion.label : 'unversioned build'}]`
        : `nothing built (tried ${cands.map(c => c.name).join(', ')}) — the reel assembles without the branded beat. Run npm run stinger:build ${variant}`,
    );
  }
}

function checkOneStinger(variant: string, cfg: (typeof STINGERS)[string], file: string, label: string | null): void {
  const p = join(ASSETS, file);
  if (!existsSync(p)) {
    add('WARN', file, `not built — ${label ?? 'the unversioned build'} drops from ${variant}'s rotation on the days it comes up. Run npm run stinger:build ${variant}`);
    return;
  }
  if (statSync(p).size < 100_000) { add('FAIL', file, `${statSync(p).size} bytes — placeholder/corrupt`); return; }
  const s = streams(p);
  if (!Number.isFinite(s.vDur) || s.vDur < STINGER_DUR - 0.05) {
    add('FAIL', file, `video ${s.vDur?.toFixed(1)}s < the ${STINGER_DUR}s window the assembler trims to`);
  } else if (!s.hasAudio) {
    add('FAIL', file, 'no audio stream — the stinger impact is load-bearing');
  } else {
    add('PASS', file, `video ${s.vDur.toFixed(1)}s · "${cfg.lines[1]}"${label ? ` · ${label}` : ''} — adds ${(STINGER_DUR - INTRO_XFADE).toFixed(1)}s to ${variant}`);
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
      // MKT-20: resolve from the registry, never compose — a kind whose
      // incumbent is absent but whose rotation members are present still has a
      // carrier, and verify's file is `verif_carrier.mp4`.
      // ⚠ A KIND THE ASSEMBLER WILL ATTEMPT MUST HAVE A CARRIER CONFIG. This is
      // the gap that broke the daily run on 2026-07-29: `free` was added to the
      // midday/evening scope variants without a CARRIERS entry, so preflight
      // reported "dormant, 0 fail" — a missing config read as "no assets
      // delivered yet" — while `resolveCarrier` process.exit(1)'d at assembly,
      // AFTER the pro variant had already built and published.
      //
      // Dormant and unconfigured are NOT the same state. Dormant means the
      // registry knows about this kind and its files have not arrived; missing
      // config means the assembler will abort the moment it reaches this kind.
      // Every scope variant here is one the assembler WILL try to build, so a
      // missing entry is a hard FAIL rather than a note.
      if (!CARRIERS[kind]) {
        add('FAIL', kind, `registered as a scope variant but has NO carrier config — resolveCarrier aborts the run at this kind (after earlier variants have already built and published). Add it to CARRIERS in carrier-config.ts, or remove the variant from reel-scopes.ts until its carrier exists.`);
        continue;
      }
      const hasCarrier = CARRIERS[kind].set.some(cv => existsSync(join(ASSETS, cv.file)));
      // MKT-19: same fix — resolve, do not construct (see checkSlateEndcard).
      const ecSpec = ENDCARDS[kind];
      const hasEndcard = Boolean(ecSpec) && (
        existsSync(join(ASSETS, ecSpec.out)) ||
        ENDCARD_MOTIONS[tierFor(kind)].some(m => existsSync(join(ASSETS, builtEndcardName(ecSpec.out, m.tag))))
      );
      if (!hasCarrier && !hasEndcard) {
        add('PASS', kind, `no assets delivered — dormant (npm run reel:${scope} would abort until a carrier + endcard land)`);
        continue;
      }
      const carrier = checkSlateCarrier(kind);
      checkSlateEndcard(kind, carrier);
    }
  }
}

/**
 * MKT-16 — a PUBLIC kind may not publish without its stored Q1/Q2 record:
 * who looked, at what density, and the classes searched (fabricated numerals ·
 * misspelled brand vocabulary · currency and gain framing · rendered dates ·
 * reconstructable values). The record is a property of the KIND's capture
 * pipeline, kept in assets/marketing/_public_gate_records.json and committed
 * with the change that registers the kind. Missing or hollow → hard FAIL,
 * because a public reel with no recorded inspection is exactly the
 * green-check-adjacent-to-the-real-thing failure this lane keeps paying for.
 * Classes guaranteed by code rather than by looking must SAY so in `basis` —
 * an inspection record that silently mixes the two overstates what was seen.
 */
const GATE_RECORDS_FILE = '_public_gate_records.json';
function checkPublicGateRecords(): void {
  const publicKinds = SCOPES.flatMap(scope =>
    REEL_SCOPES[scope].variants
      .filter(v => captureModeFor(scope, v) === 'public')
      .map(v => reelKind(scope, v)),
  );
  if (publicKinds.length === 0) return;
  const p = join(ASSETS, GATE_RECORDS_FILE);
  let records: Record<string, { who?: string; density?: string; classes?: Record<string, string>; basis?: string }> = {};
  if (existsSync(p)) {
    try { records = JSON.parse(readFileSync(p, 'utf8')); } catch { /* handled below as missing */ }
  }
  for (const kind of publicKinds) {
    const r = records[kind];
    if (!r || !r.who || !r.density || !r.classes || Object.keys(r.classes).length < 5) {
      add('FAIL', kind, `public kind has no stored Q1/Q2 gate record (${GATE_RECORDS_FILE}) — who looked, at what density, and all five classes searched are required before this kind may publish.`);
    } else {
      add('PASS', kind, `Q1/Q2 gate record present (${r.who.slice(0, 60)}${r.who.length > 60 ? '…' : ''}; ${Object.keys(r.classes).length} classes).`);
    }
  }
}

// Intro FIRST — it sets INTRO_ACTIVE, which shifts the carrier VO window.
INTRO_ACTIVE = checkIntros();
checkPartNaming();
checkStrays();
checkMotions();
checkScopes();
checkPublicGateRecords();
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
