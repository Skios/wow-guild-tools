-- Set when an officer resets someone's password (temporary password): the account must pick a new one first.
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
