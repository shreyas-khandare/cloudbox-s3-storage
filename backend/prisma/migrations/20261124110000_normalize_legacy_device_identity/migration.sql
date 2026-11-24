-- The initial device-identity migration backfilled old sessions with
-- gen_random_uuid()::TEXT (36 characters including hyphens). Runtime device IDs
-- are 64 hexadecimal characters, so repair only legacy values that do not
-- satisfy the application format. Existing login sessions remain intact.
UPDATE "Session"
SET "deviceId" =
  replace(gen_random_uuid()::TEXT, '-', '') ||
  replace(gen_random_uuid()::TEXT, '-', '')
WHERE "deviceId" !~* '^[a-f0-9]{64}$';
