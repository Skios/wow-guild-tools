-- The spec a character plays at one event (an officer's call, among its off-specs); null = its main spec.
ALTER TABLE "responses" ADD COLUMN "spec" TEXT;
