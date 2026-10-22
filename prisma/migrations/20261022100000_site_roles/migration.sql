-- Officer flag -> role. OWNER sits above OFFICER; capabilities live in src/domain/roles.ts.
CREATE TYPE "SiteRole" AS ENUM ('OWNER', 'OFFICER');
ALTER TABLE "users" ADD COLUMN "role" "SiteRole";
UPDATE "users" SET "role" = 'OFFICER' WHERE "isOfficer";
ALTER TABLE "users" DROP COLUMN "isOfficer";
