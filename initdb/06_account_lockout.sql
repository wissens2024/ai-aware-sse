-- initdb/06_account_lockout.sql
-- Account lockout columns for users table
-- Safe to re-run (idempotent)

\connect sse_db
SET search_path TO sse, public;
SET ROLE sse_app;

-- Add account lockout fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

RESET ROLE;
