-- Bot conversations in progress (serverless: no shared memory between requests).
CREATE TABLE "chat_drafts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_drafts_kind_platform_platformUserId_key" ON "chat_drafts"("kind", "platform", "platformUserId");

-- Same lock-down as every other table (see 20261021120000_lock_down_data_api).
ALTER TABLE "chat_drafts" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "chat_drafts" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
