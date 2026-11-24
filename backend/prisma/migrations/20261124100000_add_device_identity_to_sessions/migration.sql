-- Add a stable browser/device identity to each session. Existing sessions
-- receive independent IDs so their current login state is preserved.
ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT;

UPDATE "Session"
SET "deviceId" = gen_random_uuid()::TEXT
WHERE "deviceId" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "deviceId" SET NOT NULL;

-- A user can have only one active session row per browser/device identity.
CREATE UNIQUE INDEX "Session_userId_deviceId_key"
ON "Session"("userId", "deviceId");

-- The composite unique index also supports lookups by userId, so the old
-- standalone index is redundant after this migration.
DROP INDEX "Session_userId_idx";
