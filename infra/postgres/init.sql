-- Runs once on first container start.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Restricted application role. Superusers bypass RLS, so the API must NEVER
-- connect as `shiksha`. Migrations use the admin URL; the app uses this role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'shiksha_app') THEN
    CREATE ROLE shiksha_app LOGIN PASSWORD 'shiksha_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT CONNECT ON DATABASE shiksha TO shiksha_app;
GRANT USAGE ON SCHEMA public TO shiksha_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO shiksha_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO shiksha_app;
