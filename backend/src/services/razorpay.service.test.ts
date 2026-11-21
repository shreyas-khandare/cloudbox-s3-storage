import assert from "node:assert/strict";
import test from "node:test";
import { isDefinitiveRazorpayRejection } from "./razorpay.service";

test("Razorpay cancellation errors: classifies explicit 4xx responses as rejected", () => {
  assert.equal(isDefinitiveRazorpayRejection({ statusCode: 400 }), true);
  assert.equal(isDefinitiveRazorpayRejection({ response: { status: 422 } }), true);
  assert.equal(isDefinitiveRazorpayRejection({ statusCode: 499 }), true);
});

test("Razorpay cancellation errors: treats timeouts, transport errors and 5xx as ambiguous", () => {
  assert.equal(isDefinitiveRazorpayRejection(new Error("ETIMEDOUT")), false);
  assert.equal(isDefinitiveRazorpayRejection({ code: "ECONNRESET" }), false);
  assert.equal(isDefinitiveRazorpayRejection({ statusCode: 500 }), false);
  assert.equal(isDefinitiveRazorpayRejection({ response: { status: 503 } }), false);
  assert.equal(isDefinitiveRazorpayRejection(null), false);
});
