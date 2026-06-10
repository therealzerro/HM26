# SEC-05 — Write-Path Hardening Design (2026-06-10)

**Problem.** Supabase advisors (2026-06-10) show the `anon` role — whose key
ships in the app bundle — can UPDATE `slate_snapshots`, `daily_intelligence`,
and `app_config` via always-true policies, and ALL-role `allow_all` policies
cover `histories`, `datasets_box`, `datasets_pair`, `audit_logs`,
`horizon_blends`, `percentile_maps`, `imports`, `histories_tx`,
`slate_snapshots_zk30`. Anyone with the bundled key can rewrite picks, hit
flags, draw history, or engine weights. CONFIG-01 happened with *trusted*
access; this is the same blast radius, public.

**Write inventory (grep `method: POST|PATCH|DELETE`, 2026-06-10).**
Every non-GET call in the codebase is operator-only code, with two
subscriber exceptions:

| Writer | Tables | Class |
|---|---|---|
| `hooks/useDataIngestion.tsx` (37 calls) | histories, datasets_box, datasets_pair, imports, daily_intelligence, adaptive_tracking | operator |
| `components/admin/*` (CoverageMatrix 8, ImportWizard 4, HitTracking 4, Dashboard 4, EngineConfig 3) | histories, datasets_*, daily_intelligence, app_config | operator |
| `lib/rebuildTrigger.ts`, `lib/hitDetection.ts`, `lib/applyWeightUpdate.ts`, `lib/backfillIntelHits.ts`, `lib/subscriberAdminClient.ts` | edge fn POSTs + daily_intelligence, app_config | operator |
| `app/(tabs)/intelligence.tsx`, `admin-imports.tsx` | daily_intelligence, imports | operator |
| `engines/zk6.ts` RN path (8 calls) | slate_snapshots, daily_intelligence, adaptive_tracking | operator (prod uses edge fn via `EXPO_PUBLIC_USE_EDGE_ZK6`) |
| `hooks/usePushNotifications.tsx` | push_tokens | **subscriber — keep, narrow** |
| `app/(tabs)/book.tsx`, `explore.tsx` | saved_slates | **subscriber — keep, narrow** |
| zk30 surfaces | histories_tx, slate_snapshots_zk30 | out of scope (ZK6-only mandate 2026-06-10) |

**Target posture.**
- `anon`: SELECT on consumer-read tables; INSERT/UPDATE only on
  `push_tokens` and `saved_slates` with column-scoped WITH CHECK; zero other
  writes.
- All operator writes go through a new `admin-ops` Edge Function gateway
  authenticated by `ADMIN_OPS_KEY` (same pattern as the ENH-FUNNEL gateway),
  using service-role internally against a server-side **table/op allowlist**.
- Operator enters the ops key once in the Account admin section (AsyncStorage,
  like the existing role flag). No Supabase Auth dependency.

**Sequence (each step reversible, verified before the next):**
1. Build `supabase/functions/admin-ops/` + `lib/adminOps.ts` client wrapper
   mirroring `fetchFromSupabase`'s shape so call-site diffs are mechanical.
   Deploy with verify_jwt default ON (CLI, not MCP — bundle >30KB rule).
2. Migrate writers file-by-file: `useDataIngestion` → admin components →
   operator libs → operator screens. Smoke each (import dry-run, config
   read-back) before the next.
3. Drop anon/ALL write policies **table-by-table as their last writer
   migrates** — `app_config` first (highest blast radius), `histories` +
   `datasets_*` next, `daily_intelligence`/`slate_snapshots`/`adaptive_tracking`
   last (most call sites).
4. Close: re-run advisors (expect zero always-true write findings outside the
   two narrowed subscriber tables), `npm run rls:smoke`, MASTER_AUDIT close.

**Estimate.** Gateway + client ~3–4h; writer migration ~6–8h across two
sessions; policy drops + verification ~2h. Keep clear of the 6/13
ratification window for any step that touches `app_config` policies.

**Done already (2026-06-10):**
- QW1: `withAdminGate` route guard on `admin` / `intelligence` /
  `admin-imports` / `coverage` (`components/RequireAdmin.tsx`). Client-side
  bar-raiser, not the wall.
- QW2 (`sec05_qw2_db_hygiene` migration): duplicate index dropped, 2 FK
  indexes added, 2 exact-duplicate anon UPDATE policies dropped,
  `calculate_hit_rates()` EXECUTE revoked from PUBLIC/anon/authenticated
  (client usage was already removed by the B1 fix).

**Open items / follow-ups:**
- `import-wizard.tsx`, `ledger-import.tsx`, `admin-image-export.tsx`,
  `replay.tsx` are also operator routes without guards — same `withAdminGate`
  treatment pending approval.
- `pg_net` extension lives in `public` schema (advisor WARN) — move during a
  quiet window; pg_cron jobs reference it.
- Latent pre-existing TS errors in `intelligence.tsx` (585/920): press event
  object passed into `force?: boolean` param — `force` is always truthy from
  button presses. Behavior review needed before fixing.
- Role itself is client-side (AsyncStorage triple-tap) — acceptable while the
  gateway holds the real secret; revisit if/when real auth ships (Phase 4).
