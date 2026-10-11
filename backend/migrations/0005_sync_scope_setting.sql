-- PA Dashboard Backend v2
-- APP-PA-03-T002C Song District calculation scope authority.
-- Forward-only numbered SQL migration.
-- Collision policy: fail closed via the existing primary-key
-- constraint on app_settings.

INSERT INTO app_settings (
  key,
  value,
  updated_at
)
VALUES (
  'district_area_prefix',
  to_jsonb('5406'::TEXT),
  CURRENT_TIMESTAMP
);
