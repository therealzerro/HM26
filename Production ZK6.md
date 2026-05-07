You are implementing the ZK6 engine in HitMaster now that Supabase envs are set. Build an admin-gated ingestion pipeline, normalized class/horizon scoring, deterministic slate generation, and role-aware UI wiring. No secrets in client; all writes happen via RLS-protected endpoints.

Golden rules (data roles)
• Box & Pair datasets = History imports (training baselines), one file per year horizon per class (H01Y…H10Y) and per scope (Midday/Evening/All-Day).
• Daily Input datasets = Rescoring deltas (only combos that hit today; same columns as Box).
• Ledger = Authoritative results by jurisdiction + session; drives DS resets, pair emission, and same-day exclusions.
• ZK6 MUST run with H01Y present for all 11 classes (1×Box + 10×Pair). It auto-improves as H02Y…H10Y arrive.

Supabase wiring (surfaces & safety)
• Client reads: slate_snapshots (read-only view), glossary/static metadata, and (optionally) a read-only results feed.
• Admin-only writes (via RPC/Edge Functions with RLS): imports, datasets_box, datasets_pair, percentile_maps, horizon_blends, ledger, slate_snapshots.
• Use EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY for client reads only. Service keys stay server-side. No secrets in the app bundle.

Data contracts (freeze shapes)
• BoxHistoryRow: { Combo|ComboSet, TimesDrawn, Expected?, LastSeen(YYYY-MM-DD), DrawsSince:int≥0 }
• PairHistoryRow (for each of the 10 Pair classes): { Pair:"00"…"99", TimesDrawn, LastSeen, DrawsSince, class_id:2..11 }
• DailyInputRow: same shape as Box; rows only for combos that hit today.
• LedgerRow: { jurisdiction, game, date_et, session:("midday"|"evening"), result_digits:"ABC", comboset_sorted:"{a,b,c}" }
• SlateSnapshot: { id, scope, horizons_present:{class→[H0nY]}, weights, top_k_straights, top_k_boxes?, updated_at_et, hash }

Ten Pair classes (semantics you must uphold)

Front (AB), 2) Back (BC), 3) Split (AC), 4–6) Boxed variants of {A,B}/{B,C}/{A,C}, 7–9) Front/Back/Split derived after box-sort, 10) Any-Position Box (unordered pairs within draw). Keep keys zero-padded and unordered pairs sorted.

Ingestion — History (Admin only)
Input files: one per class×horizon×scope.
Validation: DrawsSince ≥ 0; LastSeen parseable; strip numeric commas; zero-pad pair keys; sort box digits.
Pipeline:

Write an imports record in “validating”.

Upsert rows into datasets_box / datasets_pair for (class_id, scope, horizon_label, key).

Compute p99 cap, winsorize ds_raw, compute percentile map DS→[0,1]; upsert to percentile_maps.

Update horizon_blends coverage for the class; mark imports “committed”; log to audit_logs.
UI: History lane shows accepted/rejected/fixed, p99 value, first/last dates, normalized key examples.

Ingestion — Daily Input (Admin only; rescoring deltas)
For each Combo ABC in today’s CSV:
• Set DS=0 for {A,B,C} (Box class) across active horizons in scope; DS+1 for all other sets.
• Emit pair events (AB, BC, AC + unordered {A,B},{A,C},{B,C}) across all relevant Pair classes; reset those DS to 0; others +1.
• Incremental refresh of percentile maps (or mark for nightly recompute).

Ingestion — Ledger (Admin only; authoritative)
• Upsert by (jurisdiction|date_et|session|result_digits); ignore duplicates.
• Derive comboset_sorted + ordered/unordered pairs.
• Apply the same DS updates as Daily Input (scope-local).
• Mark same-day exclusion for the straight combo and its box set.
• Log counts/duration/warnings in audit_logs.

Normalization & winsorization (per class×scope×horizon)
• Compute p99 cap on ds_raw, clip, then compute percentile rank [0,1] (mid-rank for ties).
• Store p99 + percentile map in percentile_maps.
• Recompute: on import commit; nightly refresh acceptable.

Horizon blending (short-heavier)
• For each class, gather available H0nY and blend normalized values with short-heavier geometric weights (sum=1).
• If only H01Y exists, use it directly.
• Cache weights + coverage in horizon_blends; recompute only when a new horizon arrives.

ZK6 components (all normalized after blending)
For each straight ABC:
• BOX* = percentile DS for {A,B,C} using the Box-class blend.
• PBURST* = best-order mean of Front*(AB) + Back*(BC) + Split*(AC) across their Pair classes.
• CO* = mean of any-position unordered pair pressures for {A,B}, {A,C}, {B,C}.
(Optionally) Multiplicity prior: Singles +0.00, Doubles −0.02, Triples −0.04.

Indicator, temperature, rails
• Indicator(ABC) = w_BOX*BOX* + w_PB*PBURST* + w_CO*CO* + prior.

Default weights: 0.40 / 0.40 / 0.20 (conservative alt: 0.85 / 0.10 / 0.05).
• Rails/constraints before final K list:

Same-day exclusion (from Ledger).

K6 quotas: Singles ≤ 4, Doubles ≤ 2 (Triples off/gated).

Pair repetition cap: ≤ 2 items sharing the same TopPair across K6.

Mid↔Eve recency guard (scope-local).
• Temperature (0–100) = map Indicator via distribution cut-points (e.g., p10→0, p90→100), clipped to [0,100].

Slate assembly & snapshotting
Process per scope:

Score all eligible combos; apply rails; sort deterministically (Indicator desc → longest-horizon Box DS → lexicographic).

Produce K6 + backfill; compute Temperature for each.

Persist slate_snapshot with ET timestamp, horizons_present, weights, top_k_straights, optional top_k_boxes, and a content hash (determinism).

Keep a rolling window of N snapshots; expose a read-only view. Identical inputs must yield the same hash.

UI wiring (role-aware)
• Home: Temperature badge + micro-bars (BOX/PBURST/CO), BestOrder chip, TopPair chip; long-press → raw H01Y values and blended coverage. Winners get ✅ and are excluded today.
• Explore: search any combo/set; show component breakdowns and horizon coverage (H01Y ✓, H0nY ✓/⌛).
• Results: group by jurisdiction + session; tapping a row reveals emitted pairs and which slate items moved.
• Admin (Import & Health): preview→commit flows, p99/percentile summaries, normalized key previews, and health metrics (last percentile refresh, winsorized counts, missing horizons, recent errors).
• Status ribbon everywhere: “Box H01Y ✓ • Pair 1–10 H01Y ✓ (H02Y…⌛) • Last re-gen ET • Norm: percentile • Winsor: p99 • Backend: Online”.

Observability & governance
• audit_logs for every import, ledger ingest, percentile refresh, blend recompute, slate generation (actor, scope, counts, duration, warnings).
• Determinism check (Admin): re-run last inputs on server and return a hash to compare with the latest snapshot.
• Plan entitlements: Free/Premium read-only; Admin has import & regen controls (enforced via RLS).

Acceptance criteria (must pass)
• With H01Y present for all 11 classes, deterministic K-slates are produced for Midday, Evening, and All-Day.
• Importing any H0nY for a class updates only that class’s blend and republishes slates; others unchanged.
• Ledger ingestion resets hitters to 0, increments others, emits pair events, enforces same-day exclusion, and regenerates slates deterministically.
• Snapshots persist ET timestamps, horizons_present, weights, Top-K payloads, and a stable hash; same inputs → same hash.
• Role gating enforced; Health panel reflects last percentile refresh, winsorized counts, and coverage.

Risk controls (do not skip)
• Winsorize before percentiles to avoid long-tail dominance.
• Zero-pad pair keys; sort box digits; ensure scope isolation (Midday vs Evening).
• No direct client table writes; mutations via Edge Functions/RPC with Admin session + RLS.
• Missing class/horizon contributes 0 and triggers a “partial data” ribbon banner.

Build order (checklist)
[ ] Wire client read-only access to slate_snapshots + authenticated Admin session for RPC.
[ ] Implement History ingestion: validate → upsert → p99 + percentile maps → horizon_blends update → audit.
[ ] Implement Daily Input & Ledger ingestion: DS updates, pair emission, same-day exclusions → audit.
[ ] Implement normalization service (percentile_maps) and blend cache (horizon_blends).
[ ] Implement ZK6 components, Indicator, rails, deterministic K6 assembler.
[ ] Implement snapshot publisher + public view; wire Home to Temperature/micro-bars and ribbon to metadata.
[ ] Implement Health metrics + determinism check endpoint.
[ ] Prove determinism across three scopes with H01Y-only; import one H02Y sample to confirm auto-improve behavior.

END OF PROMPT — Implement ZK6 exactly as above; keep everything deterministic, admin-gated, and explainable.
