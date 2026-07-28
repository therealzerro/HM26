MKT-11 — rotating promo panels · gate artifacts (2026-07-27)
================================================================================
All four images are from the FINAL in-app implementation, not the superseded
video-composite build.

  gate_all_six_placements.png  one frame per modal (1-6), each showing that
                               modal's panel in the day's rotation
  gate_pro_contact.png         Pro reel contact sheet — 8 tiles: intro, the six
  gate_free_contact.png        modal midpoints, endcard (Free likewise)
  gate_panel_100pct.png        native-resolution crop, no downscale, showing the
                               panel sitting under the "RESOLVED IN" card

HOW THE PANEL GETS THERE
The panel is a real element of the app's pick-detail modal
(components/ReelPromoPanel.tsx), so the reel renderer captures it the same way
it captures everything else on screen. It is NOT composited onto the video.

WHY YOU DO NOT SEE IT IN THE APP
It renders only while the reel renderer is driving the app — render-allday-body.ts
sets `hm:reel-capture` in localStorage before the page loads, and nothing else
ever sets it. Verified in both directions on 2026-07-27:
  - with the flag    → panel captured in all six modals
  - without the flag → premium session, pick-detail modal open, `hm:reel-capture`
                       null and ZERO panel <img> elements in the DOM
The artwork is also served by URI from public/reel-panels/ rather than bundled,
so the ~3.3MB never ships inside the native app.

NOT PRESENT HERE
An earlier build composited the panels onto the finished video and produced a
hard-cut vs 0.15s-crossfade comparison. That implementation was stripped, and
with it the transition question — panel changes are now just modal cuts.
