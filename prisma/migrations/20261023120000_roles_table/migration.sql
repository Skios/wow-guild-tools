-- Site roles move from a fixed enum to a table the Owner configures (src/domain/roles.ts).
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
-- One Owner role, one default role.
CREATE UNIQUE INDEX "roles_one_owner" ON "roles"("isOwner") WHERE "isOwner";
CREATE UNIQUE INDEX "roles_one_default" ON "roles"("isDefault") WHERE "isDefault";

-- Same lock-down as every other table (see 20261021120000_lock_down_data_api).
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "roles" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

-- Base roles. Capability names must exist in the code (checked by src/app.test.ts).
INSERT INTO "roles" ("id", "name", "position", "capabilities", "isDefault", "isOwner", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Owner',       0,  ARRAY[]::TEXT[], false, true,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Guildmaster', 10, ARRAY['roster.manage', 'events.manage', 'messages.send', 'accounts.manage'], false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Officer',     20, ARRAY['roster.manage', 'events.manage', 'messages.send', 'accounts.manage'], false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Raidleader',  30, ARRAY['events.manage', 'messages.send'], false, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Raider',      40, ARRAY[]::TEXT[], true,  false, CURRENT_TIMESTAMP);

ALTER TABLE "users" ADD COLUMN "roleId" TEXT;
UPDATE "users" SET "roleId" = (SELECT "id" FROM "roles" WHERE "name" = 'Owner') WHERE "role" = 'OWNER';
UPDATE "users" SET "roleId" = (SELECT "id" FROM "roles" WHERE "name" = 'Officer') WHERE "role" = 'OFFICER';
-- Everyone else signs in as the default role (only accounts with a login can actually use it).
UPDATE "users" SET "roleId" = (SELECT "id" FROM "roles" WHERE "isDefault") WHERE "role" IS NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "SiteRole";
