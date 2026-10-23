-- The nickname (what the guild calls a player) moves to the account; characters inherit it.
-- Character.nickname stays only for roster slots nobody has claimed yet.
ALTER TABLE "users" ADD COLUMN "nickname" TEXT;
UPDATE "users" u SET "nickname" = (
  SELECT c."nickname" FROM "characters" c
  WHERE c."userId" = u."id" AND c."nickname" IS NOT NULL
  ORDER BY c."isMain" DESC, c."updatedAt" DESC LIMIT 1
);

-- When the password last changed: a reset link made before it is used up.
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
