-- Add the explicit state used when the latest successful billing payment is fully refunded.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
