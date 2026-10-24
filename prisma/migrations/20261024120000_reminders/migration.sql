-- Reminders: one private message per row to whoever hasn't answered, at the event's startTime - minutesBefore.
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reminders_eventId_minutesBefore_key" ON "reminders"("eventId", "minutesBefore");
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lock-down as every other table (see 20261021120000_lock_down_data_api).
ALTER TABLE "reminders" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "reminders" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

-- The database wakes the API, the API doesn't poll the database. Every 5 minutes pg_cron runs this check
-- inside Postgres; only when a reminder is due does pg_net call POST /api/reminders/run, which sends them.
-- The address and the shared secret live in Supabase Vault, set once per environment (README "Reminders");
-- without them nothing is called. Kept out of "public" so the Data API can never expose it.
CREATE SCHEMA IF NOT EXISTS jobs;
REVOKE ALL ON SCHEMA jobs FROM PUBLIC;

CREATE OR REPLACE FUNCTION jobs.wake_reminders() RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  url text;
  secret text;
BEGIN
  -- Prisma stores UTC in "timestamp without time zone".
  IF NOT EXISTS (
    SELECT 1 FROM public.reminders r JOIN public.events e ON e.id = r."eventId"
    WHERE r."sentAt" IS NULL AND e."startTime" - make_interval(mins => r."minutesBefore") <= (now() AT TIME ZONE 'UTC')
  ) THEN
    RETURN;
  END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'reminders_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'reminders_secret';
  IF url IS NULL OR secret IS NULL THEN RETURN; END IF;
  -- The secret travels in a header: https only, plain http just for a local API.
  IF url !~* '^https://' AND url !~* '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END $$;
REVOKE ALL ON FUNCTION jobs.wake_reminders() FROM PUBLIC;

-- pg_cron lives in one database only (Prisma's shadow database during `migrate dev` skips this).
DO $$
BEGIN
  IF current_database() = current_setting('cron.database_name', true) THEN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule('wake-reminders', '*/5 * * * *', 'SELECT jobs.wake_reminders()');
  END IF;
END $$;
