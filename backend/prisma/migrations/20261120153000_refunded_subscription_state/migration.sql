-- A fully refunded current billing cycle revokes entitlement while keeping
-- the provider subscription visible for cancellation or a later successful cycle.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

DROP INDEX IF EXISTS "Subscription_one_open_per_user_key";

CREATE UNIQUE INDEX "Subscription_one_open_per_user_key"
ON "Subscription"("userId")
WHERE "status" IN ('CREATED', 'ACTIVE', 'PAST_DUE', 'HALTED', 'REFUNDED');
