-- Sample data for local development.
-- This runs after schema.sql on the first init of the PostgreSQL volume.

BEGIN;

SET search_path TO ember, public;

INSERT INTO app_users (
  login,
  display_name,
  role,
  client_code,
  password_hash,
  metadata
)
VALUES
  (
    'simon@phigital.cl',
    'Simón Phigital',
    'administrator',
    NULL,
    crypt('123450#', gen_salt('bf')),
    '{"seed":true,"access":"all"}'::jsonb
  ),
  (
    'supervisor_claro',
    'Supervisor Claro',
    'supervisor',
    'CLARO',
    crypt('claro123$', gen_salt('bf')),
    '{"seed":true,"access":"claro"}'::jsonb
  ),
  (
    'supervisor_wom',
    'Supervisor WOM',
    'supervisor',
    'WOM',
    crypt('wom123$', gen_salt('bf')),
    '{"seed":true,"access":"wom"}'::jsonb
  )
ON CONFLICT DO NOTHING;

-- No seeded agent accounts or derived live data.
-- Accounts must be created from the application UI and stored in ember.accounts.

COMMIT;
