-- Rollback: restore the `state_confidence_overrides` row deleted 2026-05-19
-- Original row captured pre-deletion:
--   key        = 'state_confidence_overrides'
--   value      = '{}'::jsonb
--   created_at = '2026-04-16 10:22:48.353051+00'
--   updated_at = '2026-04-16 10:22:48.353051+00'
--
-- Context: row was empty `{}` and had zero code consumers per
-- docs/state_confidence_audit_2026-05-19.md (state confidence audit).
-- Deletion was audit-logged with action='config_row_deletion_executed'.
--
-- DO NOT execute unless a regression is observed that traces back to this row.
-- EngineConfigView and all engine paths were verified to ignore unknown keys
-- (lines 110-114 of components/admin/EngineConfigView.tsx make this explicit),
-- so rollback is unlikely to be needed.

INSERT INTO app_config (key, value, created_at, updated_at)
VALUES (
  'state_confidence_overrides',
  '{}'::jsonb,
  '2026-04-16 10:22:48.353051+00',
  '2026-04-16 10:22:48.353051+00'
)
ON CONFLICT (key) DO NOTHING;

-- Verify restore
SELECT key, value, created_at, updated_at
FROM app_config
WHERE key = 'state_confidence_overrides';
