-- Enforce one open subscription per user.

CREATE UNIQUE INDEX "Subscription_one_open_per_user"
ON "Subscription" ("userId")
WHERE "status" IN (
    'CREATED',
    'ACTIVE',
    'PAST_DUE',
    'HALTED'
);