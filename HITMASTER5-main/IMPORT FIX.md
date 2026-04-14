Make Admin imports fast, deterministic, and diagnosable. With schema & RLS healthy, eliminate remaining UX pitfalls, surface exact errors, and guarantee that horizons H01Y…H10Y are selectable and reported correctly. Target: a 110-row Box import completes in ≤2–3s and immediately unblocks slate regeneration when coverage is met.

0) Preflight (one time per environment)

API cache refresh after any DDL/RLS change:
notify pgrst, 'reload schema';

Confirm anon client works: GET /rest/v1/datasets_box?select=count&limit=1 returns 200, and Admin can insert (policy OK).

1) Paste Mode: strict validation + clear messaging

Accept CSV and whitespace-table pastes; normalize headers/cells (strip NBSP, remove thousands separators, zero-pad pairs, convert Combo→ComboSet={a,b,c} if Daily/Box).

Required columns per type (block commit with precise list if missing):

Box/History: ComboSet (or Combo → convert), TimesDrawn, LastSeen, DrawsSince.

Pairs/History: Pair, TimesDrawn, LastSeen, DrawsSince.

Daily: same as Box (only today’s hitters).

Ledger: Jurisdiction, Game, DateET, Session, Result.

On REST failure: display the exact JSON body from PostgREST (not a generic string) and write it to imports.error_text. Provide a Retry button (replay the same payload).

Acceptance: pasting 110 Box rows with commas (no “3,545”) previews cleanly; Commit either succeeds or shows a specific line/column error.

2) Batch discipline (even if small)

Use one batch for ≤1,000 rows (your current Box=110 → single batch). Keep batching infra ready (500–1,000 rows) for future growth.

For each commit:

Create imports row (status processing).

Insert dataset rows with import_id set. Use “merge duplicates” semantics to avoid unique conflicts.

Upsert percentile & blends for the affected (class_id, scope).

Mark imports.status='completed' (or failed with error_text).

Log per batch: rows, payload_kb, time_ms, status. Show a progress line in the UI even for single-batch imports (helps diagnose).

Target: 110 rows end-to-end ≤ 2–3 s.

3) Horizons H01Y…H10Y — always visible, coverage chips live

The horizon picker is static: render H01Y..H10Y regardless of current data.

Next to each option, show a coverage chip from a small coverage view: ✓ if any rows exist for (class_id, scope, horizon_label), ⌛ if none.

After any import, refresh coverage chips immediately.

Acceptance: Admin sees all 10 horizons; clicking H06Y is allowed even if data is missing (it will then be created by the import). Coverage chips flip to ✓ after commit.

4) Health Panel = truth, not guesses

Counts come from views that filter deleted_at IS NULL and are scoped:

Box Entries = count of datasets_box by current scope.

Pair Entries = sum over datasets_pair by current scope.

Coverage % = classes (1 Box + 10 Pair) that have at least H01Y ÷ 11.

Errors = recent imports.status='failed' or integrity warnings.

Tapping a card drills to the relevant filtered list; tapping Errors opens the Errors Drawer.

Acceptance: Soft/Hard delete immediately changes counts; app restart or Supabase restart does not resurrect deleted counts.

5) Admin-Imports: Soft vs Hard delete (by import_id)

Soft Delete: set deleted_at=now() on the imports row and all child datasets_* rows with that import_id.

Undo clears deleted_at.

Hard Delete: physically delete child rows, recompute coverage/blends, then delete the imports row.

Log each action to audit_logs.

Acceptance: Deleting an import drops Health counts; Undo restores; Hard Delete removes permanently (audit remains).

6) Regenerate Slate: confirm OR explain “why not”

On press, run prechecks for the current scope:

Coverage gate: H01Y present for all 11 classes → if missing, present a Reason Sheet listing exact gaps (e.g., “Pair Class 6 missing H01Y”).

Input delta: data changed since last snapshot? If no → No-Op sheet (“inputs unchanged”).

Materializer status: if busy → show “Materializer running—try again soon.”

If eligible → confirm modal → run → show Result Sheet with snapshot hash and a summary (“K6 updated, winners filtered”).

Acceptance: Button never “does nothing.” It either regenerates (with a hash) or explains exactly why it didn’t.

7) Performance guardrails

For single-batch imports (≤1k rows), target ≤3 s.

If you see ≥5 s: capture payload_kb and server time; investigate client-side parsing (keep it off the UI thread) and ensure API cache was reloaded after schema changes.

If you later import 5–10k rows, chunk to 1k and prefer the RPC bulk upsert path.

8) Diagnostics the Admin can run

Test Backend screen:

Ping /rest/v1/ (200).

Fetch /rest/v1/datasets_box?select=count (works).

Schema cache timestamp (last reload) if available.

RLS probe: try an insert with a dry-run flag and show the exact policy verdict if denied.

9) End-to-end test script (do this now)

Admin login → Import → Box / All-Day / H01Y → paste 110 clean rows → Commit.

Expect: success in ≤3 s; imports.status='completed'; Health Box count increases; H01Y chip ✓.

Import → Front Pair Straight / All-Day / H01Y → paste ~50 rows → Commit.

Expect: Pair Entries increases; Coverage % increases.

Soft Delete the last import → Health drops; Undo → Health restores.

Re-Generate Slate (All-Day):

If coverage < 11/11 → Reason Sheet lists exactly what’s missing.

Else → Confirm → Success; snapshot hash displayed.

10) If anything still fails

Capture: dataset type, scope, horizon, rows, timing, HTTP status + JSON body, and whether the failure occurred before or after imports was created.

Immediately run: notify pgrst, 'reload schema'; and retry once.

Post the JSON body in Errors Drawer so we can act on the real cause (constraint, RLS mismatch, bad payload).

Definition of Done

110-row Box import finishes in ≤3 s and is reflected in Health and coverage chips without app/API restarts.

All horizons H01Y…H10Y are visible and clickable; chips reflect presence.

Soft/Hard delete behavior correct and persistent.

Re-Generate Slate always yields Confirm→Success with hash, No-Op, or Reason Sheet—never silence.

Errors show raw PostgREST messages and are retryable from Admin.
