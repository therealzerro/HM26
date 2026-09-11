// MKT-79 — assemble the DAILY TRACK RECORD REEL (`record_public`), ~16.3s:
//
//   [0.0–2.0]   hook card (render-public-hook --kind=record), gold, silent
//   [1.6–2.0]   0.4s eased dissolve into the body's frame 0 (cloned under it)
//   [2.0–9.4]   record body (render-record-body): dim tiles → gold marks →
//               count → stats → hold with the rightmost pulse
//   [9.4–9.8]   0.4s dissolve into the endcard (the body's last frame cloned)
//   [9.8–16.3]  endcard, free-tier motion set, gold line 3
//   AUDIO       hum bed from the endcard's own crack-free window under the
//               card + body (default --voice=bed), endcard audio from 9.4s;
//               --voice=carrier plays record_public_carrier.mp4 from reel
//               0.0 once it is REGISTERED in record-config (gated) — until
//               then the reel ships silent with the bed, never waits.
//
// ⛔ COUNT GATE (Phase 0 item 3): the body carries hm_record_marks (gold tiles
// painted) and hm_record_days (the DAYS figure) from the renderer's ONE
// summary object. They are re-read here and must be equal, every stat must
// be < 100, or the reel does not build. The tags are then copied onto the
// final so the publisher's caption slots read the same values the pixels show.
//
// Cold open, no anchor intro, no stinger, no shoulder chip, no stamp ribbon:
// the brand rides the hook card, the body's own wordmark and the endcard.
//
// Usage: tsx scripts/assemble-record-reel.ts [YYYYMMDD] [--voice=bed|carrier] [--preview]
//   YYYYMMDD = the stamp = the window's last day (D−1). --preview writes a
//   suffixed output that is never published.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { HOOK_DUR, HOOK_DISSOLVE } from './public-hook-config';
import { assertBodyDate, assertBodyPublic, readRecordStats, recordTagArgs, DATE_TAG, PUBLIC_TAG } from './reel-provenance';
import { resolveEndcard } from './reel-endcard';
import { bedWindow, BED_TARGET_RMS, BED_MIX_DB, MAX_BED_CORRECTION, type BedWindow } from './reel-bed';
import {
  RECORD_KIND, RECORD_DIR, RECORD_BODY_DUR, RECORD_END_DISSOLVE, RECORD_CARD, RECORD_TOTAL, RECORD_FURNITURE,
  RECORD_STAT_MAX, RECORD_VOICE_DEFAULT, RECORD_VOICE_FILE, RECORD_VOICE_START, RECORD_VOICE_LAST_WORD_MAX, type RecordVoice,
} from './record-config';

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, RECORD_DIR);
mkdirSync(REELS, { recursive: true });
const sh = (c: string) => execSync(c, { stdio: 'inherit' });
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`; // xfade P counts DOWN

function etDate(offsetDays: number): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString('en-CA');
}
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const stamp = positional[0] ?? etDate(-1).replace(/-/g, '');
const isoDate = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
const flagVal = (name: string): string | undefined => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const VOICE = (flagVal('voice') ?? RECORD_VOICE_DEFAULT) as RecordVoice;
if (VOICE !== 'bed' && VOICE !== 'carrier') { console.error(`ABORT(${RECORD_KIND}): --voice=${VOICE} — known: bed | carrier.`); process.exit(1); }
const PREVIEW = process.argv.includes('--preview');

// ── Body: existence, provenance, the count gate ─────────────────────────────
const body = join(REELS, `record_body_${stamp}.mp4`);
const rerun = `npx tsx scripts/render-record-body.ts ${stamp}`;
if (!existsSync(body)) { console.error(`ABORT(${RECORD_KIND}): ${body} not found — run the body render first (${rerun}).`); process.exit(1); }
assertBodyDate(body, isoDate, rerun);
assertBodyPublic(body, rerun);
const st = readRecordStats(body);
if (!st) { console.error(`ABORT(${RECORD_KIND}): the body carries no hm_record_* tags — not a render-record-body output, or the muxer dropped them. Re-render: ${rerun}`); process.exit(1); }
if (st.marks !== st.days) {
  console.error(`ABORT(${RECORD_KIND}): COUNT GATE — the strip painted ${st.marks} gold tiles but the count line says ${st.days} OF ${st.of}. The reel would contradict itself; not building.`);
  process.exit(1);
}
for (const [k, v] of Object.entries({ days: st.days, of: st.of, exact: st.exact, juris: st.juris })) {
  if (v < 0 || v > RECORD_STAT_MAX) { console.error(`ABORT(${RECORD_KIND}): THREE-DIGIT ASSERT — "${k}" = ${v} on the body's tags. Not building.`); process.exit(1); }
}
if (st.days === st.of) console.log(`NOTE(${RECORD_KIND}): ⚠ all ${st.of} tiles gold — the renderer was run with --allow-all-matched; there is no dim tile on this cut.`);
console.log(`NOTE(${RECORD_KIND}): COUNT GATE PASS — ${st.marks} gold tiles = ${st.days} OF ${st.of} · ${st.exact} exact-order · ${st.juris} states & provinces · ${st.range}.`);
const bodyDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${body}"`).toString());
if (Math.abs(bodyDur - RECORD_BODY_DUR) > 0.1) { console.error(`ABORT(${RECORD_KIND}): body is ${bodyDur.toFixed(2)}s, expected ${RECORD_BODY_DUR}s.`); process.exit(1); }

// ── Hook card (fixed copy, tier-1 linted inside the renderer) ──────────────
const hook = join(REELS, `_hook_${RECORD_KIND}_${stamp}.mp4`);
sh(`npx tsx scripts/render-public-hook.ts ${stamp} "${hook}" --kind=record`);

// ── Endcard: free-tier rotation, bed-viable (the bed is always needed) ─────
const ec = resolveEndcard(ASSETS, RECORD_KIND, isoDate, true);
const CARD_IN = +(RECORD_END_DISSOLVE + RECORD_CARD).toFixed(2);   // 6.9s of the card is used
const ecV = parseFloat(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${ec.path}"`).toString());
const ecA = parseFloat(execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "${ec.path}"`).toString());
if (!(ecV >= CARD_IN - 0.05) || !(ecA >= CARD_IN - 0.05)) { console.error(`ABORT(${RECORD_KIND}): endcard ${ec.name} is ${ecV.toFixed(2)}s video / ${ecA.toFixed(2)}s audio — the record close needs ${CARD_IN}s (dissolve + card).`); process.exit(1); }
const bed = bedWindow(ec.path, RECORD_CARD);
if (!bed) { console.error(`ABORT(${RECORD_KIND}): ${ec.name} has no usable hum-bed window and the resolver found no bed-viable free motion. Not building.`); process.exit(1); }
console.log(`NOTE(${RECORD_KIND}): endcard ${ec.motion.label} [${ec.name}] · hum bed ← ${bed.mode}-crack ${bed.start}-${bed.end}s (crack ${bed.crackAt}s, mean ${bed.rms}dB).`);

// ── Timeline ────────────────────────────────────────────────────────────────
const openDur = HOOK_DUR;                                  // 2.0 — body motion starts here
const cardAt = +(openDur + RECORD_BODY_DUR).toFixed(2);    // 9.4 — endcard dissolve begins
const total = RECORD_TOTAL;                                // 16.3
const bedLen = +(cardAt + RECORD_END_DISSOLVE).toFixed(2); // bed runs under the card + body, out across the dissolve

// ── Voice (gated; bed by default) ───────────────────────────────────────────
let voice: { path: string; span: number } | null = null;
if (VOICE === 'carrier') {
  if (!RECORD_VOICE_FILE) { console.error(`ABORT(${RECORD_KIND}): --voice=carrier but no carrier is REGISTERED in record-config.ts (RECORD_VOICE_FILE is null). Gate the delivery first; until then the reel ships with the bed.`); process.exit(1); }
  const p = join(ASSETS, RECORD_VOICE_FILE.file);
  if (!existsSync(p)) { console.error(`ABORT(${RECORD_KIND}): registered carrier ${RECORD_VOICE_FILE.file} is missing.`); process.exit(1); }
  if (RECORD_VOICE_FILE.lastWord > RECORD_VOICE_LAST_WORD_MAX) { console.error(`ABORT(${RECORD_KIND}): carrier last word ${RECORD_VOICE_FILE.lastWord}s > ${RECORD_VOICE_LAST_WORD_MAX}s.`); process.exit(1); }
  const d = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${p}"`).toString());
  voice = { path: p, span: +Math.min(d - 0.05, bedLen - RECORD_VOICE_START).toFixed(2) };
  console.log(`NOTE(${RECORD_KIND}): voice = carrier [${RECORD_VOICE_FILE.file}] from reel ${RECORD_VOICE_START}s, last word ${RECORD_VOICE_FILE.lastWord}s.`);
} else {
  console.log(`NOTE(${RECORD_KIND}): voice = bed (no carrier registered or --voice=bed) — the hum bed carries the card and the body.`);
}

/** MKT-10 palindrome hum bed from the endcard's crack-free window, level-
 *  matched (MKT-19). Same construction as assemble-allday-reels.humBed. */
function humBed(inLabel: string, len: number, outLabel: string, b: BedWindow): string {
  const seg = +(b.end - b.start).toFixed(2);
  const pairs = Math.max(1, Math.ceil(len / (2 * seg)));
  let f = `${inLabel}atrim=${b.start}:${b.end},asetpts=PTS-STARTPTS,aresample=48000[bs];[bs]asplit=2[bsa][bsb];[bsb]areverse[bsr];[bsa][bsr]concat=n=2:v=0:a=1[bp];`;
  if (pairs > 1) {
    const labels = Array.from({ length: pairs }, (_, i) => `[bq${i}]`);
    f += `[bp]asplit=${pairs}${labels.join('')};${labels.join('')}concat=n=${pairs}:v=0:a=1[bl];`;
  } else f += `[bp]anull[bl];`;
  const correction = Math.max(-MAX_BED_CORRECTION, Math.min(MAX_BED_CORRECTION, BED_TARGET_RMS - b.rms));
  return f + `[bl]atrim=0:${len.toFixed(2)},asetpts=PTS-STARTPTS,volume=${(correction + BED_MIX_DB).toFixed(2)}dB,afade=t=in:st=0:d=0.6,afade=t=out:st=${(len - RECORD_END_DISSOLVE).toFixed(2)}:d=${RECORD_END_DISSOLVE}${outLabel}`;
}

const outBase = `${RECORD_KIND}_${stamp}${PREVIEW ? '_preview' : ''}`;
const out = join(REELS, `${outBase}.mp4`);
const sheet = join(REELS, `${outBase}_contact.png`);
const msCard = Math.round(cardAt * 1000);
const msVoice = Math.round(RECORD_VOICE_START * 1000);
const voiceIdx = 3;

sh(
  `ffmpeg -y -loglevel error ` +
  `-i "${hook}" -i "${body}" -i "${ec.path}" ` +                       // [0] hook  [1] body  [2] endcard
  (voice ? `-i "${voice.path}" ` : ``) +                                // [3] carrier (audio only)
  `-filter_complex "` +
  `[0:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${HOOK_DUR},setpts=PTS-STARTPTS[hk];` +
  // Body: frame 0 cloned under the opening dissolve, last frame cloned under the closing one.
  `[1:v]tpad=start_duration=${HOOK_DISSOLVE}:start_mode=clone:stop_duration=${RECORD_END_DISSOLVE}:stop_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[bd];` +
  `[hk][bd]xfade=transition=custom:expr=${EASED}:duration=${HOOK_DISSOLVE}:offset=${+(openDur - HOOK_DISSOLVE).toFixed(2)}[ob];` +
  `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${CARD_IN},setpts=PTS-STARTPTS[cd];` +
  `[ob][cd]xfade=transition=fade:duration=${RECORD_END_DISSOLVE}:offset=${cardAt}[v];` +
  // Audio: bed under card + body (out across the dissolve), endcard audio from the dissolve, optional voice from 0.0.
  humBed('[2:a]', bedLen, '[bed];', bed) +
  `[2:a]atrim=0:${CARD_IN},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=${RECORD_END_DISSOLVE},afade=t=out:st=${(CARD_IN - 0.4).toFixed(2)}:d=0.4,adelay=${msCard}|${msCard}[outroaud];` +
  (voice
    ? `[${voiceIdx}:a]atrim=0:${voice.span},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:st=0:d=0.01,afade=t=out:st=${(voice.span - 0.3).toFixed(2)}:d=0.3,adelay=${msVoice}|${msVoice}[voice];`
    : ``) +
  `[bed]${voice ? '[voice]' : ''}[outroaud]amix=inputs=${voice ? 3 : 2}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${total}[a]" ` +
  `-map "[v]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
  `-c:a aac -ar 48000 -movflags +faststart+use_metadata_tags ` +
  `-metadata ${DATE_TAG}="${isoDate}" -metadata ${PUBLIC_TAG}="1" -metadata hm_cut="record" -metadata hm_record_voice="${VOICE}" ` +
  recordTagArgs(st) + ` "${out}"`,
);

// Contact sheet — frame one, the dim strip, mid-fill, the resolved count + stats, the settled endcard.
const STAMPS = [0.0, openDur + 0.65, openDur + 2.4, openDur + 5.8, total - 0.4].map(t => +t.toFixed(2));
STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs_record${i}.png`)}"`));
sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs_record${i}.png`)}"`).join(' ')} -filter_complex "${STAMPS.map((_, i) => `[${i}]`).join('')}hstack=${STAMPS.length}" "${sheet}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`${RECORD_KIND.toUpperCase()} reel: ${out} · duration ${dur}s · contact sheet written`);
console.log(
  `NOTE(${RECORD_KIND}): totals — card ${HOOK_DUR}s + body ${RECORD_BODY_DUR}s + dissolve ${RECORD_END_DISSOLVE}s + endcard ${RECORD_CARD}s = ${total}s · ` +
  `furniture ${RECORD_FURNITURE}s = ${((RECORD_FURNITURE / total) * 100).toFixed(1)}% (the evidence-reel number; report, don't judge) · ` +
  `${st.days} OF ${st.of} · ${st.exact} exact-order · ${st.juris} states & provinces · ${st.range} · voice ${VOICE}${PREVIEW ? ' · PREVIEW (not published)' : ''}.`,
);
void basename;
