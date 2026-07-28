# MKT-15 Phase 2 — copy request for the content agent

> **✅ ANSWERED 2026-07-28 — the copy set is below in "DELIVERED".** All strings lint
> clean at tier 1. The request section is kept for the record of what was asked.

---

## DELIVERED — the public copy set (approved)

| # | Where | Current | Public replacement | Lint |
|---|---|---|---|---|
| 1 | Card header | `PICK #1 · ZK6` | `SIGNAL #1` | ✅ |
| 2 | Primary number label | `⚡ BEST STRAIGHT` | `⚡ BEST ORDER` | ✅ |
| 3 | Number-set label | `BOX SET` | `ANY ORDER` | ✅ |
| 4 | Card tab | `PLAY` | `PLAN` | ✅ |
| 5 | Resolution trail | `· 1 straight` | `· 1 in order` | ✅ |
| 6 | Scope badge | `ALLDAY` | **drop** | — |
| 7 | Provenance chip | `TUE · JUL 28 · ALL-DAY` | **drop the scope tag** → `TUE · JUL 28` | ✅ |
| 8 | Stinger headline | `ALL-DAY · FIRST LOOK` | per-variant, below | ✅ |

Slot 8 variants: `allday_public` → **THE FULL BOARD** · `midday_public` → **TODAY'S BOARD**
· `evening_public` → **TONIGHT'S BOARD**.

**Slot 3 — `ANY ORDER` approved on measurement, not on the character rule.** The brief's
"stay at or under the current character count" was a crude proxy for pixel width and was
wrong for this chip. Measured on the live modal: the badge's content width is **86px**, set
by the 17px mono combo (`{5,7,9}` = 84px) — *not* by the 7px label. `BOX SET` renders at
41px, `ANY ORDER` at **55px**, so it fits with 31px to spare and widens nothing. `SET` (18px)
is therefore not needed. **`BEST ORDER` / `ANY ORDER` side by side is the version that
teaches itself**, which was the point of asking.

**Alternates declined** (both were offered as fallbacks, neither is needed):
`RANK #1 · ZK6` — `SIGNAL #1` is better, because "signal" is the sanctioned product noun and
dropping the suffix satisfies version-agnostic for free. `⚡ OPTIMAL ORDER` — `BEST ORDER`
preserves the BEST/ANY symmetry with slot 3.

**Session words treated as BLOCKING, not advisory** (content-agent ruling, adopted): the
classifier reads the whole pattern rather than isolated words, the page has no margin left,
and dropping them costs nothing. Slots 6 and 7 drop; slot 8 replaces, because a full-frame
stinger headline is where differentiation is actually read — and keeping the three daily
drops distinguishable also matters for the near-duplicate detection every platform runs.
Omission has precedent: the verify stamp already renders with no scope tag because
`/track-record` is cross-scope.

**Implementation note for slot 3+:** `BOX SET` also appears in `PickPosterCard.tsx`, which
is a separate export surface and is **not** in reel frames — the capture-mode override
covers `PickDetailModal` only. Poster exports stay as they are unless separately scoped.

---

## SECOND REQUEST — the digit mask (operator ruling: extreme blur + the bolt)

Copy is settled. This is the remaining Phase 2 input: **one asset and three decisions.**

### Why we're asking at all

There is **no usable bolt mark in the repo.** Checked: `app-icon.png` is 2048×2048 but
*fully opaque* (alpha 255 everywhere — a filled square, not a mark); `_bolt_lockup.png` and
`boltframe.png` are full 1080×1920 RGB frames with no alpha; everywhere else the bolt is
either baked into generated video/artwork or is the emoji glyph `⚡︎`. None of those can
overlay a digit block.

### 1. The asset — bolt mark

- **Transparent PNG, ≥1024×1024**, square canvas, bolt centred, ~10% padding on all sides.
  One high-res file; engineering scales it per site.
- **SVG as well if you have it** — it would stay crisp at every size and cost nothing.
- **No background, no baked-in drop shadow.** Glow is a decision below, not a bake-in — if
  it is in the file we cannot tune it against the blur underneath.
- Must read against a **dark, blurred, mid-tone** field, not a flat colour.

### 2. Three decisions

| | Question | Why it matters |
|---|---|---|
| a | **Fill:** solid white · brand cyan `#2bffcc` · gradient · the endcard bolt's exact look? | It sits over a blur, so contrast behaves differently than on the endcard's black |
| b | **Placement:** one bolt per masked number, one per card, or one per screen? | The grid shows six numbers at once; six bolts may read as noise, one may read as a watermark |
| c | **Scale + opacity** relative to the block it covers (e.g. 60% of block height, 90% opacity) | Too small reads as a bug, too large hides that there is a number there at all |

**Sizes it must cover** (measured live, CSS px — the capture renders at 2×): the modal hero
row `7 · 9 · 5` is **126×26** (22px type); the per-position boxes and the grid-tile digits
are smaller. A single 1024² asset covers all of them.

### 3. What we are NOT asking you to decide — and one thing worth knowing

**Blur radius is an engineering property, not a look, and we will not implement it as a
blur of the real digits.**

An extreme blur *of the actual numbers* is still derived from those numbers: at high
contrast a blurred 3-digit block is often still readable at a glance, and it is
recoverable by sharpening. The public cut would then be carrying the digits in a weaker
envelope rather than not carrying them.

So the implementation will **never render the real digits in capture mode** — it draws a
placeholder block, blurs *that*, and lays the bolt over it. **Visually identical to what
you asked for**, but the digits never reach the pixels, which makes the frame-by-frame Q1
pass a fact rather than a judgement call about how much blur is enough.

Nothing changes in what you supply.

---

## Original request (for the record)

**What this is:** a fill-in-the-blank list. Engineering needs **replacement words** for
eight on-screen labels. Nothing else — no design, no layout, no video.

**Deadline pressure:** none of the public platforms (YouTube, TikTok, Reddit, X) can be
switched on until this list is filled and implemented. It is the only thing blocking them.

---

## Why this exists (the 30-second version)

The reel's middle section is a **screen recording of the real app**. On a public platform,
the words visible on that screen are read by the same class of classifier that
de-recommended our Facebook page twice.

Four words on our own screen are on the forbidden list: **pick, straight, box, play.** They
appear on every one of the six signal cards, every day.

**Nothing is broken.** Those words are *correct* for the paying subscribers the app is
built for — the brand work deliberately standardised on them. They are only wrong when
that same footage is exported to a public feed. So we are not changing the app; we are
building a **public-only capture mode** that swaps the labels for the recording, and the
subscriber app stays exactly as it is.

We need to know what those labels should say in the public version.

---

## What we need — 8 slots

Rules for every answer:

- **Must not contain:** pick(s), straight, box, play, hit(s), win/won/winning, lottery,
  lotto, bet, gamble, luck, jackpot, payout, partial match, daily/hot picks.
- **Safe vocabulary we already use:** signal, match, verified, pattern, board, session,
  data drop, intelligence, observed outcome.
- **Length:** stay at or under the current character count. These sit in a fixed UI layout
  — longer text wraps or clips, and there is no room to redesign around it.
- **Version-agnostic:** never bake in "ZK6" (must survive ZK30/ZK50).

| # | Where it appears | Current text | Chars | Rule it breaks | Your replacement |
|---|---|---|---|---|---|
| 1 | Card header, all 6 cards | `PICK #1 · ZK6` | 13 | "pick" | |
| 2 | Card, primary number label | `⚡ BEST STRAIGHT` | 15 | "straight" | |
| 3 | Card, number-set label | `BOX SET` | 7 | "box" | |
| 4 | Card tab | `PLAY` | 4 | "play" | |
| 5 | Resolution trail, inline | `· 1 straight` | 12 | "straight" | (may reuse #2's word) |
| 6 | Scope badge on each card | `ALLDAY` | 6 | session label | |
| 7 | Provenance chip, line 2 | `TUE · JUL 28 · ALL-DAY` | 22 | session label | (only the `ALL-DAY` part) |
| 8 | Stinger headline | `ALL-DAY · FIRST LOOK` | 20 | session label | |

**Slots 6–8 are a judgement call, not a straight swap.** The session word (`ALL-DAY`,
`MIDDAY`, `EVENING`) is only forbidden *because it sits next to numbers* — once the digits
are masked it drops from blocking to advisory. So there are two valid answers, and we need
you to pick one:

- **(a) Drop it.** The public cut simply doesn't say which session it is. Simplest, safest.
- **(b) Replace it** with a non-session word (e.g. a time-of-day framing that isn't the
  literal session name). Keeps the three daily drops distinguishable to a viewer.

---

## What we do NOT need from you

These are handled in code and need no copy:

- **The numbers themselves** — masked automatically in the public capture.
- **State codes** (`TX`, `GA`, `SC`…) in the resolution trail — suppressed automatically.

---

## Two things worth knowing

1. **Zero new video generation.** Slots 7 and 8 are config strings over the *existing*
   motion files, exactly like the endcard and stinger copy already works. Changing a
   headline is a text edit and a re-run, not a re-render.
2. **This unlocks a second thing.** The same masked capture is what the **free-group
   Midday/Evening reel** has been blocked on. One build, two payoffs.

---

## Acceptance bar

The public cut ships only when a frame-by-frame check finds **zero** violations — not
"reviewed", **empty**. If a slot's replacement still trips the vocabulary lint, it comes
back to you rather than getting waved through.

Please return the eight strings (or six, if you choose "drop it" for 6–8).
