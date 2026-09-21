-- ENG-BOARD-FREEZE-01 (STAT-01 §5 E-2, operator-approved 2026-09-21).
-- A regen written after the cutoff (10:00 ET midday/allday, 18:00 ET evening)
-- while a pre-cutoff board is live is stored with post_cutoff=true AND
-- deleted_at set at birth — it exists for audit, never for grading or display.
alter table public.slate_snapshots
  add column if not exists post_cutoff boolean not null default false;
comment on column public.slate_snapshots.post_cutoff is 'ENG-BOARD-FREEZE-01: regen written after the G4 cutoff while a pre-cutoff board was live; born with deleted_at set, never graded or shown.';
create index if not exists slate_snapshots_post_cutoff_idx on public.slate_snapshots (slate_date, scope) where post_cutoff;
