-- Officers' private messages from an event page, so the page can show when each player was contacted.
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sentBy" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contacts_eventId_idx" ON "contacts"("eventId");
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lock-down as every other table (see 20261021120000_lock_down_data_api).
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "contacts" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
