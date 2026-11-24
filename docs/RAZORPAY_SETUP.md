# Razorpay subscription setup for CloudBox

CloudBox uses Razorpay **Subscriptions** for Pro and Business. The backend creates the subscription and returns its ID plus the public Razorpay Key ID. The frontend opens Razorpay Checkout.js with `subscription_id`, verifies the checkout response signature through CloudBox's backend, and returns the customer to `/dashboard`. Razorpay webhooks, not the browser response, activate the paid plan and apply the storage quota.

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
3. Choose Pro or Business. CloudBox calls `POST /api/subscriptions`, then opens Razorpay Checkout.js using the returned `subscription_id` and public Key ID. No hosted registration-link URL is used for this browser checkout.
4. Complete the subscription authorization in Razorpay Checkout using Razorpay's test credentials.
5. On success, Checkout returns `razorpay_payment_id`, `razorpay_subscription_id`, and `razorpay_signature` to the frontend. CloudBox sends these values to `POST /api/subscriptions/verify-checkout`; the backend looks up the subscription belonging to the signed-in user and verifies the signature using its stored subscription ID and secret. After successful signature verification, the customer is sent to `/dashboard`.
6. The dashboard refreshes the signed-in account while waiting for Razorpay's webhook. If the webhook is delayed, the dashboard tells the customer to check Billing and not to pay again. The signature endpoint does not grant plan access.
7. Confirm the subscription lifecycle through `/billing`. `subscription.activated` records the provider lifecycle state; CloudBox grants paid storage only after a verified `subscription.charged` event confirms the captured plan amount.
8. Test cancellation from `/billing`. CloudBox schedules cancellation at the end of the current billing period.

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

## 6. Upload-size limits

CloudBox enforces these per-file limits on both upload URL creation and file-metadata save:

| Plan | Maximum file size |
| --- | ---: |
| Free | 100 MB |
| Pro | 3 GB |
| Business | 5 GB |

The Pro limit is stored as 3 GiB (3 × 1024³ bytes). The Business limit is 5,000,000,000 bytes to match the current single-request S3 upload cap. Files above 5 GB require the S3 multipart upload implementation, which is not available yet. The Plans API and frontend display the effective enforced limit.

Before switching to Live Mode, replace all Test Mode keys and Plan IDs with the matching Live Mode values and verify a real webhook delivery.