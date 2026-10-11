-- AlterTable
ALTER TABLE "events" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "responses" ADD COLUMN     "isConfirmed" BOOLEAN NOT NULL DEFAULT false;
