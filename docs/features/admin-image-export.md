# Admin Image Export

Operator-only image export pipeline for the daily reel composition workflow.
Generates 7 still PNGs per session (1 slate composite + 6 pick composites)
that the operator then composites externally into reels with theme music and
pre-built brand frames.

**Audit:** `ENH-EXPORT-2026-05-23` in `MASTER_AUDIT.md`
**Effective:** 2026-05-23
**Runtime:** Web only (see "Web-only constraint" below).

---

## Operator workflow

1. Open HitMaster on the web. (Not iOS — see the constraint section.)
2. Triple-tap into admin mode and open the **Admin** tab.
3. Tap **🖼 Image Export** in the admin horizontal nav.
4. Choose **Export type**:
   * **Public** — digits redacted with block characters, CTA banner appended at
     bottom of every image.
   * **Pro** — full fidelity, no banner.
5. Choose **Session** — Midday, Evening, or All-Day.
6. Tap **Generate Images**.
7. The browser downloads 7 PNGs to your default Downloads folder. Filenames
   follow the convention below. Previews render inline on the screen.
8. Re-tap **Generate Images** to regenerate (browser will deduplicate filenames
   per its own rules — typically appending ` (1)`, ` (2)`, etc.).

---

## Filename convention

```
hm-{type}-{session}-{date}-{name}.png
```

| Field   | Values |
|---------|--------|
| type    | `public` \| `pro` |
| session | `midday` \| `evening` \| `allday` |
| date    | `YYYY-MM-DD` (ET) |
| name    | `slate` \| `pick-1` … `pick-6` |

Examples:

```
hm-public-midday-2026-05-23-slate.png
hm-public-midday-2026-05-23-pick-1.png
hm-pro-evening-2026-05-23-pick-4.png
```

---

## Redaction rules

When **Public** mode is selected, the following content is replaced with block
characters (`▓`):

| Surface | Redacted |
|---------|----------|
| Slate grid tile — main digits | `▓ ▓ ▓` |
| Slate grid tile — comboSet text | `{▓,▓,▓}` |
| Pick poster — hero digits (`X · Y · Z`) | `▓ · ▓ · ▓` |
| Pick poster — P1/P2/P3 boxes | each digit → `▓` |
| Pick poster — PARTIAL SET combo | `{▓,▓,▓}` |
| Pick poster — front/back/split pair labels | `▓▓` |
| Pick poster — WhyRow description text | replaced with generic CTA |

Everything else stays visible — HOT rating, rank/SIGNAL #, SGL/DBL flag, bar
visuals, percentages, methodology indicators, brand wordmarks, signal scores.

Pro mode renders the same composites with **zero redaction** and no banner.

---

## CTA banner content

Source of truth: `components/PublicExportBanner.tsx`.

* **Dimensions:** full 1080px wide × 150px tall.
* **Background:** deep navy `#0A1525`.
* **Text:**  `FULL SLATE INSIDE · JOIN THE FREE COMMUNITY ⚡`
  * `FULL SLATE INSIDE` — white
  * `·` and spacers — white at 60% opacity
  * `JOIN THE FREE COMMUNITY` — cyan `#00D4FF`
  * `⚡` — gold `#FFD700`
* **Top border:** 1.5px cyan rule at 55% opacity separating the banner from
  the poster content above.

**To change banner content:** edit `components/PublicExportBanner.tsx`. This
is intentional — banner copy/styling changes require a code edit so they go
through review, preventing accidental drift on a public-facing surface.

The banner is *not* rendered on any user-facing surface in the app. It exists
only inside the off-screen capture stage on `app/admin-image-export.tsx`.

---

## Architecture

```
app/admin-image-export.tsx           ← operator UI + capture orchestration
  │
  ├── components/SlatePosterCard.tsx ← redactable slate tile (also used by explore.tsx grid)
  ├── components/PickPosterCard.tsx  ← redactable single-pick poster
  ├── components/PublicExportBanner.tsx
  ├── components/pickVisuals.tsx     ← SignalPill / WhyRow / EnergyArc (shared with PickDetailModal)
  └── lib/captureExportImage.ts      ← html-to-image wrapper + filename builder
```

### Invariants protected

* **INVARIANT 1 (zero regression):** `SlatePosterCard` without `redact` prop
  renders identically to the prior inline `GridTile`. `PickDetailModal` still
  uses the same `SignalPill` / `WhyRow` / `EnergyArc` primitives — they were
  extracted to `pickVisuals.tsx` rather than forked, so any styling change
  reflects in both production and exports.
* **INVARIANT 2 (no side effects):** Export reads the latest snapshot for the
  selected scope via `fetchFromSupabase` *once* per Generate tap. No engine
  recomputation, no writes, no telemetry. The READ is an explicit carve-out
  documented in the screen's header comment.
* **INVARIANT 3 (admin-only surface):** Screen is registered as a stack route
  reachable only from the Admin tab's horizontal nav. No user-facing
  navigation links to it.
* **INVARIANT 4 (reuse, don't fork):** `SlatePosterCard` is the production
  grid tile (explore.tsx migrated to use it). Visual primitives
  (`SignalPill`/`WhyRow`/`EnergyArc`) live in a shared module imported by both
  `PickDetailModal` and `PickPosterCard`. Banner content is a single composable
  element, not a modification to slate/modal internals.

### Capture pipeline

1. Operator taps Generate.
2. Screen fetches the latest snapshot for the chosen session via
   `v_latest_slate_snapshots` and converts the `top_k_straights_json` array
   into `PickItem[]`.
3. The hidden capture stage (`position:absolute; left:-100000px`) is
   re-rendered for each composite (slate, then 6 picks). Stage width/height
   is locked to 1080×1920.
4. Between renders the screen awaits `requestAnimationFrame` twice (so React
   commits + lays out) and `document.fonts.ready` (so brand fonts settle).
5. `html-to-image.toPng` snapshots the stage DOM node at exact dimensions
   and the resulting dataURL is downloaded via an anchor click.

### Web-only constraint

`react-native-view-shot` (the standard RN screenshot tool) is a native module
that requires an EAS dev build to be added. The repo currently ships through
Expo Go, so iOS capture is gated until that pipeline is available — see
`MEMORY.md → Edge ZK6 flag flip` for the broader iOS readiness picture.

The screen displays a notice and disables Generate when opened on iOS.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Image export is web-only…" notice | Opened on iOS. | Open HitMaster on the web. |
| "No active snapshot found for {Session}" | Selected session has no recent slate. | Generate the slate in the Slates tab first, then return. |
| Browser asks repeatedly to allow multiple downloads | Browser blocks bulk downloads by default. | Allow the prompt; subsequent runs proceed without prompting in the same tab. |
| Image looks empty / black | Capture fired before fonts/SVG loaded. | Wait a few seconds after page load before tapping Generate. The screen already waits for `document.fonts.ready` but slow CDN loads can still beat it. |
| Filenames overwrite each other | Re-running the same session/type/date. | Browsers append ` (1)`, ` (2)` automatically — rename files yourself if needed. |
| Banner missing on Public images | `PublicExportBanner` not mounted in stage. | This shouldn't happen — but if it does, verify `exportType === 'public'` and that `<PublicExportBanner />` renders in the JSX inside the stage. |
| Pro export has banner | `redact` prop or banner conditional regressed. | Search the stage JSX for `<PublicExportBanner` — it must be gated on `isPublic` (i.e., `exportType === 'public'`). |

---

## What's deliberately NOT in scope

* Video generation — operator composites externally.
* Theme music handling — external editor.
* Opener / brand-close frames — operator pre-builds once.
* Auto-upload to Facebook or any social surface.
* Public-facing user feature — admin-only.
* Multi-day batch export — one session at a time per tap.
* Custom redaction styles — single consistent block character.
* Engine modifications — pure rendering only.
* Banner content customization in UI — code edit only.
* Pro banner — Pro exports never include a banner overlay.
