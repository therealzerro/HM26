HITMASTER — ADMIN IMPORTS & HEALTH FIXES (NO CODE)
North Star

Tighten Admin controls so imports are trustworthy, counts are correct, errors are visible, and “Re-Generate Slate” is explicit (confirm or explain why not).

1) Add Hard Delete alongside Soft Delete
UX

In admin-imports list and import Detail Drawer, show buttons:

Soft Delete (current behavior)

Undo Soft Delete (when deleted_at ≠ null)

Hard Delete (danger style, Admin-only)

Require a 2-step confirm: “Type DELETE to permanently remove rows and associated aggregates.”

Behavior (conceptual)

Soft Delete: set deleted_at=now() on imports and all child rows for that import (datasets_box|pair, derived maps/blends if linked by import_id).

Hard Delete: physically remove:

datasets_box|datasets_pair rows where import_id=…

any percentile_maps/horizon_blends rows created exclusively by this import (guard with import_id)

the imports row itself

Audit log: write an audit_logs entry for both actions with {actor, import_id, scope, class_id, horizon, counts}.

Post-actions

Recompute coverage and blends for affected (class_id, scope); set horizon_blends to the latest valid state (or empty if no horizons left).

Trigger a slate materializer run if autosync is ON; else show a toast “Data changed—Re-Generate Slate recommended.”

Acceptance

Soft Delete hides the import’s rows from all counts; Undo restores them.

Hard Delete removes rows permanently; Import History no longer lists that import; audit log remains.

Reopening the app still shows the correct counts (no “phantom” rows).

2) Fix Health Panel counts (Box shows 220 after delete/restart)
Root cause to address

Counts are likely reading from base tables (or stale views) that do not filter out deleted_at or are not scoped to the active (class_id, scope, horizon_label) coverage.

Specification

Health cards must source from views that guarantee:

WHERE deleted_at IS NULL on all dataset tables.

Correct scope (midday/evening/allday).

Horizon coverage computed from distinct (class_id, scope, horizon_label) present, not row totals.

Cards required:

Coverage % = number of classes (1×Box + 10×Pair = 11) that have at least H01Y present in the current scope ÷ 11.

Box Entries = count of datasets_box rows deleted_at IS NULL for current scope.

Pair Entries = sum of datasets_pair rows deleted_at IS NULL across all 10 pair classes for current scope.

Errors = imports with status='failed' in the last N days or any dataset integrity warnings.

UX polish

Tap a metric → Filtered view:

Box Entries → opens admin-imports filtered to type=box_history & scope.

Pair Entries → filtered to pair_history.

Coverage → opens Coverage Matrix (classes × H01Y…H10Y) with ✓/⌛/— and a “Import horizon” quick action.

Errors → opens Errors Drawer (see §3).

Acceptance

After Soft Delete or Hard Delete, counts change immediately and persist after app reload and Supabase restart.

Coverage % is correct per scope and horizon; partial classes do not inflate the percentage.

3) Make Health cards clickable and surface errors inline
Errors to show

Import failures (imports.status='failed'), with stored error_text (REST body or validation summary).

Integrity warnings: missing required columns, invalid dates, out-of-range DrawsSince, duplicate (class_id, scope, horizon, key), or RLS denies.

UI on /admin (Health Panel)

Each card is tappable (see §2).

Add an Errors card with a red badge showing N current issues; tap → Errors Drawer.

Errors Drawer (spec)

List recent failures (limit 50): title, time, scope, class/horizon, and first line of error.

Tap a row → Import Detail:

Original filename/paste mode info, row count, sample of normalized rows (first 10).

Full error body (scrollable), “Copy to clipboard”.

Actions: Retry Commit (re-runs with same parsed rows), Soft Delete, Hard Delete.

Acceptance

From Health panel, Admin can reach exact failing import in ≤2 taps.

Copying error text works; Retry either succeeds (changes status to completed) or shows a clear reason.

4) Re-Generate Slate: Confirm or Explain Why Not
Pre-checks (run instantly on press)

Coverage gate: at least H01Y present for all 11 classes in selected scope; list any missing classes/horizons.

Delta detection: since last snapshot, did any of these change?

New or removed dataset rows (by updated_at/deleted_at)

New Daily or Ledger rows in the time window

Blend recalculation version changed

Lock & load: if a materializer job is already running, show “Materializer busy—try again in ~X s.”

UX

If pre-checks fail → show a Reason Sheet titled “Slate not regenerated” with explicit bullets:

“Missing H01Y for Pair Class 6 (allday)”

“No data changes since last snapshot (hash match)”

“Materializer busy”

“RLS denied”

If eligible → show a confirm modal:

Title: “Regenerate Slate for <scope>?”

Summary: “11/11 classes covered; 2 imports changed; last run 10:12 ET.”

Buttons: Cancel / Regenerate Now

Materializer result sheet

On success: “✅ Slate regenerated (Midday) • ET 10:22 • Hash …7F • K6=6 updated, 0 excluded, 2 winners filtered.”

Provide links: “View snapshot”, “Open Slate”.

On no-op: “ℹ️ No changes produced a new slate. Inputs unchanged. (Hash unchanged).”

On failure: show exact error text and log it to audit_logs.

Acceptance

Button always yields one of: Confirm → Success, No-op message, or Reason Sheet with explicit causes.

Deterministic hash visible and consistent with Health page.

Cross-cutting: Telemetry & Audit

Log events: SoftDelete, HardDelete, UndoSoftDelete, HealthCardTapped, ErrorsDrawerOpened, RetryImport, SlateRegenRequested, SlateRegenConfirmed, SlateRegenOutcome(success|noop|fail).

Every mutating action writes an audit_logs row with actor, scope, class/horizon, counts, and outcome.

Implementation ORDER (to avoid confusion)

Counts/views: make Health cards read from views that filter deleted_at IS NULL and compute coverage per scope/horizon.

Hard Delete: add UI + server pathway; ensure recompute and audit.

Clickable Health: wire taps to filtered lists; build Errors Drawer.

Regenerate flow: implement pre-checks → confirm/why-not outcomes → result sheet; expose snapshot hash in toasts & Health.

QA pass: delete → counts drop → regen explains missing coverage; redo imports → counts rise → regen succeeds.

Final Acceptance Checklist

Soft Delete/Undo works as today; Hard Delete permanently removes rows and updates counts; audit entries recorded.

Health panel numbers match the actual (non-deleted) dataset and persist across restarts.

Health cards are clickable; Errors Drawer shows precise reasons with copy/ retry.

Re-Generate Slate confirms on success or shows explicit “why not” reasons; deterministic hash visible.

End of prompt.
