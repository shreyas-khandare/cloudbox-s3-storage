import assert from "node:assert/strict";
import testCase from "node:test";

import {
  getDependencyFailure,
  isServiceUnavailable,
  isUniqueConstraintViolation,
} from "./dependency-error";

testCase("maps missing S3 objects to 404", () => {
  assert.equal(getDependencyFailure({ name: "NotFound", $metadata: { httpStatusCode: 404 } }).status, 404);
});

testCase("maps storage quota conflicts to 409", () => {
  assert.equal(getDependencyFailure({ code: "STORAGE_LIMIT_EXCEEDED" }).status, 409);
  assert.equal(getDependencyFailure(new Error("STORAGE_LIMIT_EXCEEDED")).status, 409);
});

testCase("maps Prisma uniqueness conflicts to 409", () => {
  assert.equal(getDependencyFailure({ code: "P2002" }).status, 409);
});

testCase("maps database and network outages to 503", () => {
  assert.equal(getDependencyFailure({ name: "PrismaClientInitializationError" }).status, 503);
  assert.equal(getDependencyFailure({ code: "ECONNRESET" }).status, 503);
});

testCase("maps S3 upstream failures to 503", () => {
  assert.equal(getDependencyFailure({ $metadata: { httpStatusCode: 503 } }).status, 503);
});

testCase("does not expose unknown provider errors", () => {
  const result = getDependencyFailure(new Error("sensitive internal detail"));
  assert.equal(result.status, 500);
  assert.equal(result.message.includes("sensitive internal detail"), false);
});

testCase("classifies database outages as service unavailable", () => {
  assert.equal(isServiceUnavailable({ code: "P1001" }), true);
  assert.equal(isServiceUnavailable({ name: "PrismaClientInitializationError" }), true);
  assert.equal(isServiceUnavailable(new Error("unexpected")), false);
});

testCase("detects unique constraint races", () => {
  assert.equal(isUniqueConstraintViolation({ code: "P2002" }), true);
  assert.equal(isUniqueConstraintViolation({ code: "P2025" }), false);
});
