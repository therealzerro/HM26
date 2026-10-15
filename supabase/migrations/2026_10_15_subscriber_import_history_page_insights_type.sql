-- ENH-FUNNEL-04 (2026-10-15): Sub Import gains a Page tab; its imports are recorded as 'page_insights'.
-- Applied to prod 2026-10-15 via MCP apply_migration (name: subscriber_import_history_page_insights_type).
alter table public.subscriber_import_history drop constraint if exists subscriber_import_history_import_type_check;
alter table public.subscriber_import_history add constraint subscriber_import_history_import_type_check
  check (import_type = any (array['subscriber_emails'::text, 'group_insights'::text, 'manual'::text, 'snapshot'::text, 'earnings'::text, 'page_insights'::text]));
