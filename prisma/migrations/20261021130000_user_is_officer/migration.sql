-- Officers manage the admin site; set only by scripts/officer.ts.
ALTER TABLE "users" ADD COLUMN "isOfficer" BOOLEAN NOT NULL DEFAULT false;
