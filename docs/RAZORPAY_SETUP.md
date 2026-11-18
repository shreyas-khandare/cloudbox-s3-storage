# Razorpay subscription setup for CloudBox

CloudBox uses Razorpay **Subscriptions** for Pro and Business. The backend creates the subscription and returns Razorpay's hosted checkout URL. Razorpay webhooks, not a browser-side success message, activate the paid plan and apply the storage quota.

## 1. Create the monthly plans in Razorpay

Create two plans in the Razorpay Dashboard. Keep the amounts and billing period aligned with `backend/src/config/subscription-plans.ts`.

| CloudBox plan | Amount | Billing frequency |
| --- | ---: | --- |
| Pro | ₹149 | Every 1 month |
| Business | ₹399 | Every 1 month |

Copy each Razorpay Plan ID. Use IDs from the same mode as the API keys (Test with Test, Live with Live).

## 2. Configure the backend environment

Add these values to `backend/.env`:

```dotenv
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_PRO_PLAN_ID=
RAZORPAY_BUSINESS_PLAN_ID=
RAZORPAY_WEBHOOK_SECRET=
```

The existing backend also requires its normal database, AWS, Google OAuth, Resend, and frontend URL variables. Restart the backend after changing environment variables.

The API can start without the two Plan IDs for local development, but paid subscription creation returns HTTP 503 until the selected plan's ID is configured.

## 3. Configure the webhook

In the Razorpay Dashboard, add a webhook pointing to:

```text
https://YOUR_API_HOST/api/webhooks/razorpay
```

Set a strong webhook secret and put the exact same value in `RAZORPAY_WEBHOOK_SECRET` on the backend.

Enable the events that the current CloudBox webhook processor handles:

- `subscription.activated`
- `subscription.charged`
- `payment.failed`
- `subscription.cancelled`
- `subscription.pending`
- `subscription.halted`
- `subscription.resumed`

The webhook route must be publicly reachable by Razorpay over HTTPS. Do not put the webhook secret or Razorpay key secret in the frontend environment.

## 4. Test the complete flow

1. Use Razorpay Test Mode keys and Test Mode Plan IDs.
2. Sign in to CloudBox and open `/plans`.
3. Choose Pro or Business. CloudBox calls `POST /api/subscriptions` and displays the Razorpay-hosted checkout link returned by the backend.
4. Complete the hosted subscription authorization with Razorpay's test credentials.
5. Return to CloudBox. The plan remains pending until Razorpay delivers a valid webhook and the backend processes the charge.
6. Confirm the subscription lifecycle status through `/billing`. The `subscription.activated` event records the Razorpay lifecycle state; CloudBox grants paid plan storage only after a verified `subscription.charged` event confirms the plan amount was captured.
7. Test cancellation from `/billing`. CloudBox schedules cancellation at the end of the current billing period.

A successful browser redirect alone does not activate a paid entitlement. The verified `subscription.charged` webhook is responsible for updating the user plan and storage limit.

## 5. Reconcile a paid subscription after a missed webhook

If a customer completed a subscription payment before the webhook endpoint was configured, CloudBox may still show the local subscription as `CREATED`. Do not ask the customer to subscribe or pay again.

The one-time reconciliation script at `backend/src/scripts/reconcile-razorpay-subscription.ts` re-fetches the subscription, its paid invoice, and the linked payment from Razorpay. It checks the subscription/plan IDs, INR amount, invoice state, and captured payment before calling CloudBox's existing transactional activation function.

Run it only from the backend directory and only after confirming that `backend/.env` points to the database used by the account being repaired:

```bash
cd backend
RAZORPAY_SUBSCRIPTION_ID=sub_xxxxxxxxxxxxx pnpm exec tsx src/scripts/reconcile-razorpay-subscription.ts
```

Replace the example value with the existing Razorpay subscription ID. The script does not create a subscription or charge. It exits without changing entitlements if Razorpay's subscription, plan, invoice, or captured payment checks do not match.

## 6. Upload-size note

The Business plan is configured for 10 GiB per file, but the current single-request S3 upload flow advertises and enforces a maximum of 5 GB. Larger uploads require the multipart S3 implementation; the plan page displays the effective limit returned by the API.

Before switching to Live Mode, replace all Test Mode keys and Plan IDs with the matching Live Mode values and verify a real webhook delivery.