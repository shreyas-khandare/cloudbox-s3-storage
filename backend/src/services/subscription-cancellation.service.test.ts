import assert from "node:assert/strict";
import test from "node:test";

import { requestRazorpayCancellation } from "./subscription-cancellation.service";

test("scheduled cancellation retry calls Razorpay again even when CloudBox already recorded intent", async () => {
  let calls = 0;

  const result = await requestRazorpayCancellation(
    "sub_retry_cycle_end",
    true,
    true,
    async (subscriptionId, cancelAtCycleEnd) => {
      calls += 1;
      assert.equal(subscriptionId, "sub_retry_cycle_end");
      assert.equal(cancelAtCycleEnd, true);
      return { id: subscriptionId, status: "active" };
    }
  );

  assert.equal(calls, 1);
  assert.deepEqual(result, { kind: "accepted" });
});

test("a 4xx on a retry with an existing cancellation intent requires reconciliation instead of erasing intent", async () => {
  const providerError = { statusCode: 400 };

  const result = await requestRazorpayCancellation(
    "sub_retry_ambiguous",
    true,
    true,
    async () => {
      throw providerError;
    }
  );

  assert.equal(result.kind, "reconciliation_required");
  if (result.kind === "reconciliation_required") {
    assert.equal(result.error, providerError);
  }
});

test("a definitive 4xx on a first cancellation request is classified as rejected", async () => {
  const providerError = { statusCode: 422 };

  const result = await requestRazorpayCancellation(
    "sub_first_rejected",
    true,
    false,
    async () => {
      throw providerError;
    }
  );

  assert.equal(result.kind, "rejected");
  if (result.kind === "rejected") {
    assert.equal(result.error, providerError);
  }
});

test("a timeout on the first cancellation request requires reconciliation", async () => {
  const providerError = new Error("ETIMEDOUT");

  const result = await requestRazorpayCancellation(
    "sub_first_timeout",
    true,
    false,
    async () => {
      throw providerError;
    }
  );

  assert.equal(result.kind, "reconciliation_required");
  if (result.kind === "reconciliation_required") {
    assert.equal(result.error, providerError);
  }
});
