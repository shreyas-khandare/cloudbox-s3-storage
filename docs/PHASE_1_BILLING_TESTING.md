# Phase 1 billing integration tests

These tests exercise CloudBox subscription persistence, webhook processing, idempotency, refunds, and grace-period expiry against PostgreSQL.

## Local execution

The backend `.env` file must point `DATABASE_URL` at the disposable Neon `testdb` branch. Do not run the integration suite against the original database branch or a production database.

From the `backend` directory in WSL:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
CLOUDBOX_ALLOW_DATABASE_TESTS=1 pnpm test:integration
pnpm test
pnpm build
```

The integration command requires an explicit opt-in so it cannot run accidentally. It loads the backend `.env` file, then uses its `DATABASE_URL` unless `CLOUDBOX_TEST_DATABASE_URL` is explicitly supplied.

The test creates uniquely named temporary users, subscriptions, payments, refunds, and webhook events, and removes those records after the test. It does not truncate tables or delete unrelated data. A failed process may leave rows with the `phase1-` test email prefix for manual inspection and cleanup.

## CI execution

GitHub Actions starts a disposable PostgreSQL 16 service, applies all Prisma migrations, runs the existing unit suite and billing integration suite, and then builds the backend. This CI database is separate from Neon.

## Covered behavior

- Provider subscription creation and checkout URL persistence.
- Refusal of a second open subscription.
- Concurrent checkout attempts, unique-index enforcement, and provider cancellation compensation for the losing request.
- First captured subscription charge and Pro entitlement activation.
- Duplicate webhook delivery and unique payment persistence.
- A delayed payment failure cannot overwrite a captured payment.
- Partial refunds are accumulated and do not automatically revoke access.
- Duplicate refund IDs are not counted twice.
- Full refunds revoke paid access and mark the local subscription as refunded.
- A delayed charge event cannot reactivate a payment that has already been fully refunded.
- Scheduled cancellation of a refunded subscription and HALTED grace-period expiry.

Razorpay provider calls are mocked in these integration tests. A separate Test Mode webhook delivery is still required to validate the real provider-to-CloudBox network path. No Live Mode payments are used.
