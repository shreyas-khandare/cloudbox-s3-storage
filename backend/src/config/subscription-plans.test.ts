import assert from "node:assert/strict";
import test from "node:test";

import { SUBSCRIPTION_PLANS } from "./subscription-plans";
import {
  MAX_SINGLE_UPLOAD_SIZE,
  formatUploadLimitLabel,
} from "./upload";

test("Free plan allows files up to 100 MB", () => {
  assert.equal(SUBSCRIPTION_PLANS.FREE.maxFileSize, 100 * 1024 * 1024);
  assert.equal(formatUploadLimitLabel(SUBSCRIPTION_PLANS.FREE.maxFileSize), "100 MB");
});

test("Pro plan allows files up to 3 GB", () => {
  assert.equal(SUBSCRIPTION_PLANS.PRO.maxFileSize, 3 * 1024 * 1024 * 1024);
  assert.equal(formatUploadLimitLabel(SUBSCRIPTION_PLANS.PRO.maxFileSize), "3 GB");
});

test("Business plan matches the 5 GB single-request S3 cap", () => {
  assert.equal(SUBSCRIPTION_PLANS.BUSINESS.maxFileSize, MAX_SINGLE_UPLOAD_SIZE);
  assert.equal(formatUploadLimitLabel(SUBSCRIPTION_PLANS.BUSINESS.maxFileSize), "5 GB");
});

test("device limits match the Free, Pro, and Business plan policy", () => {
  assert.equal(SUBSCRIPTION_PLANS.FREE.deviceLimit, 2);
  assert.equal(SUBSCRIPTION_PLANS.PRO.deviceLimit, 3);
  assert.equal(SUBSCRIPTION_PLANS.BUSINESS.deviceLimit, 3);
});

test("no plan exceeds the current single-request S3 cap", () => {
  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    assert.ok(
      plan.maxFileSize <= MAX_SINGLE_UPLOAD_SIZE,
      `${plan.name} plan exceeds the single-request upload cap`
    );
  }
});
