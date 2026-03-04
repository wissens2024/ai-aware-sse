-- initdb/02_schema.sql
-- AI-Aware SSE MVP schema (complete)
-- Runs during postgres docker init as superuser. We switch to sse_app for object ownership.
-- Safe to re-run (idempotent via IF NOT EXISTS) in init context.

\connect sse_db

-- Ensure schema exists (owned by sse_app from 01 script, but keep safe)
CREATE SCHEMA IF NOT EXISTS sse;

-- Extensions are installed into public by default; include public in search_path so citext resolves.
SET search_path TO sse, public;

-- Ensure extensions exist (safe even if already created)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Ensure sse_app owns schema (in case 01 didn't run fully)
ALTER SCHEMA sse OWNER TO sse_app;

-- Make all objects created below owned by sse_app
SET ROLE sse_app;

BEGIN;

-- ---------- ENUMS ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM ('TYPE','PASTE','SUBMIT','UPLOAD_SELECT','UPLOAD_SUBMIT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_outcome') THEN
    CREATE TYPE decision_outcome AS ENUM ('ALLOW','WARN','BLOCK','MASK','ANONYMIZE','REQUIRE_APPROVAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN
    CREATE TYPE approval_status AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'detector_type') THEN
    CREATE TYPE detector_type AS ENUM ('PII','SECRETS','CODE','CLASSIFIER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_kind') THEN
    CREATE TYPE content_kind AS ENUM ('TEXT','FILE_META');
  END IF;
END$$;

-- ---------- COMMON ----------
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  user_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  external_id       text NULL,                  -- OIDC sub
  email             citext NULL,
  display_name      text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS groups (
  group_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS user_groups (
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  group_id          uuid NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, group_id)
);

-- ---------- APPS ----------
CREATE TABLE IF NOT EXISTS apps (
  app_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              text NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_domains (
  app_domain_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  app_id            uuid NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
  domain            text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);

-- ---------- POLICIES ----------
CREATE TABLE IF NOT EXISTS policies (
  policy_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text NULL,
  priority          int NOT NULL DEFAULT 100,
  enabled           boolean NOT NULL DEFAULT true,

  -- MVP: store as JSON
  scope_json        jsonb NOT NULL,   -- {apps:[...], groups:[...], event_types:[...]}
  condition_json    jsonb NOT NULL,   -- condition tree
  action_json       jsonb NOT NULL,   -- action payload

  version           int NOT NULL DEFAULT 1,
  created_by        uuid NULL,        -- users.user_id (optional)
  updated_by        uuid NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, name)
);

-- ---------- DETECTORS ----------
CREATE TABLE IF NOT EXISTS detector_configs (
  detector_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  type              detector_type NOT NULL,
  enabled           boolean NOT NULL DEFAULT true,
  config_json       jsonb NOT NULL,
  version           int NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);

-- ---------- EVENTS & DECISIONS ----------
CREATE TABLE IF NOT EXISTS events (
  event_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  time               timestamptz NOT NULL DEFAULT now(),

  -- actor snapshot
  user_id            uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  actor_email        citext NULL,
  group_snapshot     jsonb NOT NULL DEFAULT '[]'::jsonb, -- ["Dev","Finance"]

  -- app snapshot
  app_id             uuid NULL REFERENCES apps(app_id) ON DELETE SET NULL,
  domain             text NULL,
  url                text NULL,

  -- event
  event_type         event_type NOT NULL,
  trace_id           text NULL,

  -- content meta (no raw)
  content_kind       content_kind NOT NULL,
  content_length     int NOT NULL DEFAULT 0,
  content_sha256     text NULL,
  content_sample_masked text NULL,

  -- file meta (optional)
  file_name          text NULL,
  file_size_bytes    bigint NULL,
  file_mime          text NULL,
  file_ext           text NULL,
  file_sha256        text NULL,

  -- client meta
  client_meta_json   jsonb NOT NULL DEFAULT '{}'::jsonb,

  schema_version     int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_id           uuid NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,

  outcome            decision_outcome NOT NULL,
  action_json        jsonb NOT NULL,

  risk_score         int NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),

  matched_policy_id  uuid NULL REFERENCES policies(policy_id) ON DELETE SET NULL,
  matched_policy_version int NULL,

  detector_hits_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  explanation_text   text NULL,

  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- APPROVAL CASES ----------
CREATE TABLE IF NOT EXISTS approval_cases (
  case_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  event_id           uuid NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  decision_id        uuid NULL REFERENCES decisions(decision_id) ON DELETE SET NULL,

  status             approval_status NOT NULL DEFAULT 'PENDING',

  requested_by_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  requested_by_email   citext NULL,   -- snapshot
  request_reason     text NULL,

  approver_group_id  uuid NULL REFERENCES groups(group_id) ON DELETE SET NULL,

  decided_by_user_id uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  decision_comment   text NULL,

  decision_payload_json jsonb NULL,   -- {type, conditions, comment}

  expires_at         timestamptz NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------- POLICY EXCEPTIONS (user/tenant-scoped bypass) ----------
CREATE TABLE IF NOT EXISTS policy_exceptions (
  exception_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  actor_email           text NULL,
  policy_id             uuid NOT NULL REFERENCES policies(policy_id) ON DELETE CASCADE,
  expires_at            timestamptz NOT NULL,
  created_from_case_id  uuid NOT NULL REFERENCES approval_cases(case_id) ON DELETE NO ACTION,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ---------- AUDIT TRAIL ----------
CREATE TABLE IF NOT EXISTS audit_trail (
  audit_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
  time               timestamptz NOT NULL DEFAULT now(),

  actor_user_id      uuid NULL REFERENCES users(user_id) ON DELETE SET NULL,
  actor_email        citext NULL,

  action             text NOT NULL,  -- e.g., POLICY_CREATED, APPROVAL_DECIDED
  target_type        text NULL,      -- e.g., policy, case, event
  target_id          uuid NULL,

  details_json       jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_groups_tenant_name ON groups (tenant_id, name);

CREATE INDEX IF NOT EXISTS idx_app_domains_tenant_domain ON app_domains (tenant_id, domain);
CREATE INDEX IF NOT EXISTS idx_policies_tenant_enabled_priority ON policies (tenant_id, enabled, priority);

CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events (tenant_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_domain_time ON events (tenant_id, domain, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_user_time ON events (tenant_id, user_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_tenant_event_type_time ON events (tenant_id, event_type, time DESC);

CREATE INDEX IF NOT EXISTS idx_decisions_tenant_event ON decisions (tenant_id, event_id);
CREATE INDEX IF NOT EXISTS idx_decisions_tenant_outcome_time ON decisions (tenant_id, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cases_tenant_status_time ON approval_cases (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_exceptions_lookup ON policy_exceptions (tenant_id, actor_email, policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_exceptions_expires ON policy_exceptions (expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_trail (tenant_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_events_group_snapshot_gin ON events USING gin (group_snapshot);
CREATE INDEX IF NOT EXISTS idx_policies_scope_gin ON policies USING gin (scope_json);

-- ---------- updated_at trigger helper ----------
CREATE OR REPLACE FUNCTION sse.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_apps_updated_at') THEN
    CREATE TRIGGER trg_apps_updated_at
    BEFORE UPDATE ON apps
    FOR EACH ROW EXECUTE FUNCTION sse.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_policies_updated_at') THEN
    CREATE TRIGGER trg_policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION sse.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_detector_configs_updated_at') THEN
    CREATE TRIGGER trg_detector_configs_updated_at
    BEFORE UPDATE ON detector_configs
    FOR EACH ROW EXECUTE FUNCTION sse.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_approval_cases_updated_at') THEN
    CREATE TRIGGER trg_approval_cases_updated_at
    BEFORE UPDATE ON approval_cases
    FOR EACH ROW EXECUTE FUNCTION sse.set_updated_at();
  END IF;
END$$;

-- ---------- DB-level masked sample length limit ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_sample_len') THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_sample_len
      CHECK (content_sample_masked IS NULL OR char_length(content_sample_masked) <= 512);
  END IF;
END$$;

-- ---------- Default privileges (so future tables/sequences in schema are usable) ----------
-- Note: Must be executed as the schema owner role; we are already SET ROLE sse_app.
GRANT USAGE ON SCHEMA sse TO sse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sse TO sse_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA sse TO sse_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA sse
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sse_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA sse
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sse_app;

-- Reset role back (optional)
RESET ROLE;
