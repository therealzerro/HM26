# MKT-15 Phase 2 — copy request for the content agent

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
