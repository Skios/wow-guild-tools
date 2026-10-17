-- AlterTable: officers have no identity until the admin gets a login
ALTER TABLE "events" ALTER COLUMN "createdBy" DROP NOT NULL;
