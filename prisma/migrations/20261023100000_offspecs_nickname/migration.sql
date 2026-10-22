-- Ordered offspecs (2nd, 3rd...) and a nickname that groups a player's characters.
ALTER TABLE "characters" ADD COLUMN "offSpecs" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "characters" ADD COLUMN "nickname" TEXT;
