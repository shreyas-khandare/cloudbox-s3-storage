import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { verifyRazorpaySubscriptionCheckoutSignature } from "./razorpay-subscription-signature";

const secret = "test-razorpay-secret";
const paymentId = "pay_test_123";
const subscriptionId = "sub_test_456";

const signature = createHmac("sha256", secret)
  .update(`${paymentId}|${subscriptionId}`)
  .digest("hex");

test("accepts a valid subscription checkout signature", () => {
  assert.equal(
    verifyRazorpaySubscriptionCheckoutSignature(
      paymentId,
      subscriptionId,
      signature,
      secret
    ),
    true
  );
});

test("rejects a signature for a different payment or subscription", () => {
  assert.equal(
    verifyRazorpaySubscriptionCheckoutSignature(
      "pay_other",
      subscriptionId,
      signature,
      secret
    ),
    false
  );
  assert.equal(
    verifyRazorpaySubscriptionCheckoutSignature(
      paymentId,
      "sub_other",
      signature,
      secret
    ),
    false
  );
});

test("rejects malformed signatures and missing values", () => {
  assert.equal(
    verifyRazorpaySubscriptionCheckoutSignature(
      paymentId,
      subscriptionId,
      "invalid",
      secret
    ),
    false
  );
  assert.equal(
    verifyRazorpaySubscriptionCheckoutSignature(
      paymentId,
      subscriptionId,
      signature,
      ""
    ),
    false
  );
});
