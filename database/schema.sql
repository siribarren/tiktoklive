-- Ember PostgreSQL schema
-- Baseline schema for accounts, sessions, messages, leads and metrics.
-- Target: PostgreSQL 14+.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ember;
SET search_path TO ember, public;

DO $$
BEGIN
  CREATE TYPE account_status_enum AS ENUM ('active', 'inactive', 'paused', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE account_priority_enum AS ENUM ('high', 'medium', 'low');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE session_status_enum AS ENUM ('connecting', 'live', 'ended', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE lead_status_enum AS ENUM ('new', 'reviewed', 'qualified', 'contacted', 'converted', 'lost');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE message_direction_enum AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE message_status_enum AS ENUM ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE source_type_enum AS ENUM ('tiktok', 'manual', 'import', 'api', 'webhook', 'csv', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE metric_grain_enum AS ENUM ('hour', 'day');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE user_role_enum AS ENUM ('administrator', 'client', 'executive', 'supervisor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_session_duration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)))::integer
    );
  ELSIF NEW.duration_seconds IS NULL THEN
    NEW.duration_seconds := 0;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT clients_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  source_type source_type_enum NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sources_code_not_blank CHECK (length(btrim(code)) > 0),
  CONSTRAINT sources_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL,
  display_name text NOT NULL,
  role user_role_enum NOT NULL,
  client_code text REFERENCES clients(code) ON DELETE SET NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_login_not_blank CHECK (length(btrim(login)) > 0),
  CONSTRAINT app_users_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auth_sessions_token_not_blank CHECK (length(btrim(token)) > 0)
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  platform text NOT NULL DEFAULT 'tiktok',
  external_id text NOT NULL,
  username text NOT NULL,
  display_name text,
  priority account_priority_enum NOT NULL DEFAULT 'medium',
  status account_status_enum NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'UTC',
  last_live_at timestamptz,
  last_activity_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_platform_not_blank CHECK (length(btrim(platform)) > 0),
  CONSTRAINT accounts_external_id_not_blank CHECK (length(btrim(external_id)) > 0),
  CONSTRAINT accounts_username_not_blank CHECK (length(btrim(username)) > 0)
);

CREATE TABLE IF NOT EXISTS account_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  status session_status_enum NOT NULL DEFAULT 'connecting',
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  messages_count integer NOT NULL DEFAULT 0,
  leads_detected integer NOT NULL DEFAULT 0,
  viewers integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_sessions_session_key_not_blank CHECK (length(btrim(session_key)) > 0),
  CONSTRAINT account_sessions_duration_non_negative CHECK (duration_seconds >= 0),
  CONSTRAINT account_sessions_messages_non_negative CHECK (messages_count >= 0),
  CONSTRAINT account_sessions_leads_non_negative CHECK (leads_detected >= 0),
  CONSTRAINT account_sessions_viewers_non_negative CHECK (viewers >= 0),
  CONSTRAINT account_sessions_ended_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  external_ref text,
  username text NOT NULL,
  nickname text,
  full_name text,
  status lead_status_enum NOT NULL DEFAULT 'new',
  total_score integer NOT NULL DEFAULT 0,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz,
  last_message_at timestamptz,
  last_message_text text,
  assigned_to_name text,
  semantic_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_username_not_blank CHECK (length(btrim(username)) > 0),
  CONSTRAINT leads_total_score_non_negative CHECK (total_score >= 0)
);

CREATE TABLE IF NOT EXISTS lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status lead_status_enum NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_id uuid REFERENCES account_sessions(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  external_message_id text,
  direction message_direction_enum NOT NULL,
  status message_status_enum NOT NULL DEFAULT 'received',
  username text NOT NULL,
  nickname text,
  content text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_username_not_blank CHECK (length(btrim(username)) > 0),
  CONSTRAINT messages_content_not_blank CHECK (length(btrim(content)) > 0),
  CONSTRAINT messages_score_non_negative CHECK (score >= 0)
);

CREATE TABLE IF NOT EXISTS message_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status message_status_enum NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS account_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  grain metric_grain_enum NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  connection_seconds integer NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  messages_count integer NOT NULL DEFAULT 0,
  messages_inbound integer NOT NULL DEFAULT 0,
  messages_outbound integer NOT NULL DEFAULT 0,
  lead_like_count integer NOT NULL DEFAULT 0,
  sales_total integer NOT NULL DEFAULT 0,
  views_total integer NOT NULL DEFAULT 0,
  unique_viewers integer NOT NULL DEFAULT 0,
  active_viewers integer NOT NULL DEFAULT 0,
  peak_viewers integer NOT NULL DEFAULT 0,
  avg_response_seconds numeric(12, 2),
  conversion_rate numeric(8, 2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_metrics_period_order CHECK (period_end > period_start),
  CONSTRAINT account_metrics_connection_non_negative CHECK (connection_seconds >= 0),
  CONSTRAINT account_metrics_session_non_negative CHECK (session_count >= 0),
  CONSTRAINT account_metrics_messages_non_negative CHECK (messages_count >= 0),
  CONSTRAINT account_metrics_views_non_negative CHECK (views_total >= 0),
  CONSTRAINT account_metrics_unique_viewers_non_negative CHECK (unique_viewers >= 0),
  CONSTRAINT account_metrics_active_viewers_non_negative CHECK (active_viewers >= 0),
  CONSTRAINT account_metrics_peak_viewers_non_negative CHECK (peak_viewers >= 0),
  CONSTRAINT account_metrics_lead_like_count_non_negative CHECK (lead_like_count >= 0),
  CONSTRAINT account_metrics_sales_total_non_negative CHECK (sales_total >= 0),
  UNIQUE (account_id, grain, period_start)
);

DROP TRIGGER IF EXISTS clients_touch_updated_at ON clients;
CREATE TRIGGER clients_touch_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS sources_touch_updated_at ON sources;
CREATE TRIGGER sources_touch_updated_at
BEFORE UPDATE ON sources
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS app_users_touch_updated_at ON app_users;
CREATE TRIGGER app_users_touch_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS accounts_touch_updated_at ON accounts;
CREATE TRIGGER accounts_touch_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS account_sessions_sync_duration ON account_sessions;
CREATE TRIGGER account_sessions_sync_duration
BEFORE INSERT OR UPDATE ON account_sessions
FOR EACH ROW
EXECUTE FUNCTION sync_session_duration();

DROP TRIGGER IF EXISTS account_sessions_touch_updated_at ON account_sessions;
CREATE TRIGGER account_sessions_touch_updated_at
BEFORE UPDATE ON account_sessions
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS leads_touch_updated_at ON leads;
CREATE TRIGGER leads_touch_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS messages_touch_updated_at ON messages;
CREATE TRIGGER messages_touch_updated_at
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS account_metrics_touch_updated_at ON account_metrics;
CREATE TRIGGER account_metrics_touch_updated_at
BEFORE UPDATE ON account_metrics
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

INSERT INTO clients (code, name)
VALUES
  ('WOM', 'WOM'),
  ('CLARO', 'Claro')
ON CONFLICT (code) DO NOTHING;

INSERT INTO sources (code, name, source_type)
VALUES
  ('tiktok', 'TikTok', 'tiktok'),
  ('manual', 'Manual', 'manual'),
  ('import', 'Import', 'import'),
  ('api', 'API', 'api'),
  ('webhook', 'Webhook', 'webhook'),
  ('unknown', 'Unknown', 'other')
ON CONFLICT (code) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS ux_app_users_login_lower ON app_users (lower(login));
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_client_code ON app_users (client_code);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);

CREATE OR REPLACE VIEW v_account_metrics AS
SELECT
  m.*,
  ROUND(m.connection_seconds::numeric / 3600.0, 2) AS connection_hours,
  ROUND(EXTRACT(EPOCH FROM (m.period_end - m.period_start))::numeric / 3600.0, 2) AS period_hours,
  ROUND(m.connection_seconds::numeric / 60.0, 2) AS connection_minutes,
  ROUND(
    CASE
      WHEN m.session_count > 0 THEN m.connection_seconds::numeric / 60.0 / m.session_count
      ELSE 0
    END,
    2
  ) AS avg_connection_minutes_per_session,
  (m.messages_inbound + m.messages_outbound) AS total_messages_by_direction
FROM account_metrics m;

CREATE OR REPLACE VIEW v_client_metrics AS
SELECT
  c.id AS client_id,
  c.code AS client_code,
  c.name AS client_name,
  m.grain,
  m.period_start,
  m.period_end,
  SUM(m.connection_seconds) AS connection_seconds,
  ROUND(SUM(m.connection_seconds)::numeric / 3600.0, 2) AS connection_hours,
  SUM(m.session_count) AS session_count,
  SUM(m.messages_count) AS messages_count,
  SUM(m.messages_inbound) AS messages_inbound,
  SUM(m.messages_outbound) AS messages_outbound,
  SUM(m.lead_like_count) AS lead_like_count,
  SUM(m.sales_total) AS sales_total,
  SUM(m.views_total) AS views_total,
  SUM(m.unique_viewers) AS unique_viewers,
  SUM(m.active_viewers) AS active_viewers,
  MAX(m.peak_viewers) AS peak_viewers,
  AVG(m.avg_response_seconds) AS avg_response_seconds,
  AVG(m.conversion_rate) AS conversion_rate
FROM account_metrics m
JOIN accounts a ON a.id = m.account_id
JOIN clients c ON c.id = a.client_id
GROUP BY
  c.id,
  c.code,
  c.name,
  m.grain,
  m.period_start,
  m.period_end;

CREATE INDEX IF NOT EXISTS idx_accounts_client_id ON accounts (client_id);
CREATE INDEX IF NOT EXISTS idx_accounts_client_status ON accounts (client_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_platform_external_id ON accounts (platform, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_platform_username_lower ON accounts (platform, lower(username));
CREATE INDEX IF NOT EXISTS idx_accounts_status_updated_at ON accounts (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account_started_at ON account_sessions (account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_sessions_status_started_at ON account_sessions (status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_account_sessions_account_session_key ON account_sessions (account_id, session_key);

CREATE INDEX IF NOT EXISTS idx_leads_account_status_last_activity_at ON leads (account_id, status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_account_last_activity_at ON leads (account_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source_id ON leads (source_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_leads_account_username_lower ON leads (account_id, lower(username));
CREATE INDEX IF NOT EXISTS idx_leads_categories_gin ON leads USING gin (categories);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_changed_at ON lead_status_history (lead_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_changed_at ON lead_status_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_account_occurred_at ON messages (account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lead_occurred_at ON messages (lead_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_source_id ON messages (source_id);
CREATE INDEX IF NOT EXISTS idx_messages_status_occurred_at ON messages (status, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_account_external_message_id
  ON messages (account_id, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_categories_gin ON messages USING gin (categories);

CREATE INDEX IF NOT EXISTS idx_message_status_history_message_changed_at ON message_status_history (message_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_status_history_changed_at ON message_status_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_metrics_period_start ON account_metrics (period_start DESC);
CREATE INDEX IF NOT EXISTS idx_account_metrics_account_grain_period_end ON account_metrics (account_id, grain, period_end DESC);
