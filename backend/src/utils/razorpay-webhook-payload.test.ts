import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSubscriptionChargedEvent,
  resolvePaymentFailedSubscriptionId,
  unwrapRazorpayWebhookPayload,
} from "./razorpay-webhook-payload";

const validPayload = (): any => ({
  event: "subscription.charged",
  payload: {
    subscription: {
      entity: {
        id: "sub_test_123",
        status: "active",
        current_start: 1795046400,
        current_end: 1797638400,
      },
    },
    payment: {
      entity: {
        id: "pay_test_123",
        amount: 14900,
        currency: "INR",
        status: "captured",
        created_at: 1795046400,
        invoice_id: "inv_test_123",
        // Razorpay's documented payload does not include subscription_id here.
      },
    },
  },
}).payload;

test("accepts a documented subscription.charged payload without payment.subscription_id", () => {
  const parsed = parseSubscriptionChargedEvent(validPayload());

  assert.equal(parsed.subscriptionId, "sub_test_123");
  assert.equal(parsed.paymentId, "pay_test_123");
  assert.equal(parsed.amount, 14900);
  assert.equal(parsed.currency, "INR");
  assert.ok(parsed.currentPeriodEnd > parsed.currentPeriodStart);
});

test("accepts payment.subscription_id when it matches the parent subscription", () => {
  const payload = validPayload();
  payload.payment.entity.subscription_id = "sub_test_123";

  const parsed = parseSubscriptionChargedEvent(payload);
  assert.equal(parsed.subscriptionId, "sub_test_123");
});

test("rejects an explicit payment.subscription_id that conflicts with the parent subscription", () => {
  const payload = validPayload();
  payload.payment.entity.subscription_id = "sub_other_456";

  assert.throws(
    () => parseSubscriptionChargedEvent(payload),
    /Invalid subscription.charged payload/
  );
});

test("rejects an uncaptured or non-positive payment amount", () => {
  const uncaptured = validPayload();
  uncaptured.payment.entity.status = "authorized";
  assert.throws(
    () => parseSubscriptionChargedEvent(uncaptured),
    /Invalid subscription.charged payload/
  );

  const wrongAmount = validPayload();
  wrongAmount.payment.entity.amount = 0;
  assert.throws(
    () => parseSubscriptionChargedEvent(wrongAmount),
    /Invalid subscription.charged payload/
  );
});

test("unwraps the complete Razorpay webhook event envelope", () => {
  const inner = validPayload();
  const envelope = {
    entity: "event",
    event: "subscription.charged",
    payload: inner,
  };

  assert.deepEqual(unwrapRazorpayWebhookPayload(envelope), inner);
  const parsed = parseSubscriptionChargedEvent(envelope);
  assert.equal(parsed.subscriptionId, "sub_test_123");
});

test("keeps an already-unwrapped Razorpay resource payload unchanged", () => {
  const inner = validPayload();
  assert.equal(unwrapRazorpayWebhookPayload(inner), inner);
});

test("resolves payment.failed subscription ID from the Razorpay invoice when payment has no subscription_id", async () => {
  const payload = {
    event: "payment.failed",
    payload: {
      payment: {
        entity: {
          id: "pay_failed_invoice_lookup",
          status: "failed",
          invoice_id: "inv_subscription_invoice",
        },
      },
    },
  };
  let invoiceLookups = 0;

  const subscriptionId = await resolvePaymentFailedSubscriptionId(
    payload,
    async (invoiceId) => {
      invoiceLookups += 1;
      assert.equal(invoiceId, "inv_subscription_invoice");
      return { subscription_id: "sub_from_invoice" };
    }
  );

  assert.equal(subscriptionId, "sub_from_invoice");
  assert.equal(invoiceLookups, 1);
});

test("prefers an explicit payment subscription ID without making an invoice API call", async () => {
  const subscriptionId = await resolvePaymentFailedSubscriptionId(
    {
      payment: {
        entity: {
          subscription_id: "sub_direct",
          invoice_id: "inv_should_not_be_requested",
        },
      },
    },
    async () => {
      assert.fail("Invoice lookup should not run when the payment includes subscription_id");
    }
  );

  assert.equal(subscriptionId, "sub_direct");
});

test("uses the sibling subscription entity when present", async () => {
  const subscriptionId = await resolvePaymentFailedSubscriptionId(
    {
      subscription: { entity: { id: "sub_sibling" } },
      payment: { entity: { invoice_id: "inv_should_not_be_requested" } },
    },
    async () => {
      assert.fail("Invoice lookup should not run when the event includes a subscription entity");
    }
  );

  assert.equal(subscriptionId, "sub_sibling");
});

test("returns null for a payment without a subscription or invoice association", async () => {
  const subscriptionId = await resolvePaymentFailedSubscriptionId(
    { payment: { entity: { id: "pay_unlinked" } } },
    async () => {
      assert.fail("No invoice lookup should run when invoice_id is absent");
    }
  );

  assert.equal(subscriptionId, null);
});

test("returns null when the fetched invoice is not linked to a subscription", async () => {
  const subscriptionId = await resolvePaymentFailedSubscriptionId(
    {
      payment: {
        entity: {
          id: "pay_standalone",
          invoice_id: "inv_standalone",
        },
      },
    },
    async () => ({ subscription_id: null })
  );

  assert.equal(subscriptionId, null);
});

test("propagates invoice lookup failures so Razorpay can retry the webhook", async () => {
  await assert.rejects(
    resolvePaymentFailedSubscriptionId(
      {
        payment: {
          entity: {
            id: "pay_invoice_api_error",
            invoice_id: "inv_temporarily_unavailable",
          },
        },
      },
      async () => {
        throw new Error("Razorpay invoice API unavailable");
      }
    ),
    /Razorpay invoice API unavailable/
  );
});

