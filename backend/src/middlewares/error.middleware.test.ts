import assert from "node:assert/strict";
import test from "node:test";

import { getHttpErrorStatus } from "./error.middleware";

test("maps malformed JSON to HTTP 400", () => {
  assert.equal(getHttpErrorStatus({ type: "entity.parse.failed", status: 400 }), 400);
});

test("maps oversized JSON to HTTP 413", () => {
  assert.equal(getHttpErrorStatus({ type: "entity.too.large", status: 413 }), 413);
});

test("maps rejected CORS origins to HTTP 403", () => {
  assert.equal(getHttpErrorStatus({ code: "CORS_ORIGIN_DENIED" }), 403);
});

test("maps Prisma connection failures to HTTP 503", () => {
  assert.equal(getHttpErrorStatus({ name: "PrismaClientInitializationError" }), 503);
  assert.equal(getHttpErrorStatus({ code: "P1001" }), 503);
});

test("preserves valid explicit HTTP statuses", () => {
  assert.equal(getHttpErrorStatus({ statusCode: 404 }), 404);
  assert.equal(getHttpErrorStatus({ status: 429 }), 429);
});

test("uses HTTP 500 for unknown errors", () => {
  assert.equal(getHttpErrorStatus(new Error("unexpected")), 500);
});
