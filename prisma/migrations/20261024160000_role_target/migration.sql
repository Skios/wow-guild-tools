-- Role targets: an event's own (null = the guild default), and guild-wide settings holding the default.
ALTER TABLE "events" ADD COLUMN "roleTarget" JSONB;

CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- Same lock-down as every other table (see 20261021120000_lock_down_data_api).
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "settings" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
