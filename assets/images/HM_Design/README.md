# Handoff: HitMaster (Neon Direction)

## Overview
HitMaster is a personal numbers analysis tool. The engine generates ranked **slate combos** (3-digit picks) and scores each across four signal channels: **Frequency**, **Momentum**, **Pattern**, **Consistency**. Users browse generated slates by scope (Midday / Evening / All Day), drill into a Pick Detail with confidence + signal breakdown, and review historical hits in Results.

This handoff covers the **Neon visual direction** — the production look. A second, austere "data-terminal" direction is included for reference (`HitMaster.html`) but is **not** the target.

## About the Design Files
The files in this bundle are **design references created in HTML / React (inline JSX via Babel)** — prototypes that show the intended look, layout, and component composition. They are **not production code** and should not be shipped as-is.

The task is to **recreate these designs in the target codebase's existing environment** (React Native / SwiftUI / Flutter / etc.), using established patterns, navigation, and state management. If no codebase exists yet, choose a framework appropriate for cross-platform mobile (React Native or Expo recommended given the design density).

## Fidelity
**High-fidelity.** Colors, typography, glow effects, gradient stops, spacing, and component structures are all final. Recreate pixel-close — the neon glow language is core to the brand and must survive the port.

## Screens / Views

### 1. Home (`ScreenToday` in `HitMaster Neon.html`)
**Purpose:** Landing screen. Live ticker, next draw countdown, Today's Slates hero, current Hot Streak.

Layout (top → bottom, single scroll column, 14px horizontal padding):
1. **Live ticker rail** — horizontal scroll of pills: a `LIVE 6` amber pill (pulsing dot), then state/draw pills (`PA 9 2 3 6 8`, `CT 3 1 9`, `2O 2 8 7`).
2. **Heat Check pill** — full-width rounded search bar, copy: `🔍 Heat Check Any Combo`.
3. **Next Draw card** — `NEXT DRAW` eyebrow + state name (`🌙 PA Evening`, `6:25 PM ET`), right side shows a glowing amber countdown `17:25:50` in JetBrains Mono. Below: "UP NEXT" row with the next two draws as colored-dot text rows.
4. **Today's Slates hero** — large `Today's Slates` title, sparkle glyph at top-right. Big cyan `98` (54px JetBrains Mono) + `AVG ENERGY` eyebrow, fire emoji at 46px with amber drop-shadow, "6 slate picks visible" subtitle. Hairline divider, then `Performance Status` row with cyan `ZK6 ENGINE OPTIMISED` outline pill, "$.98/month PRO Access Active" centered subtitle.
5. **Hot Streak card** — amber-glow card (`box-shadow: 0 0 0 1.5px #ff6a2b, 0 0 22px rgba(255,106,43,.55)`).
   - `🔥 HOT STREAK — Energy 100/100` banner
   - Pick row: `Pick #1` label, then three big digits `8` `7` `2` with a small `Neural Path` callout between digits 1 and 2
   - Right side: 48px amber NeonRing showing `100%`, `OH FIRE` label, `tap ↗` hint
   - `Box: {2,7,8}` line
   - Tag pill row: `BOX` (cyan), `MD` (purple), `CO` (purple), `ROC` (amber), right-aligned `Syncing converging` text
   - Four NeonBars: Frequency 95% (cyan), Newentum 37% (rose), Pattern 27% (purple), Consistency 100% (amber)
   - Footer row: timestamp + Share pill
6. **Live row** at bottom: small mono pills (`LIVE`, `7A 3 6 8`, `GT 2 1 9`, `ID 1 2 8 7`).
7. **Bottom tab bar** (Home active).

### 2. Slates (`ScreenRanked`)
**Purpose:** Compact ranked list of all generated slates for a scope.

Layout:
1. **Neon header** — bolt logo, `K6 Slates` title, `Generate` purple gradient button.
2. **Scope chips rail** — `🌙 Midday`, `🌙 Evening` (active), `✦ All Day`, `📅 Yesterday`.
3. **Save banner** — `📖 Save This Slate to Number Book` outline pill.
4. **View toggle** — `≡ List` and `▤ Compact` pills (Compact active).
5. **Ranked rows** — vertical stack of 7 cards. Each card has a 1.5px gradient-tinted border with matching outer glow. Row contents:
   - Medal column (40px wide): emoji medal for top 3 (🥇 🥈 🥉) + rank text (`1st`, `2nd`, `#4`...)
   - Big combo digits (32px JetBrains Mono Bold) with a faint colored text-shadow
   - Description block (`Yifty This Pick` eyebrow + `high frequency surging` subtitle)
   - `Momentum` label + tiny sparkline svg
   - 36px NeonRing showing % match
   - 30px circular play button with cyan glow
6. **Bottom tab bar** (Slates active).

### 3. Results (`ScreenSlates`)
**Purpose:** Calendar of past slates by date with hit highlights.

Layout:
1. **Neon header** (same as Slates).
2. **Date chip rail** — `✦ Yesterday`, `🌙 May 4` (active), `✦ May 3`, `📅 May 1`.
3. **Heat Check pill** — same component as Home.
4. **Stat tile row** — five glowing tiles: `2 Morn` (amber), `31 Midday`, `34 Evening`, `7 Night` (purple), `74 ZK6 Hits` (cyan). Each tile is bordered with its color at 33% opacity + matching outer glow.
5. **Slate row cards** — large 3 cards stacked. Each has:
   - Circular avatar bubble (TN/TX/KY) — radial gradient fill, 2px solid neon border, drop-shadow glow
   - State + game label (`TN · Cash 3`)
   - Mode subtitle with colored half-circle glyph (`◐ Morning`)
   - Optional `ZK6 HIT` outline badge in matching color
   - Right side: massive 38px combo digits + `F:07 B:72 S:02` mini stats row
6. **Performance footer** — neutral card with `ZK6 PERFORMANCE — Yesterday` heading.
7. **Bottom tab bar** (Slates active).

### 4. PickDetailModal (`ScreenPickDetail`)
**Purpose:** Extended detail when tapping a slate; full breakdown of why this pick scored.

Layout:
1. **Neon header.**
2. **Pick #1 card** — purple-bordered card containing:
   - Header: `🏅 PICK #1` + close button
   - Left: 130px cyan NeonRing showing `94%` + `MATCH` sub-label
   - Right column: cyan `ZK6 INTELLIGENCE MATCH` eyebrow, then two rows of `46px digit + 30px amber dash` (`8 —`, `2 —`)
   - Position chips row: three boxed digits with `Pos 1/2/3` labels, color-coded
3. **Signal Breakdown card** — neutral border. Left column: `SIGNAL BREAKDOWN` heading, four NeonBars (Frequency 100%, Momentum 72%, Pattern 30%, Consistency 0%). Right column: 86px amber NeonRing showing `100`, `ON FIRE🔥` label below.
4. **Pair Intelligence Matrix card** — `PAIR INTELLIGENCE MATRIX` heading, `Advanced Data Matrix Grid` subtitle, then a 4-column × 6-row grid table (PAIR | 87 | 72 | 82 across the header, then Momentum / Pattern / Signal Sync / Historical / Drow0op rows with %s). Header row has a purple tint background.
5. **Bottom tab bar** (Slates active).

## Interactions & Behavior
- **Generate button** (header, every screen): triggers a regen of the current slate set. Anticipated animation: pulse the gradient, briefly cycle the slate digits before settling on new values.
- **Heat Check pill** (Home, Results): opens a search/lookup sheet for any 3-digit combo.
- **Date / scope chips**: tap to switch active filter. Active state has gradient fill + outer glow; inactive is flat dark.
- **Slate row tap** (Results / Slates): opens the PickDetailModal as a bottom sheet (web prototype shows it as full screen — production should be a sheet covering ~88% of viewport with a drag handle).
- **Play button** (Slates compact rows): plays a quick "draw simulation" mini-animation.
- **Live ticker** (Home): horizontally scrollable, auto-scrolls every ~5s.
- **Pulsing dot** in `LIVE` pill: 1.6s ease-in-out opacity 1 → .35 → 1.
- **NeonRing fill animation**: on first render, animate `strokeDasharray` from 0 to value over 800ms, ease-out.

## State Management
- Active scope (Midday / Evening / All Day / Yesterday) — persisted per session
- Active date selection on Results
- Current slate set (rank-ordered list of combos with confidence + four signal scores each)
- Live ticker draws (state + 3-digit combos, polled or via websocket)
- Next draw timer (server time, decremented locally, resyncs each minute)
- Pick detail open/closed + selected pick id
- View mode (List / Compact) on Slates

## Design Tokens

### Color
```
bg page          #0a0613   (with radial gradient ellipse to #1c0d36 at top)
surface          #120a1f
card             rgba(20,12,38,0.72)
border-soft      rgba(255,255,255,0.08)
text             #FFFFFF
text-secondary   rgba(255,255,255,0.72)
text-tertiary    rgba(255,255,255,0.45)

cyan             #2bffcc   (hits, frequency)
cyan-2           #15d9a8
rose             #ff3d9a
rose-2           #e91e63
amber            #ff6a2b   (fire, hot streak, momentum highlight)
amber-2          #ff3b30
gold             #ffd93d
purple           #9b5bff   (primary brand, generate button)
purple-2         #b388ff
blue             #22a3ff
```

### Glow recipes (CSS)
```css
.glow-cyan   { box-shadow: 0 0 0 1.5px #2bffcc, 0 0 22px rgba(43,255,204,.45),
                          inset 0 0 18px rgba(43,255,204,.08); }
.glow-rose   { box-shadow: 0 0 0 1.5px #ff3d9a, 0 0 22px rgba(255,61,154,.45),
                          inset 0 0 18px rgba(255,61,154,.08); }
.glow-amber  { box-shadow: 0 0 0 1.5px #ff6a2b, 0 0 22px rgba(255,106,43,.55),
                          inset 0 0 18px rgba(255,106,43,.10); }
.glow-purple { box-shadow: 0 0 0 1.5px #9b5bff, 0 0 22px rgba(155,91,255,.45),
                          inset 0 0 18px rgba(155,91,255,.08); }

/* glowing text */
.gtext-cyan  { color:#2bffcc; text-shadow:0 0 8px rgba(43,255,204,.6); }
.gtext-amber { color:#ff6a2b; text-shadow:0 0 10px rgba(255,106,43,.7); }
/* etc. — pattern is color + text-shadow at 60-70% alpha */
```

NeonRing components apply `filter: drop-shadow(0 0 20px <color>aa)` to the SVG.

### Typography
```
sans (UI)        Inter — weights 400 / 500 / 600 / 700 / 800 / 900
mono (digits)    JetBrains Mono — weights 400 / 700 / 800

scale:
  eyebrow / caps  9–11px / 700 / letter-spacing 0.14em–0.18em / uppercase
  body            12–13px / 600
  card title      16–18px / 700–800
  screen title    24px / 800 / -0.01em
  big stat        22–32px / 800 / -0.02em
  combo digit     32–54px / 800 / -0.02em / mono
  hero combo      72px / 800 / -0.05em / mono
```

### Spacing
8px base grid throughout. Card padding 14–18px. Card-to-card vertical gap 12–14px. Section padding 14px horizontal.

### Border radius
- 999px (pill) for chips, search bars, generate button
- 16px slate row cards
- 12–14px content cards
- 10px stat tiles, position chips
- 8px small action banners

### Drop-shadow glows
SVG rings: `drop-shadow(0 0 20px <color>aa)` (66% opacity ≈ `aa`).
Avatar bubbles: `box-shadow: 0 0 16px <color>99, inset 0 0 12px <color>55`.

## Component Inventory

| Component        | File location                       | Purpose                                                      |
|------------------|-------------------------------------|--------------------------------------------------------------|
| `Pill`           | `HitMaster Neon.html`               | Generic rounded chip with optional active gradient + glow    |
| `StatTile`       | `HitMaster Neon.html`               | Stat number + label tile, color-bordered                     |
| `AvatarBubble`   | `HitMaster Neon.html`               | Radial-gradient circle for state codes (TN, TX, etc.)        |
| `SlateRow`       | `HitMaster Neon.html`               | Big card row with avatar + label + combo + F/B/S stats       |
| `DateChip`       | `HitMaster Neon.html`               | Pill with emoji glyph + label, active glow                   |
| `GenerateBtn`    | `HitMaster Neon.html`               | Purple-gradient pill button                                  |
| `NeonRing`       | `HitMaster Neon.html`               | SVG ring with linear-gradient stroke + drop-shadow glow      |
| `NeonBar`        | `HitMaster Neon.html`               | Signal bar with gradient fill + glow                         |
| `BottomTabNeon`  | `HitMaster Neon.html`               | 7-tab bottom navigation, gold active state                   |
| `NeonHeader`     | `HitMaster Neon.html`               | Logo + bolt + title + Generate button bar                    |

## Assets
- **Fonts:** Inter and JetBrains Mono via Google Fonts. In a native app, ship them as bundled font files.
- **Icons:** mostly emoji glyphs (🔥 ✦ 🌙 📅 📈 ⚙ ◐ 🥇 🥈 🥉 ⚡ 🏅) and Unicode geometric shapes (◧ ◎ ⌂ ▶ ▤ ≡). For native, swap to a real icon set (Lucide, Phosphor) or commission custom glyphs to match the neon theme. Neon stroke versions are recommended over filled glyphs.
- **No raster imagery** is used. All visual texture comes from glow + gradient.

## Global Theme Files (`theme/`)
The `theme/` folder is the **single source of truth** for the entire app's visual system. Drop these into your codebase and reference them everywhere — never hard-code a color or spacing value.

| File | Use |
|---|---|
| `theme/hitmaster-theme.css` | CSS custom properties + utility classes (`.hm-card-*`, `.hm-pill`, `.hm-signalbar`, `.hm-temp`). Link once at app root for any web/RN-Web/Electron build. |
| `theme/hitmaster-theme.js` | ES module exporting `theme`, `colors`, `temperature`, `channels`, plus helpers `temperatureTier(v)`, `temperatureColor(v)`, `channelColor(key)`. Works in plain JS, React, and React Native. |
| `theme/hitmaster-tokens.json` | Design-tokens-format JSON. Feed into Style Dictionary / Theo / Tokens Studio to generate platform outputs (Swift, Kotlin, Tailwind, etc.). |

### Usage
```html
<!-- web -->
<link rel="stylesheet" href="theme/hitmaster-theme.css">
<div class="hm-card-cyan">…</div>
<div class="hm-signalbar" data-channel="BOX">
  <span class="hm-signalbar__label">BOX</span>
  <span class="hm-signalbar__track"><span class="hm-signalbar__fill" style="width:49.2px"></span></span>
  <span class="hm-signalbar__value">82</span>
</div>
<span class="hm-temp" data-tier="warm">WARM 75°</span>
```
```js
// JS / RN
import theme, { temperatureColor, channelColor } from './theme/hitmaster-theme';
const tempC = temperatureColor(75);  // → "#ffcc00"
const boxC  = channelColor('BOX');   // → "#2bffcc"
```

## Data Model & Component Metrics (per data spec)

### SlateCard payload
```json
{
  "rank": 1,
  "combo": "742",
  "comboSet": "{2,4,7}",
  "temperature": 75,
  "multiplicity": "singles",
  "topPair": "24",
  "components": { "BOX": 0.82, "PBURST": 0.65, "CO": 0.45, "DGC": 0.91 }
}
```

### SlateCard layout (auto-layout)
- Container padding **12px horizontal / 8px vertical**, vertical gap **8px**
- Rank container **width 32px, padding-right 8px**
- Header row: rank · confidence · energy/temperature
- Body row: 3-digit combo display + comboSet/topPair sidebar
- Footer: 4 SignalBars (BOX · PBURST · CO · DGC)

### SignalBar (exact)
- Bar container `height: 4px`, `gap: 6px`
- Label `width: 60px`, `fontSize: 9pt`, `color: #666`
- Fill `width = value * 60px` (max 60), `borderRadius: 2px`
- Value `width: 22px`, `fontSize: 9pt`, `fontWeight: 700`

### Temperature → color (canonical)
| Range | Tier | Color |
|---|---|---|
| `>= 80` | `hot`  | `#FF3B30` |
| `>= 60` | `warm` | `#FFCC00` |
| `>= 40` | `mild` | `#34C759` |
| `< 40`  | `cold` | `#666666` |

Use `temperatureColor(value)` in JS or the `[data-tier]` selectors in CSS — never duplicate this table elsewhere.

### Channel → color mapping (canonical)
| Channel | Color | Token |
|---|---|---|
| BOX (frequency)    | cyan   | `--hm-ch-box`    |
| PBURST (momentum)  | rose   | `--hm-ch-pburst` |
| CO (cluster)       | purple | `--hm-ch-co`     |
| DGC (consistency)  | gold   | `--hm-ch-dgc`    |

## Files in this bundle
| File                          | Use                                                      |
|-------------------------------|----------------------------------------------------------|
| `HitMaster Neon.html`         | **Primary reference** — 4 screens + neon component closeups |
| `HitMaster.html`              | Alt direction (austere data-terminal). Not the target — included for context. |
| `components.jsx`              | Austere primitives (referenced by HitMaster.html only)   |
| `screens.jsx`                 | Austere screen comps (referenced by HitMaster.html only) |
| `design-canvas.jsx`           | Pan/zoom canvas wrapper used by both HTML files          |
| `ios-frame.jsx`               | iOS device bezel used to render screens at phone scale   |
| `android-frame.jsx`           | Android device bezel                                     |
| `tweaks-panel.jsx`            | Live tweak controls (palette/density/font) for the austere version |

## Open the files
Open either HTML file directly in a browser — they bundle React 18 + Babel via CDN. The neon design canvas pans/zooms and any artboard can be opened fullscreen for inspection.
