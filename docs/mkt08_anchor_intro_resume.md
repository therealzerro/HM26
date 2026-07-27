# MKT-08 — Anchor intro lane: RESUME NOTE (2026-07-27)

Session interrupted mid-Phase-1-gate. Everything below is committed (`cb86c87`).

## ID note
The work order said "MKT-05", but MKT-05/06/07 are already used in MASTER_AUDIT
(captions / preflight / slate stamp). This lane is **MKT-08**. Operator approved
at the Phase 0 gate.

## State: Phase 1 code COMPLETE and pushed, gate NOT cleared

`assets/marketing/anchor_intro.mp4` **has not been delivered yet**. With no such
file the probe returns null and both assemblers produce byte-identical output to
today — so the committed code is inert for the daily run. Safe to leave as-is
indefinitely.

Shipped in `cb86c87`:
- `scripts/reel-intro.ts` — shared probe. Audio stream required, duration
  3.5–6.5s, <100KB rejected (GitHub web-rename guard). Never aborts; logs a NOTE
  and returns null so assembly always proceeds.
- Both assemblers — intro replaces the endcard-lockup open, 0.8s dissolve from
  its smoke tail into the body. Key detail: `tpad=start_duration=dissolve` (NOT
  openDur) with `xfade offset=openDur-dissolve`; xfade aligns input2's t=0 at
  `offset`, so padding by openDur would double-shift the body and inflate the
  total. Legacy reduces exactly to pad 1.2 / offset 0.
- MKT-07 slate stamp fades + contact-sheet timestamps re-keyed off the shifted
  timeline. Legacy values verified reproduced exactly:
  allday `[0,3,6.5,12,18.6,23.3]`, verify `[0,1.5,5,8]`.
- Audio: intro's own audio 0→introDur; carrier VO enters at introDur−0.4 via
  `adelay`+`amix`; hum bed and endcard outro repositioned; single −14 LUFS
  loudnorm at the end as before.
- `reel:check` — anchor_intro contract (missing = PASS/note, defective = FAIL,
  tail luma-spread smoke check via signalstats) and intro-shifted carrier
  windows. Intro check runs FIRST because it sets `INTRO_ACTIVE`.

Approved amendments now encoded:
- **A** — allday wall-to-wall VO ceiling 18.3s → **17.5s raw / script to ~17.0s**.
- **B** — verify carrier need 10.0s → **9.2s** when the intro is active (flat,
  independent of intro length).
- **D** — missing intro is non-blocking in `reel:check`.

## What's left

**Phase 1 gate (owed):** assemble a placeholder-intro sample (allday pair +
verify) and deliver contact sheets for review. Script ready and NOT yet run:
`/tmp/.../scratchpad/sample_intro2.sh` — recreate as below if the scratchpad is
gone. Two gotchas already hit:
1. Samples MUST use throwaway stamp `19700101` (copy `ui_allday_*`/`ui_verify_*`
   to that stamp) so live 7/27 reels are never overwritten.
2. A flat-colour placeholder encodes to ~98KB and trips the <100KB corrupt
   guard. Give the placeholder a busy first segment (e.g. `geq` noise) so it
   exceeds 100KB, while keeping the final ~0.8s flat for the dissolve/luma check.
3. The generator must `trap cleanup EXIT` to delete `anchor_intro.mp4` — a
   leftover placeholder must never survive into a daily run.

Pass 1 did assemble `allday_pro_19700101.mp4` successfully (7.6MB, intro
composited) before being stopped; artifacts were deleted during shutdown.

**Phase 2 (not started):** real-asset run once `anchor_intro.mp4` lands →
confirm −14 LUFS integrated across the new timeline, no clicks at the two new
joins, **and the 1:1 centre-crop check flagged at Phase 0** (crop keeps y
420–1500; the "raises a phone" gesture is the risk). Then update
`assets/marketing/Reel_System_Handoff_2026-07-27.txt` §2 (timeline + VO beat map
+ new 17.0s finish rule), §3 (verify timeline), §7 (inventory row + intro
delivery spec), and append the **MKT-08** entry to MASTER_AUDIT.md. Diff before
commit.
