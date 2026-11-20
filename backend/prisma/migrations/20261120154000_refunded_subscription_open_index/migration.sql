-- Keep refunded provider subscriptions visible as open until the user cancels
-- them or a later confirmed billing action changes their state.
DROP INDEX IF EXISTS "Subscription_one_open_per_user_key";

CREATE UNIQUE INDEX "Subscription_one_open_per_user_key"
ON "Subscription"("userId")
WHERE "status" IN ('CREATED', 'ACTIVE', 'PAST_DUE', 'HALTED', 'REFUNDED');
