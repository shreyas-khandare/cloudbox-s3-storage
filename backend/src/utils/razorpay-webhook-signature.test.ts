import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import testCase from "node:test";

import { verifyRazorpayWebhookSignature } from "./razorpay-webhook-signature";

const secret = "test-webhook-secret";
const body = Buffer.from(
  JSON.stringify({ event: "subscription.charged", payload: { id: "evt_test" } })
);

const signatureFor = (input: Buffer): string =>
  createHmac("sha256", secret).update(input).digest("hex");

testCase("accepts a valid signature for the exact raw body", () => {
  assert.equal(
    verifyRazorpayWebhookSignature(body, signatureFor(body), secret),
    true
  );
});

testCase("rejects a signature when the raw body changes", () => {
  const changedBody = Buffer.from(body.toString("utf8") + " ");
  assert.equal(
    verifyRazorpayWebhookSignature(changedBody, signatureFor(body), secret),
    false
  );
});

testCase("rejects malformed signatures", () => {
  assert.equal(
    verifyRazorpayWebhookSignature(body, "not-a-signature", secret),
    false
  );
});

testCase("rejects missing webhook secrets", () => {
  assert.equal(
    verifyRazorpayWebhookSignature(body, signatureFor(body), ""),
    false
  );
});
