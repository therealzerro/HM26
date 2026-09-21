-- ARCH-09 + CONFIG-19 (STAT-01 side-filings, build approved by the content
-- agent's Phase 6 message 2026-09-21). Applied via MCP 2026-09-21.
--
-- ARCH-09: provenance. Every histories row to date is a manual Lottery Post
-- paste (operator-confirmed 9/20), so the default IS the truth for existing
-- rows — no retroactive relabel. official_<state> values are reserved for
-- feeds (MKT-81 backend item). import_id already existed (never written);
-- both ledger writers now set it.
alter table public.histories
  add column if not exists source text not null default 'lotterypost_manual';
alter table public.histories
  drop constraint if exists histories_source_check;
alter table public.histories
  add constraint histories_source_check
  check (source = 'lotterypost_manual' or source ~ '^official_[a-z0-9_]+$');

-- CONFIG-19: weekly spot-check columns (nullable; written by
-- scripts/spot-check-draws.ts, operator-run after the Sunday import).
alter table public.histories add column if not exists verified_at timestamptz;
alter table public.histories add column if not exists discrepancy text;
comment on column public.histories.source is 'ARCH-09 provenance: lotterypost_manual (default, the truth for every paste) or official_<state> (reserved for feeds).';
comment on column public.histories.verified_at is 'CONFIG-19: set when the operator confirmed this row against the state site.';
comment on column public.histories.discrepancy is 'CONFIG-19: operator note when the row disagreed with the state site; the correction is logged in MASTER_AUDIT.';
