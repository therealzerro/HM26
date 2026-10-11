# MKT-83 — WEEKLY RECEIPTS FRAME · GENERATION PROMPT v2 (2026-10-11)

Written to the measured requirement after IMG_0490 failed the gate (screen 918×532 px on the canvas vs the ≥ 912×1064 px the ruled chip law needs; crown intruded 5 px). Generator: Gemini Omni (operator's call for this asset; §11 conventions applied — scene stated as what IS, negatives only in the closing exclusions, no broadcast/studio/news/desk vocabulary, ornaments exclusion). Anchor identity comes from the attached reference image.

## Target geometry (what the gate will measure, in the 928 × 1152 source)

| element | requirement | source px | % of frame |
|---|---|---|---|
| output size | portrait, 4:5 | 928 × 1152 | — |
| screen INNER edge, left → right | ≥ 779 wide | x 73 → 855 (782) | 7.9 % → 92.1 % |
| screen INNER edge, top → bottom | ≥ 908 tall | y 63 → 979 (916) | 5.5 % → 85.0 % |
| → on the 1080 × 1350 canvas | ≥ 912 × 1064 | 916 × 1073 | — |
| glow border | ONE thin line, just outside the inner edge | ~3 px | — |
| anchor band | everything of him below the screen | y 992 → 1152 | bottom 14 % |
| clearance | helmet top below the lower glow line | ≥ 12 px | ≥ 1 % |

Gate after landing: `python3 -I scripts/brief-frame-gate.py assets/marketing/<file>.png` — PASS needs axis ≤ 2 px per edge, interior uniform dark (no intrusion above luminance 90), single border, crop survival, and the inner rect ≥ 779 × 908 source px.

## PROMPT — paste as written (attach the anchor reference image)

A fictional science-fiction scene, a single still image, portrait orientation 4:5, 928 × 1152 pixels.

The anchor from the attached reference image, rendered exactly as in the reference: the same black helmet with the glowing violet visor band, the same small round reading glasses resting on the front of the visor, the same navy suit, white shirt and dark red tie, the same black articulated hands. He holds a plain white ceramic coffee mug in one hand. Keep his design, materials and colours identical to the reference.

Composition, measured against the full image: a very large flat rectangular glass screen fills the upper part of the frame. Its inner glass area spans from 8 percent to 92 percent of the image width and from 5 percent to 85 percent of the image height, so the screen is 84 percent of the width and 80 percent of the height. The screen is perfectly rectangular, perfectly level and square to the image edges, seen straight on with no perspective, no tilt and no rounding of the corners. Its edge is one thin, continuous violet-purple glowing line about three pixels wide, the same glow as the visor band, with no second line, no bezel and no inner shadow. Inside the line the glass is uniformly near-black, a single flat dark tone from edge to edge, with no reflection, no gradient, no haze, no light bloom and nothing drawn on it.

The anchor is small and sits entirely in the band below the screen, in the bottom 14 percent of the image, centred left to right. Only his head, shoulders and the top of his chest with the mug raised in one hand are visible, as if he is seated at a low surface just under the screen. The top of his helmet sits a clear margin below the screen's lower glowing edge and never touches or crosses the line. His helmet is about one fifth of the image width.

The space around the screen and behind the anchor is the same deep purple-black environment as the reference, softly out of focus, with a faint cool rim light on the helmet and shoulders. Below the anchor is a dark reflective surface. Lighting is calm and even; the glow line of the screen is the brightest element in the image.

Exclusions: no text, letters, numbers, logos, icons, watermarks or symbols anywhere in the image, on the screen, on the mug or in the background. No ornaments, sparkles, stars, lens flares, corner marks or decorative flourishes of any kind, anywhere in the frame. No object, hand, helmet or glow enters the screen area or crosses its edge line. No reflections, highlights or images on the glass. No second figure. No cash, coins, tickets, dice, cards or gambling imagery. No desk furniture, microphones, monitors or other screens.

## If the first render seats him too high
Omni tends to centre the figure. If the helmet lands inside the screen band, re-run with this sentence added to the composition paragraph, unchanged otherwise: "The screen's lower glowing edge is at 85 percent of the image height; the anchor's helmet begins below 87 percent."
