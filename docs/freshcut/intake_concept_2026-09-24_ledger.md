# FRESHCUT — THE INTAKE AS A MIRROR

Concept for the symbolic onboarding · content agent (Ledger) · 2026-09-24
Stored verbatim by Claude Code on 2026-10-01 (second paste, which carries the 9/24 operator ruling in §7) as a source document for the FreshCut scope (see `SCOPE_2026-10-01.md`). Companion: `plan_2026-09-24_ledger.md`. Not edited.

Replaces the written questionnaire as the client-facing surface. The questionnaire's CONTENT survives underneath as the data model; nobody ever sees it as questions.

## 1. THE PRINCIPLE

The client should never feel they are filling in a form for a machine. They should feel they are watching themselves turn into a show.

Four rules that make that true:

- **M1 TAP, NEVER TYPE.** Every screen is a choice among pictures, glyphs, swatches or sounds. Typing happens exactly once (name, handle).
- **M2 EVERY TAP CHANGES THE SCREEN.** The moment they choose a world, the whole page tints to it. Choose a type voice and their own name re-renders in it. Choose a sound and it plays. Nothing is stored silently; everything is reflected back.
- **M3 THE NAME CARD BUILDS AS THEY GO.** From screen two onward, a card in the corner shows their name in the current colors, type and texture. By the last screen it is their first asset — a static identity card rendered live in the browser. That card becomes the header of their dashboard the moment they finish.
- **M4 NINETY SECONDS.** Nine screens, one tap each (two allow a second), one upload, one name. Progress is not a bar; it is the kit's silhouettes filling in: INTRO · STINGER · ENDCARD · CHIP · BED.

Under the hood every symbol is a bundle of prompt vocabulary — motion verbs, palette rules, materials, sound words, type families. The taps merge into a brief, and the brief is what I write the Omni prompts from. The client picks pictures; I get a specification. (§4.)

## 2. THE NINE SCREENS

**S0 THE DOOR — "What do they call you?"** The one typing screen: name or show name, handle. Their name is rendered instantly, plain, centered. It will be dressed over the next eight screens. Copy under it: "Let's build your show."

**S1 WHAT DO YOU MAKE — twelve glyphs, pick one, optionally a second.** Comedy · Sports · Fitness · Fashion · Movies & shows · Music · Gaming · Food · Money & business · Talk & podcast · ME · ?
ME = the content is the person (vlog, personal brand, day-in-the-life) — a real category, portrait-forward, name-heavy kit.
? = "I don't fit a box / surprise me" — routes to the wildcard path (§3). Never a dead end.
On tap: a faint category motif appears behind the name (a stage curtain edge for comedy, a scoreboard grid for sports…).

**S2 WHICH OF THESE FEEL LIKE YOU — the taste test.** Eight short looping stingers from the FreshCut house library, a 3–4s grid, muted, autoplaying. Tap the three that feel right; long-press one to mark "most". No labels on them at all.
⚠ THIS IS THE STRONGEST SIGNAL IN THE WHOLE FLOW. A stated preference ("I like bold") is vague; a revealed one (they picked the glass-refraction bolt, the film-grain pan, the neon snap) maps directly to prompt archetypes because each house stinger IS a known prompt. Eight archetypes: SNAP · GLIDE · STRIKE · BLOOM · SHUTTER · GRAIN · CHROME · PULSE.

**S3 YOUR ENERGY — six glyphs, pick one.** Chill (wave) · Steady (horizon) · Punchy (bolt) · Hype (flame) · Cinematic (lens) · Playful (spring). Sets pace: cut timing, stinger intensity, intro length within its window, how hard the sound hits. On tap the name card's entrance animation changes to match.

**S4 YOUR WORLD — nine swatch-scenes, pick one, optional accent.** Not color chips: tiny scenes. Midnight (deep blue/black) · Ember (black/orange) · Neon (black/magenta+cyan) · Studio (white/soft gray) · Sun (cream/yellow) · Forest (deep green/brass) · Royal (purple/gold) · Steel (graphite/silver) · Candy (pink/mint).
Plus one tile: "USE MY LOGO" → upload → palette extracted, shown as a tenth swatch, chosen or not.
On tap: the entire page tints to the world. This is the screen where people say "oh."
⛔ No hex codes anywhere. Worlds map to descriptive palette rules in the lexicon (§4), which is what the prompts need anyway.

**S5 YOUR MATERIAL — eight tiles, pick one.** Glass · Metal · Paper · Neon tube · Smoke · Film grain · Clean flat · Chrome. Each tile is a close-up loop of the material catching light. On tap the name card's surface takes the material.

**S6 YOUR TYPE — six tiles, each showing THEIR NAME already set in it.** Bold block · Elegant serif · Mono/tech · Handwritten · Condensed sport · Rounded friendly. They are not choosing a font; they are choosing which version of their own name looks like them.

**S7 YOUR SOUND — six glyphs, tap to hear two seconds.** Sub hum · Riser + hit · Vinyl warm · Synth pulse · Drum hit · Silence. Sets the bed and the stinger's audio character. The lexicon carries conflict rules (Chill + Drum hit → the hit is softened, not refused).

**S8 WHAT SHOULD THE END ASK — six glyphs, pick one, optionally a second.** Follow · Subscribe · Link · Shop · Book/DM · Sponsor slot. Each pick becomes an endcard variant. Two picks = two endcards in rotation with different asks. Copy for the CTA line is drawn from category + pick (lexicon), shown live on the card.

**S9 SHOW ME YOU — one upload screen.** "Drop the real you." One to three clips or photos of the person, plus the logo if not already given. Used for: face-safe framing of the chip, lighting/skin-tone match for the palette, and the portrait pass if the kit uses their likeness. Optional, but the card's preview switches from a plain background to their frame the moment a clip lands — the reward for uploading.

**THE REVEAL — not a screen, a moment.** After S9 the name card takes the center, full size: their name, in their type, on their material, in their world, with their sound, with the endcard's ask under it — and the five kit silhouettes are all lit. One button: BUILD MY SHOW.
Under it, quiet: "Your custom package is made by hand from what you just chose. 3–5 days. You'll approve it before it runs."

## 3. THE TWO ESCAPE HATCHES

**"?" ON S1 — the wildcard.** The flow continues normally; the brief is flagged WILDCARD and I read the taste test (S2) as the primary signal instead of the category. Nobody is told they were hard to classify. The kit can be more adventurous by rule.

**"SKIP" ON ANY SCREEN** — allowed once per screen, silently sets the lexicon default for that dimension and marks the brief SKIPPED:S5 etc. The prompts take the safe reading. A client who skips four screens gets a call from the operator before the kit is built, because that is a client who is not sure what they want.

## 4. THE LEXICON — what a tap actually is

Every symbol resolves to a fragment with five slots. The brief is the merge of the chosen fragments; conflicts are resolved by explicit rules; the result is a page I write prompts from in twenty minutes instead of an hour of interpreting adjectives.

| slot | name | meaning |
|---|---|---|
| 1 | MOTION VERBS | how things enter, hold, leave |
| 2 | PALETTE RULE | described, never coded |
| 3 | MATERIAL/LIGHT | surface and how light meets it |
| 4 | SOUND WORDS | bed character, hit character, silence |
| 5 | TYPE FAMILY | which lockup treatment |
| + | CONFLICT RULES | which slot wins when two taps disagree |

Worked fragment, S1 · COMEDY:
- motion: quick snap-zooms, a beat of held stillness before the punch, one playful overshoot on the lockup, never a slow drift
- palette: warm and saturated, one loud accent, never desaturated
- material: prefers Paper or Clean flat; Glass allowed; Smoke refused
- sound: a dry hit or a rimshot-adjacent tick; bed light; silence is a valid choice (the pause is the joke)
- type: Bold block or Rounded friendly; Elegant serif refused
- conflict: COMEDY + Cinematic energy → keep the snap, add one slow reveal beat; COMEDY + Smoke material → substitute Paper and note it on the brief

Worked fragment, S2 · STRIKE (taste-test archetype):
- motion: a single bolt-like strike reveals the lockup from dark; the frame flashes once and settles; hold level to the end
- palette: dark field, one electric accent from the chosen world
- material: takes the chosen material on the lockup only
- sound: a riser into one hit at the strike; the bed enters after
- type: any; the strike is the treatment, the type is the client's
- conflict: STRIKE + Chill energy → the strike becomes a slow arc of light instead of a bolt; STRIKE + Silence → a visual-only strike with a soft air push, never a hard cut to nothing

The full lexicon is 12 + 8 + 6 + 9 + 8 + 6 + 6 + 6 = 61 fragments plus the conflict table. It is text data (JSON), owned by the content agent, stored by Claude Code, versioned. Changing a fragment changes every future kit's prompts; it never touches a built kit.

## 5. THE SYMBOLS THEMSELVES

- An ORIGINAL glyph set, one weight, one line style, drawn for FreshCut — never emoji, never a stock icon pack. They are the brand. Roughly 45 glyphs across S1/S3/S7/S8.
- Swatch-scenes (S4), material loops (S5) and house stingers (S2) are motion assets produced through Omni from my prompts — the same pipeline as everything else. The intake is itself the first portfolio piece the client sees.
- Every symbol has a one-word label revealed on long-press only. The default state is wordless; the label exists for accessibility and for the "what did that mean" moment.

## 6. WHAT THE MACHINE GETS (the brief record)

```
brief = {
  name, handle,
  category: [primary, secondary?], wildcard: bool,
  taste: [3 archetypes, most: one],
  energy, world, accent?, logo_palette?,
  material, type, sound, cta: [1–2],
  references: [files], skipped: [screens],
  lexicon_version, merged_fragments: {...}, conflicts_resolved: [...]
}
```

One row in `intake`, one rendered name-card PNG, one flag if the operator should call first. From this I write the kit's prompts; Claude Code never interprets taste — it stores it.

## 7. WHERE THIS SITS IN THE PLAN

- Replaces §4 F4's questionnaire and §6 `intake` in the plan doc.
- The taste test's eight house stingers double as the HOUSE KIT the test reel uses (§2.4) — one set of assets, two jobs.
- (Operator ruling 9/24: no client-by-hand phase.) The screens are a Phase 1 build; the lexicon and the house kit are written and produced first, because the taste test cannot exist without them.
- Build cost is modest: nine static screens with one live-rendered card (CSS, no video), an upload, and the house-stinger grid.

NEXT FROM ME, on your word: the full 61-fragment lexicon and the conflict table, then the Omni prompts for the eight house stingers and the nine world swatch-scenes.
— Ledger, 2026-09-24
