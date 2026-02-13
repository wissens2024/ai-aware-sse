-- 01_create_db_user.sql

-- 1) app role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sse_app') THEN
    CREATE ROLE sse_app LOGIN PASSWORD 'change_me_app_pw';
  END IF;
END$$;

-- 2) db (conditional)
SELECT format('CREATE DATABASE %I OWNER %I', 'sse_db', 'sse_app')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sse_db')
\gexec

-- 3) connect + schema + extensions
\connect sse_db

CREATE SCHEMA IF NOT EXISTS sse AUTHORIZATION sse_app;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA sse TO sse_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
