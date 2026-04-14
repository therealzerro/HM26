
HITMASTER — PHASE 2.5 AUDIT, FIXES & NEXT ENHANCEMENTS (NO CODE)
Audience: AI Mobile App Engineer (implementation guidance, step‑by‑step)
Context: Phase 1 is partially complete, Supabase is connected, schema.sql has been run. The following addresses the four errors reported and advances Admin Settings, Import Workflows, and Slate Regeneration to “live, deterministic, and explainable.”

— SUMMARY OF USER‑REPORTED ERRORS —
E1) System not fully switched to LIVE DATA (still showing mocks/stubs in places).
E2) No IMPORT CONFIRMATION (admins cannot verify what was committed).
E3) No way to VIEW or DELETE imported data.
E4) Import horizons 1..10 are not fully populated (only H01Y..H05Y visible/usable).

============================================================
A) CRITICAL FIXES — MAKE IT LIVE & AUDITABLE (DO FIRST)
============================================================
A1) Live Data Switch & Source‑of‑Truth Gate (fixes E1)
Goal: Ensure every read comes from Supabase views/RPCs, not from local mocks.
Implementation steps:
1. Add a single “data mode” resolver in the client (no secrets):
   • MODE = “online” → all screens fetch from Supabase views only.
   • MODE = “offline” → only for demo; explicitly show “Offline demo” ribbon.
2. Kill all implicit fallbacks. If a live call fails, show a typed empty state + retry, not mock data.
3. Wire Home/Slate to a single read‑only view: v_latest_slate_snapshots (one row per scope).
   • Required columns: id, scope, horizons_present_json, weights_json, top_k_straights_json, top_k_boxes_json, updated_at_et, hash.
4. Wire Results (ledger feed) to a read‑only view v_recent_ledger (grouped by jurisdiction + session) or an RPC that returns last N draws per scope.
5. Status Ribbon must read from live snapshot metadata (last updated ET, coverage chips, normalization=“percentile”, winsor=“p99”, backend=“Online”).

A2) Import Confirmation UX & Server Echo (fixes E2)
Goal: After a commit, Admin sees exactly what the server accepted and any fixes applied.
Implementation steps:
1. Import Wizard adds a REVIEW step with a “Commit” button summary:
   • File name, class_id, horizon_label (H0nY), scope, row counts, detected header mapping.
2. On commit, server returns a canonical ImportSummary:
   • {id, type, class_id, horizon_label, scope, accepted, rejected, fixed, warnings[], p99_cap?, first_seen?, last_seen?}
3. Show a modal “Import committed” with the ImportSummary, plus a “View details” link (navigates to Import History table filtered to the new import).

A3) Import History, Detail, and Delete/Undo (fixes E3)
Goal: Admin can browse history, open any import, and delete/undo safely.
Implementation steps:
1. Build Admin → “Import History” table:
   • Columns: timestamp, type, class_id, horizon_label, scope, accepted/rejected/fixed, status, actor.
   • Filters: type, class, horizon, scope, date range. Pagination + search.
2. Detail Drawer (row click):
   • Show the ImportSummary + first/last 50 normalized rows (server paged).
   • Show computed p99, percentile map version, and blend coverage impact.
3. Deletion/Undo controls:
   • “Soft delete import” → marks import as deleted and runs a server rollback routine:
     – Remove rows inserted by this import from datasets_*.
     – Recompute p99 and percentiles for affected (class×scope×horizon).
     – Recompute horizon_blends coverage.
     – Materialize slates if coverage changed.
   • “Undo soft delete” → restores the import and re‑runs the same three recomputations.
   • Always log to audit_logs with before/after counts.

A4) Horizon Coverage 1..10 — Matrix & Nudges (fixes E4)
Goal: Support all 10 horizons per class; make gaps obvious and non‑blocking.
Implementation steps:
1. Health → “Horizon Coverage Matrix” (classes rows × H01Y..H10Y columns):
   • Each cell: ✓ (present), ⌛ (declared/expected but not present), — (no data).
   • Clicking a missing cell opens Import Wizard pre‑filled for that class + horizon + scope.
2. On successful import of H0nY, server updates horizon_blends for that class and triggers re‑gen of slates for affected scopes only.
3. Ribbon chips show short summary: “Box H01Y ✓, H02Y ✓, H03Y ⌛ • Pair 1–10 H01Y ✓”.

============================================================
B) ADMIN SETTINGS — CLEAR, SAFE, AND EXPLAINABLE
============================================================
B1) Settings Panel (Admin tab)
• Scoring preset: Balanced (BOX 0.40, PBURST 0.40, CO 0.20) | Conservative (0.85/0.10/0.05).
• Normalization method: “percentile” (default) | “z‑score” (disabled for now).
• Winsor cap: p99 (fixed).
• K6 quotas: Singles≤4 (toggle), Doubles≤2 (toggle), Triples off (locked).
• Pair repetition cap: ≤2 (toggle with tooltip).
• Scope default (Home): Midday | Evening | All‑Day.

B2) Diagnostics Panel (Admin tab)
• Snapshot hashes per scope (latest N).
• Last percentile refresh per class.
• Horizon coverage counts (present/missing per class).
• Last 10 errors/warnings (with links to import detail).

============================================================
C) IMPORT WORKFLOWS — STEP BY STEP (ADMIN‑ONLY)
============================================================
Workflow 1 — HISTORY (Box & Pair)
1) Upload: CSV → header detection → map to canonical keys.
2) Validate: line‑level errors; auto‑fix preview (zero‑pad pairs, sort box digits, parse dates, DS≥0).
3) Review: show derived target (class_id, horizon_label, scope), counts + warnings.
4) Commit: server upserts datasets_* and returns ImportSummary.
5) Post‑commit server hooks:
   • Compute p99 caps, clip ds_raw, persist percentile_maps.
   • Update horizon_blends (coverage + weights).
   • Log audit_logs; optionally materialize slates (toggle).
6) Confirmation modal + link to Import History (filtered).

Workflow 2 — DAILY INPUT (Rescoring deltas)
1) Paste/upload CSV (same shape as Box; only today’s hitters).
2) Validate → normalize → Review.
3) Commit → server routine:
   • DS=0 for hitters; DS+1 for others (scope‑local).
   • Emit ordered (AB,BC,AC) + unordered pairs ({A,B},{A,C},{B,C}) across relevant classes.
   • Mark same‑day exclusion for hitters.
   • Log audit_logs.
4) Slate auto‑regen for affected scope(s) + toast: “Updated N entities; slates regenerated HH:MM ET”.

Workflow 3 — LEDGER (Authoritative results)
1) Upload CSV (jurisdiction, date_et, session, result_digits).
2) Validate → derive comboset_sorted & pairs → Review.
3) Commit with idempotency (jurisdiction|date|session|result).
4) Apply the same DS updates + exclusions as Daily Input.
5) Slate auto‑regen + Results tab highlights winners (✅) and exclusion note.

============================================================
D) SLATE REGENERATION — DETERMINISTIC PIPELINE
============================================================
D1) Class components (normalized & blended)
• BOX* = percentile DS for {A,B,C} using Box class horizon blend.
• PBURST* = best‑order mean over Front(AB), Back(BC), Split(AC) using their blended classes.
• CO* = mean over unordered pairs {A,B},{A,C},{B,C} using any‑pos pair class.

D2) Indicator & rails
• Indicator = 0.40·BOX* + 0.40·PBURST* + 0.20·CO* (+ multiplicity prior: Singles +0, Doubles −0.02, Triples −0.04).
• Rails before K6:
  – Same‑day exclusion (from ledger).
  – K6 quotas: Singles≤4, Doubles≤2 (Triples off).
  – Pair repetition cap: ≤2 share the same TopPair.
  – Mid↔Eve recency guard (scope‑local).

D3) Sort & snapshot
• Sorting: Indicator desc → tie‑break by longest‑horizon Box DS → lexicographic.
• Snapshot payload: {scope, horizons_present_json, weights_json, top_k_straights_json, top_k_boxes_json?, updated_at_et, hash}.
• Keep last N snapshots per scope; expose a read‑only v_latest_slate_snapshots for clients.

============================================================
E) IMPLEMENTATION CHECKLIST (ORDERED; YOUR TODO LIST)
============================================================
[ ] Switch client “data mode” to ONLINE; remove all mock fallbacks; wire Home/Results to live views.
[ ] Import Wizard: add Review step + Commit → show ImportSummary modal; add link to Import History.
[ ] Build Import History table + Detail Drawer; implement Soft Delete/Undo with server rollback + recompute hooks.
[ ] Implement post‑commit hooks: p99 caps → percentile_maps → horizon_blends; auto‑regen toggle.
[ ] Build Horizon Coverage Matrix (classes × H01Y..H10Y) with ✓/⌛/— states and quick‑import shortcut.
[ ] Slate regeneration: ensure components consume percentile_maps + horizon_blends; enforce rails; deterministic sorter; write snapshots with hash.
[ ] Diagnostics: snapshot hashes, last percentile refresh per class, coverage counters, last 10 errors.
[ ] Status Ribbon: live ET time, coverage chips, “percentile/p99”, backend=Online; reflect partial data per class.
[ ] Add integration tests for the three import workflows + slate materialization determinism.

============================================================
F) ACCEPTANCE CRITERIA (RELEASE GATE)
============================================================
• LIVE DATA ONLY: All surfaces read from Supabase views/RPC; no silent mock fallback.
• IMPORT CONFIRMATION: Every commit returns an ImportSummary and a visible modal with link to Import History.
• VIEW/DELETE IMPORTS: Admin can browse, filter, open details, Soft Delete/Undo imports, with audit logs and recomputation.
• FULL HORIZON COVERAGE: UI shows matrix for H01Y..H10Y per class; importing H0nY updates coverage, blends, and slates for affected scopes.
• SLATES DETERMINISTIC: Re‑running on the same inputs yields identical snapshot hashes per scope.
• RIBBON & DIAGNOSTICS: Accurate coverage chips, last ET, normalization “percentile”, winsor “p99”; determinism check visible.

============================================================
G) COMMON PITFALLS (GUARDRAILS)
============================================================
• Always winsorize BEFORE percentiles (avoid long‑tail dominance).
• Zero‑pad pair keys (“07”), sort box digits (“{0,1,4}”); reject/auto‑fix with admin confirmation.
• Scope isolation: Midday vs Evening DS updates must not leak; All‑Day is combined by design.
• Idempotency keys on ledger to prevent duplicates.
• Same‑day exclusion must be enforced to avoid echoing winners.

End of prompt — Execute in the given order. Keep everything admin‑gated, auditable, and deterministic. No code required in this document; you will implement server hooks/RPCs and UI according to these steps.
