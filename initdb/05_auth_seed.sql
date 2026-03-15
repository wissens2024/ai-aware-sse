-- initdb/05_auth_seed.sql
-- Seed initial admin user (password: admin1234!)
-- Safe to re-run (upsert)

\connect sse_db
SET search_path TO sse, public;
SET ROLE sse_app;

DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM tenants WHERE name = 'PoC Tenant' LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'PoC Tenant not found, skipping admin seed';
    RETURN;
  END IF;

  -- Admin user (password: admin1234!)
  INSERT INTO users(tenant_id, email, display_name, password_hash, role)
  VALUES (
    v_tenant_id,
    'admin@example.com',
    'System Admin',
    '$2b$12$zPcMB1g5WmUo.Yd2R4LAteENkvAcBi7DAIGq1Q0.9Q5zWbn81Acz2',
    'admin'
  )
  ON CONFLICT (tenant_id, email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        display_name = EXCLUDED.display_name;

  RAISE NOTICE 'Admin user seeded: admin@example.com / admin1234!';
END $$;

RESET ROLE;
