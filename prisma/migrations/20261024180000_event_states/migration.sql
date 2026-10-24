-- Event states: CANCELED is stored (canceledAt); OPEN/CLOSED stay isPublished; STARTED/ENDED come from the clock.
ALTER TABLE "events" ADD COLUMN "canceledAt" TIMESTAMP(3);

-- At publish an officer's changes are told to the player once: which character they were switched from, and
-- the assignment last told.
ALTER TABLE "responses" ADD COLUMN "switchedFrom" TEXT;
ALTER TABLE "responses" ADD COLUMN "toldAssignment" TEXT;
