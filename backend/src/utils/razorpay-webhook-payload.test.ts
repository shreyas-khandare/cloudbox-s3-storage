import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscriptionChargedEvent, unwrapRazorpayWebhookPayload } from "./razorpay-webhook-payload";

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
