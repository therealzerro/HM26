// MKT-73 — daily anchor thread + Sunday receipts thread, generated onto the
// captions sheet (operator ruling 2026-09-07).
//
// Why: the Pro group's Insights series (docs/growth_checkpoint_2026-09-07.md)
// shows every engagement peak in the group's history was a human thread — a
// question asked or answered — and templated drops alone never grew comments.
// The 9/2 retention levers were (1) an onboarding FAQ pin [done by the
// operator 9/7], (2) ONE question on the daily Morning Brief anchor post, and
// (3) a Sunday receipts thread. This module produces the copy for (2) and (3)
// so they ride the same one-tap sheet as the reel captions:
//
//   • every day  → an anchor QUESTION (the comment prompt under the Morning
//                  Brief photo) + a ChatGPT IMAGE PROMPT for the post's cover
//                  (images = ChatGPT; video = Gemini Omni — never the reverse)
//   • Sundays    → the receipts-thread CAPTION + a Gemini Omni 8s VIDEO PROMPT
//
// Rotation is deterministic on the ET date (day-of-year, same contract as
// scripts/reel-captions.ts) so a re-render of the same day's sheet prints the
// same copy. Pools are sized so nothing repeats inside a fortnight.
//
// Destination is the PRO GROUP (tier 4) — the Morning Brief lives there. Copy
// is written to the universal rules (no guarantees, no urgency hype, no
// "hit(s)", ≤2 emoji) and re-checked here with the real lint engine; a copy
// that fails lint is replaced by the safe fallback and the failure is logged,
// so the sheet can never carry an unlinted line. Image/video prompts keep the
// frame free of digits and of every Two-Question word even though the
// destination is opted-in: a clean cover can be reused on the free group,
// a dirty one cannot (feedback-two-question-filter).
import { lintCaption } from '../lib/social/brandLint';

const ET = 'America/New_York';

/** Day-of-year for an ISO date, computed in ET so the rotation matches the sheet's day. */
function dayOfYear(dayISO: string): number {
  const d = new Date(`${dayISO}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86400000) + 1;
}

function weekOfYear(dayISO: string): number {
  return Math.floor((dayOfYear(dayISO) - 1) / 7);
}

/** Weekday name for an ISO date (the date is already an ET calendar day). */
function weekdayOf(dayISO: string): string {
  return new Date(`${dayISO}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** "MON · SEP 7" — the same date-chip grammar the reels burn in. */
export function dateChip(dayISO: string): string {
  const d = new Date(`${dayISO}T12:00:00Z`);
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
  const mo = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${wd} · ${mo} ${d.getUTCDate()}`;
}

// ── Daily anchor question ────────────────────────────────────────────────────
// One question, answerable in a sentence, about the member's own practice —
// never about outcomes we would have to promise. The four confusion threads
// (which board / which state / straight vs box / when it posts) are in here
// as questions, because those were the most-answered posts in the group.
const QUESTIONS: string[] = [
  'Which board are you on today — Midday, Evening, or All-Day? Drop it below.',
  'Which state are you running today’s board in? Two-letter code is enough.',
  'Rank 1 or rank 6 — which row on today’s board do you trust more, and why?',
  'Straight order or set order — how are you covering today’s top signal?',
  'Yesterday’s receipts: did your state land on the board? Which row was it?',
  'One question about reading the board — ask it here and we answer it in this thread today.',
  'How many days do you ride a signal before you rotate off it?',
  'Which of the four measures do you read first — Frequency, Momentum, Pattern, or Consistency?',
  'Midday or Evening — which session’s board do you check first, and why that one?',
  'Which state has come through for you most this month?',
  'Where do you read the board — phone, tablet, or printed out?',
  'Tell a new member one thing you wish you’d known in your first week here.',
  'When the same signal shows on two boards the same day, do you treat it differently? How?',
  'What time do you actually place your coverage — right after the drop, or closer to the draw?',
  'Which row on today’s All-Day board matches something you had already noticed yourself?',
  'What’s your rule for a signal that has been on the board three days running?',
];

const QUESTION_FALLBACK = 'Which board are you on today — Midday, Evening, or All-Day?';

// ── Cover image (ChatGPT) — scene families, one per day of the week ─────────
// Brand palette + imagery direction from the Skill Brief v2 §7/§8. Every
// family renders exactly three text strings and nothing else; the frame
// carries no digits and none of the Two-Question words, so the cover can be
// reused in the free group without a second review.
interface Scene { name: string; subject: string; composition: string }
const SCENES: Scene[] = [
  {
    name: 'morning desk',
    subject: 'a broadcast-style analyst desk at dawn: a dark glass surface, a white ceramic coffee cup with a thin curl of steam, and a single floating holographic board card hovering above the desk. The card shows six ranked rows, each row a soft glowing placeholder bar (like a redacted strip, no characters), lit electric purple with a metallic gold rank marker at the left of each row.',
    composition: 'Top third: the headline text on a slim dark band. Middle: the desk and the floating card, seen from a slightly elevated three-quarter angle. Bottom band: the date line and the brand wordmark with a small lightning-bolt mark beside it.',
  },
  {
    name: 'state map',
    subject: 'a minimalist map of the continental United States drawn as thin luminous outlines on deep navy, with a scatter of small glowing cyan nodes pulsing across the map and faint purple signal lines linking a few of them. No state names, no labels on the map.',
    composition: 'Top third: the headline text. Middle: the map, centered, with soft light bloom. Bottom band: the date line and the brand wordmark with a lightning-bolt mark.',
  },
  {
    name: 'question card',
    subject: 'a single floating holographic card, portrait orientation, with a large elegant question mark glyph rendered in metallic gold at its center, surrounded by a faint purple particle field and two thin lightning-bolt accents at the card corners.',
    composition: 'Top: the headline text. Middle: the card, slightly tilted, casting a purple glow on a dark surface. Bottom band: the date line and the brand wordmark.',
  },
  {
    name: 'ledger and pen',
    subject: 'an open paper ledger on a dark desk under a warm desk lamp; the ledger rows are empty ruled lines, a gold fountain pen rests across the page, and a faint purple holographic overlay of six placeholder bars floats an inch above the paper.',
    composition: 'Top: the headline text. Middle: the ledger and pen, close and slightly overhead. Bottom band: the date line and the brand wordmark with a lightning-bolt mark.',
  },
  {
    name: 'two boards',
    subject: 'two translucent holographic panels standing side by side on a dark reflective floor, each showing six placeholder rows as soft glowing bars; one row on each panel is highlighted in metallic gold and a thin gold thread links the two highlighted rows across the gap.',
    composition: 'Top: the headline text. Middle: the two panels, centered, symmetrical. Bottom band: the date line and the brand wordmark with a lightning-bolt mark.',
  },
  {
    name: 'phone at dawn',
    subject: 'a hand holding a phone in soft early light near a window; the phone screen shows an abstract dark dashboard with purple and cyan signal waves and glowing bars, no readable characters on the screen. The mood is calm focus.',
    composition: 'Top: the headline text. Middle: the hand and phone, slightly off-center, shallow depth of field. Bottom band: the date line and the brand wordmark with a lightning-bolt mark.',
  },
  {
    name: 'signal stream',
    subject: 'an abstract cascade of luminous data particles in purple and cyan streaming downward and converging into one bright gold point of light above a dark horizon, with a subtle lightning-bolt silhouette formed inside the stream.',
    composition: 'Top: the headline text. Middle: the particle stream, full width. Bottom band: the date line and the brand wordmark with a lightning-bolt mark.',
  },
];

// Prompt discipline per the content agent's PROMPT CONVENTIONS (handoff §11,
// 2026-09-05): every text string spelled exactly including the middle dot; a
// SAFE-AREA block stated before the composition (generators spread text wide);
// what IS in the scene body, negatives only in the closing exclusions; the
// ornaments line ("no text/numbers" does not catch sparkles); the standing
// vocabulary exclusions on every prompt.
const STANDING_VOCAB_EXCLUSION =
  'None of these words anywhere in the image: pick, picks, straight, box, play, hit, hits, win, winning, winner, lottery, bet, luck, lucky, jackpot.';
const ORNAMENTS_EXCLUSION =
  'No ornaments, sparkles, stars, lens flares, corner marks or decorative flourishes of any kind, anywhere in the frame.';

function imagePrompt(dayISO: string, scene: Scene): string {
  const chip = dateChip(dayISO);
  return [
    `Create a portrait 4:5 social cover image for a data-analytics brand's daily "Morning Brief" discussion post. It is the cover of a conversation thread: calm, premium, an invitation to talk — not a sales graphic. Fictional science-fiction analytics scene.`,
    ``,
    `Safe area: every text string sits inside the central 80% of the width and away from the top and bottom 8% of the height, so nothing is cropped by a feed thumbnail. The headline is the largest text and reads at thumbnail size.`,
    ``,
    `Subject: ${scene.subject}`,
    ``,
    `Composition: ${scene.composition}`,
    ``,
    `Style and atmosphere: cinematic, high-end fintech analytics aesthetic. Deep black to deep navy background, electric purple as the primary light source, metallic gold accents, electric cyan only for small data highlights. Soft bloom, clean edges, generous negative space. Bold geometric sans-serif for the headline, thin elegant sans-serif for the date line. The placeholder bars are blank glowing strips.`,
    ``,
    `Text to render — exactly three strings, spelled exactly as written including the middle dot, and nothing else: "MORNING BRIEF" (headline), "${chip}" (date line), "HITMASTER ZK6" (brand wordmark, bottom band).`,
    ``,
    `Color palette: background #0A0A0F to #1E1B4B; primary purple #A855F7 to #C084FC; gold #FBBF24 to #F59E0B; cyan accent #06B6D4; text white.`,
    ``,
    `Strict exclusions: no citation tags, reference tags, bracketed text, file names or metadata-style annotations of any kind. The image contains ONLY the three text strings above. No digits anywhere in the frame. ${ORNAMENTS_EXCLUSION} No cash, coins, tickets, dice, cards, slot machines or casino imagery. No confetti, fireworks or celebration. No people's faces. ${STANDING_VOCAB_EXCLUSION}`,
    ``,
    `Aspect ratio: 4:5 (1080 × 1350).`,
  ].join('\n');
}

export interface AnchorThread {
  question: string;          // the comment prompt for the Morning Brief post
  scene: string;             // scene family name (for the sheet header)
  imagePrompt: string;       // ChatGPT prompt for the post cover
  lintNote: string | null;   // non-null when the pool copy failed lint and the fallback shipped
}

export function buildAnchorThread(dayISO: string): AnchorThread {
  const doy = dayOfYear(dayISO);
  let question = QUESTIONS[doy % QUESTIONS.length];
  let lintNote: string | null = null;
  const lint = lintCaption(question, 4);
  if (!lint.ok) {
    lintNote = `pool question failed tier-4 lint (${lint.violations.map(v => `${v.rule}:${v.term}`).join(', ')}) — fallback shipped`;
    question = QUESTION_FALLBACK;
  }
  const scene = SCENES[doy % SCENES.length];
  return { question, scene: scene.name, imagePrompt: imagePrompt(dayISO, scene), lintNote };
}

// ── Sunday receipts thread ───────────────────────────────────────────────────
const SUNDAY_CAPTIONS: string[] = [
  '🧾 Sunday receipts thread. Post the rows your state matched off this week’s boards — session, row, state, and whether it was a MATCH or a STRAIGHT MATCH. We fold the thread into Monday’s brief. Board first, receipts after — same as always.',
  '🧾 Receipts, Sunday edition. Reply with what your state returned this week: which board, which row, MATCH or STRAIGHT MATCH. Screenshots welcome. The thread becomes part of Monday’s Morning Brief.',
  '🧾 Weekly receipts. Drop your state’s matched rows from this week below — session, rank, MATCH or STRAIGHT MATCH. Every reply gets read and the tally goes into Monday’s brief.',
  '🧾 Sunday thread: what did your state return this week? Board, row, MATCH or STRAIGHT MATCH — one line each is plenty. Compiled into Monday’s brief for everyone.',
];

const SUNDAY_FALLBACK = '🧾 Sunday receipts thread. Post the rows your state matched off this week’s boards — session, row, state, MATCH or STRAIGHT MATCH. Compiled into Monday’s brief.';

// Gemini Omni conventions (handoff §11, content agent 2026-09-05):
//   • PACING block at the TOP, in its own paragraph — Omni paces beats to the
//     master length, so every event is scripted inside the 8s cut and the
//     tail is a still hold;
//   • no broadcast / studio / news / desk vocabulary (refusal class 2a) —
//     framed as "a fictional science-fiction scene";
//   • the scene body states what IS; negatives live only in the closing
//     exclusions paragraph (refusal class 2c);
//   • ornaments line + standing vocabulary exclusions + no cash/tickets/dice/
//     cards + no confetti/fireworks;
//   • 720 × 1280 is the confirmed ceiling — ask for it, do not treat it as a
//     defect; no narration (the caption carries the words), ambient only —
//     silence cannot be requested, so the line is written but not relied on.
const OMNI_PACING = (beats: string) =>
  `⚠ CRITICAL PACING INSTRUCTION — READ FIRST: EVERY EVENT HAPPENS WITHIN THE FIRST 8 SECONDS. Do not spread the action across the full clip length. ${beats} Everything after that is a still hold with nothing happening in it.`;
const OMNI_EXCLUSIONS =
  `Exclusions: only the two text strings named above appear in the frame; no other text, letters, numbers, logos or watermarks. ${ORNAMENTS_EXCLUSION} No cash, coins, tickets, dice, cards, slot machines or gambling imagery. No confetti, fireworks or celebration. No faces. ${STANDING_VOCAB_EXCLUSION}`;
const OMNI_TAIL = 'Ambient room tone only, no narration and no music. Vertical 9:16, 8 seconds, 720 × 1280.';

const SUNDAY_VIDEOS: string[] = [
  [
    OMNI_PACING('The receipt finishes unrolling by 4.0s, the gold seal lands at 5.0s, both text strings are fully on screen by 6.0s.'),
    'A fictional science-fiction scene: a slow cinematic push-in across a dark glass surface at night. A long paper receipt unrolls across the surface toward the camera, its rows filling one by one with soft glowing purple placeholder bars as it unrolls. A metallic gold lightning-bolt seal presses down onto the paper at the end of the roll and leaves a glowing mark. On-screen text in a bold geometric sans-serif, spelled exactly: "SUNDAY RECEIPTS" in the upper third and "HITMASTER ZK6" small in the lower band. Palette: deep navy background, electric purple light, metallic gold accents, white text.',
    OMNI_EXCLUSIONS,
    OMNI_TAIL,
  ].join('\n\n'),
  [
    OMNI_PACING('Rows light up one per half-second from 1.0s to 4.0s, the gold thread completes at 5.0s, both text strings are fully on screen by 6.0s.'),
    'A fictional science-fiction scene: a clean glass ledger floating in a dark space, ruled with empty rows, centred just above the middle of the frame and holding that position throughout. One after another, six rows light up from the top with soft purple bars, and a thin gold thread traces down the left edge connecting them. A gentle particle drift in cyan crosses the frame. On-screen text in a bold geometric sans-serif, spelled exactly: "SUNDAY RECEIPTS" at the top and "HITMASTER ZK6" at the bottom. Palette: deep black to navy, electric purple, metallic gold, white text.',
    OMNI_EXCLUSIONS,
    OMNI_TAIL,
  ].join('\n\n'),
  [
    OMNI_PACING('The receipt is set down by 2.0s, unfolds by 4.0s, the gold mark glows at 5.0s, both text strings are fully on screen by 6.0s.'),
    'A fictional science-fiction scene: dawn light through a window onto a dark glass surface. A single hand, seen only from the wrist, sets a folded paper receipt onto the surface beside a phone whose screen shows an abstract purple dashboard of glowing blank bars; the receipt unfolds itself and a metallic gold lightning-bolt mark glows on its face. Slow, calm camera. On-screen text in a bold geometric sans-serif, spelled exactly: "SUNDAY RECEIPTS" in the upper third and "HITMASTER ZK6" in the lower band. Palette: deep navy, electric purple, metallic gold, white text.',
    OMNI_EXCLUSIONS,
    OMNI_TAIL,
  ].join('\n\n'),
];

export interface SundayReceipts {
  caption: string;
  videoPrompt: string;
  lintNote: string | null;
}

/** Null on any day that is not a Sunday (ET calendar day). */
export function buildSundayReceipts(dayISO: string): SundayReceipts | null {
  if (weekdayOf(dayISO) !== 'Sunday') return null;
  const w = weekOfYear(dayISO);
  let caption = SUNDAY_CAPTIONS[w % SUNDAY_CAPTIONS.length];
  let lintNote: string | null = null;
  const lint = lintCaption(caption, 4);
  if (!lint.ok) {
    lintNote = `pool caption failed tier-4 lint (${lint.violations.map(v => `${v.rule}:${v.term}`).join(', ')}) — fallback shipped`;
    caption = SUNDAY_FALLBACK;
  }
  return { caption, videoPrompt: SUNDAY_VIDEOS[w % SUNDAY_VIDEOS.length], lintNote };
}

/** Self-check: every pool entry must pass tier-4 lint. Run: npx tsx scripts/anchor-thread.ts */
if (process.argv[1]?.endsWith('anchor-thread.ts')) {
  let bad = 0;
  for (const q of QUESTIONS) { const r = lintCaption(q, 4); if (!r.ok) { bad++; console.log('QUESTION FAILS', q, r.violations); } }
  for (const c of SUNDAY_CAPTIONS) { const r = lintCaption(c, 4); if (!r.ok) { bad++; console.log('SUNDAY FAILS', c, r.violations); } }
  console.log(`${QUESTIONS.length} questions, ${SUNDAY_CAPTIONS.length} sunday captions, ${SCENES.length} scenes, ${SUNDAY_VIDEOS.length} videos — ${bad} lint failures`);
  const day = process.argv.find(a => a.startsWith('--day='))?.slice(6) ?? new Date().toLocaleDateString('en-CA', { timeZone: ET });
  const a = buildAnchorThread(day);
  console.log(`\n[${day}] ${weekdayOf(day)} · scene: ${a.scene}${a.lintNote ? ' · ' + a.lintNote : ''}\nQ: ${a.question}\n\n${a.imagePrompt}`);
  const s = buildSundayReceipts(day);
  if (s) console.log(`\nSUNDAY${s.lintNote ? ' · ' + s.lintNote : ''}\n${s.caption}\n\n${s.videoPrompt}`);
  process.exit(bad ? 1 : 0);
}
