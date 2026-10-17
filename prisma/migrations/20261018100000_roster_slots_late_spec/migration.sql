-- AlterEnum
ALTER TYPE "ResponseStatus" ADD VALUE 'LATE';

-- AlterTable: a character can exist before anyone claims it
ALTER TABLE "characters" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "characters" ADD COLUMN "spec" TEXT;
ALTER TABLE "characters" ADD COLUMN "inRoster" BOOLEAN NOT NULL DEFAULT false;
