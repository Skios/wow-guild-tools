-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identities_userId_idx" ON "identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "identities_platform_platformUserId_key" ON "identities"("platform", "platformUserId");

-- AddForeignKey
ALTER TABLE "identities" ADD CONSTRAINT "identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing accounts: every old platformId was a Telegram user id (some with a "tg_" prefix).
INSERT INTO "identities" ("id", "platform", "platformUserId", "userId")
SELECT gen_random_uuid()::text, 'telegram', regexp_replace("platformId", '^tg_', ''), "id" FROM "users";

-- DropIndex
DROP INDEX "users_platformId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "platformId";
