Repair Paste Imports for Pairs, Daily Input, and Ledger
North Star

All Admin imports are pasted text (not files). The Import Wizard must:

Parse messy paste reliably (CSV or whitespace table).

Normalize to our canonical keys.

Validate required columns with line-level errors.

Upsert to the right table with import_id, scope, horizon_label, and keys that respect our constraints.

Show precise server errors (not generic).

Update Health/Coverage and enable slate regeneration when coverage gates are met.

Status: Box history is OK. Bring Pairs history, Daily Input, and Ledger up to the same standard.

0) Shared Paste Parser & Normalizer (reuse Box)

Apply the same tolerant parser used by Box imports to all three:

Accept CSV or whitespace-separated tables.

Strip NBSP (\u00A0), trim cells, collapse multiple spaces.

Remove thousands separators in numerics (1,348 → 1348, 3,545 → 3545).

Dates: accept MMM D, YYYY (e.g., Sep 20, 2025) and YYYY-MM-DD; store as date.

DrawsSince: integer ≥ 0; TimesDrawn: integer ≥ 0; fail with row+col if not.

On REST failure: display the exact PostgREST JSON body and write it to imports.error_text (no generic “Import Failed”).

1) Pairs history (all 10 classes)
1.1 Required columns (after normalization)
Pair, TimesDrawn, LastSeen, DrawsSince


Pair must be 2-digit, zero-padded: "00"…"99".

TimesDrawn int, LastSeen date, DrawsSince int.

1.2 Class selection & key mapping

The wizard already knows which pair class the Admin picked (one of the 10 classes shown in the “Pair Classes” image).

Map that UI selection to our internal class_id ∈ {2..11}.

Write to public.datasets_pair with fields:

import_id (uuid), class_id, scope ('midday'|'evening'|'allday'),
horizon_label ('H01Y'..'H10Y'),
key_pair (text, e.g., "00"),
ds_raw (DrawsSince), times_drawn, last_seen (date),
ds_normalized (percentile), deleted_at null


Do not write pairs into datasets_box (current bug pattern).

1.3 Validation traps to catch (show user)

Pair missing zero-pad → auto-fix and show badge ("7" → "07").

Non-numeric TimesDrawn / DrawsSince after comma removal → block with row number.

Date parse failure → block with row number.

1.4 Upsert semantics & batching

110 rows → single batch is fine; keep chunk infra (500–1000) for future.

Use merge-duplicates semantics so the same (class_id, scope, horizon_label, key_pair) doesn’t hard-fail; latest wins.

Upsert/update percentile_maps and horizon_blends for the affected (class_id, scope).

1.5 Acceptance test (use your sample)

Paste:

Pair,TimesDrawn,LastSeen,DrawsSince
00,678,Sep 20, 2025,19
01,1348,Sep 20, 2025,18
02,1443,Sep 20, 2025,59


Commit (e.g., Front Pair Straight / All-Day / H01Y) → rows appear in datasets_pair with class_id for that selection; Health “Pair Entries” and Coverage chips update.

2) Daily Input (today’s hitters; rescoring deltas)
2.1 Shape & meaning

Daily Input is Box-shaped data for only the combos that hit today. It resets DS=0 for their box set and increments others tomorrow; it also emits pair events used by pair pressure.

2.2 Required columns (after normalization)

Two equivalent input styles are accepted—normalize to ComboSet:

Preferred:

ComboSet, TimesDrawn, Expected, LastSeen, DrawsSince
{0,0,6},1,0.22,Sep 20, 2025,61


Or:

Combo, TimesDrawn, Expected, LastSeen, DrawsSince
006,1,0.22,Sep 20, 2025,61


Convert Combo → ComboSet={a,b,c} (sorted ascending).

2.3 Write path

Store to the daily inputs target (whatever table/schema your build uses for daily deltas; if datasets_box is repurposed, tag rows with a distinct source='daily' or use a dedicated daily_inputs table that the scorer reads).

Immediately update today’s draw clock context for the chosen scope and emit pair events from the box combos:

From {A,B,C}, derive ordered pairs for AB/BC/AC and unordered pairs for Any-Position.

Flag any combos that appear in Daily Input as same-day exclusions for fresh slates.

2.4 Acceptance test (use your sample)

Paste:

Combo,TimesDrawn,Expected,LastSeen,DrawsSince
006,1,0.22,Sep 20, 2025,61
008,1,0.22,Sep 20, 2025,19


Preview shows ComboSet auto-converted to {0,0,6} / {0,0,8} (badge “Combo→ComboSet”).

Commit → deltas recorded; Health shows “Daily Inputs today: 2”; the next regeneration excludes these combos from the new slate and updates pair pressures.

3) Ledger (authoritative results by jurisdiction & session)
3.1 Required columns (after normalization)

Normalize the prose into this header:

Jurisdiction,Game,DateET,Session,Result


Jurisdiction (e.g., Arkansas, Arizona, California)

Game (e.g., Cash 3, Pick 3, Daily 3)

DateET (YYYY-MM-DD preferred; accept Sep 20, 2025 and convert)

Session (Midday | Evening | All-Day) — map from prose lines (Midday, Evening, or no session → All-Day)

Result (A-B-C, e.g., 2-8-4)

3.2 Dedupe key (must enforce)

Composite unique identity:

jurisdiction | game | date_et | session | result


Upsert with this composite; duplicates for the same draw should update timestamps, not error.

3.3 Post-ingest derivations (done immediately)

For each ledger row:

Store to public.ledger with comboset_sorted={a,b,c}, and the raw result_digits='ABC'.

Emit pair events:

Ordered: AB, BC, AC per the 3 straight pair classes.

Unordered pairs for Any-Position (all 3 pairs).

“From Box Combination” variants by sorting the digits first, then deriving front/back/split (per the Pair Classes doc).

Update “recent winners” cache so same-day exclusions apply to the next slate.

Advance the scope draw clock: Midday and Evening separately; All-Day aggregates both.

3.4 Acceptance test (use your sample)

Paste (convert your lines to this table):

Jurisdiction,Game,DateET,Session,Result
Arizona,Pick 3,2025-09-20,All-Day,2-8-4
Arkansas,Cash 3,2025-09-20,Midday,3-2-2
Arkansas,Cash 3,2025-09-20,Evening,4-3-0
California,Daily 3,2025-09-20,Midday,3-0-2
California,Daily 3,2025-09-20,Evening,3-0-2


Commit → rows appear in ledger; derived pair events recorded; Health “Recent Winners” increments; Regenerate slate excludes winners and recalculates pair pressures.

4) Horizon/Scope handling (don’t block Admin)

Horizon picker is static: H01Y…H10Y always listed.

For Pairs history, write the selected horizon_label exactly; Daily and Ledger do not require horizon_label (they’re “today” streams).

Scope must be one of midday | evening | allday. From Ledger paste, infer session into scope.

5) Upsert + Retry + Telemetry

Use a single batch for ~110 rows; still include per-batch progress & timings.

On REST error: show the body, store it in imports.error_text, provide Retry that replays the same normalized rows.

Emit analytics: ImportStarted / BatchSucceeded / BatchFailed / ImportCompleted / ImportFailed (with rows/time).

6) Health & Coverage updates (truth not guesses)

Health counts read from views that filter deleted_at IS NULL.

Coverage % looks only at H01Y presence per class for the active scope.

After any commit, refresh coverage chips and counts without app restart.

7) Regenerate Slate gating (no ambiguity)

After Pairs history or Ledger/Daily commits, pressing Re-Generate Slate must either:

Confirm & succeed with a snapshot hash, or

Explain “why not” (missing H01Y for class X, materializer busy, or no input changes).

8) QA — run these 6 tests in order

Pairs history (Front Pair Straight / All-Day / H01Y):

Pair,TimesDrawn,LastSeen,DrawsSince
00,678,Sep 20, 2025,19
01,1348,Sep 20, 2025,18
02,1443,Sep 20, 2025,59


→ rows in datasets_pair with correct class_id, key_pair, import_id.

Daily Input (All-Day):

Combo,TimesDrawn,Expected,LastSeen,DrawsSince
006,1,0.22,Sep 20, 2025,61
008,1,0.22,Sep 20, 2025,19


→ auto-converted to ComboSet; deltas recorded; exclusions flagged.

Ledger (as table above) → rows + derived pair events; “Recent Winners” visible.

Health Panel shows correct counts and coverage; tapping Errors shows none.

Soft Delete the last Pairs import → counts drop; Undo → restore.

Re-Generate Slate → either success (hash shown) or a clear reason sheet listing missing coverage.

9) If anything still fails

Capture and display to the Admin (and log in imports.error_text):

dataset type (Pairs/Daily/Ledger), scope, horizon (if applicable), number of rows

HTTP status, exact JSON body, and time
Then run:

notify pgrst, 'reload schema';


Retry once. If it still fails, the exact body tells us whether it’s constraint (keys/horizon/scope), RLS, or payload (bad types). Fix accordingly.
