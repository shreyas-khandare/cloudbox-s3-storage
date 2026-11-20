import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import test from "node:test";

dotenv.config();

if (process.env.CLOUDBOX_ALLOW_DATABASE_TESTS !== "1") {
  throw new Error(
    "Set CLOUDBOX_ALLOW_DATABASE_TESTS=1 only after confirming DATABASE_URL points to a disposable test database."
  );
}

const testDatabaseUrl =
  process.env.CLOUDBOX_TEST_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "Set DATABASE_URL or CLOUDBOX_TEST_DATABASE_URL to the disposable CloudBox test database."
  );
}

// The explicit opt-in above prevents accidental execution against a normal DB.
process.env.DATABASE_URL = testDatabaseUrl;

const testEnvironment: Record<string, string> = {
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_BUCKET_NAME: "cloudbox-test-bucket",
  CLIENT_URL: "http://localhost:5173",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM: "CloudBox Test <test@example.test>",
  RAZORPAY_KEY_ID: "rzp_test_placeholder",
  RAZORPAY_KEY_SECRET: "test-razorpay-secret",
  RAZORPAY_PRO_PLAN_ID: "plan_test_pro",
  RAZORPAY_BUSINESS_PLAN_ID: "plan_test_business",
};

for (const [key, value] of Object.entries(testEnvironment)) {
  process.env[key] ||= value;
}

type TestRuntime = {
  prisma: typeof import("../config/prisma").default;
  Plan: typeof import("@prisma/client").Plan;
  PaymentStatus: typeof import("@prisma/client").PaymentStatus;
  SubscriptionStatus: typeof import("@prisma/client").SubscriptionStatus;
  WebhookStatus: typeof import("@prisma/client").WebhookStatus;
  createSubscription: typeof import("./subscription.service").createSubscription;
  processRazorpayWebhookEvent: typeof import("./razorpay-webhook.service").processRazorpayWebhookEvent;
};

let runtimePromise: Promise<TestRuntime> | undefined;

const getRuntime = (): Promise<TestRuntime> => {
  runtimePromise ??= (async () => {
    const [{ default: prisma }, prismaEnums, subscriptionService, webhookService] =
      await Promise.all([
        import("../config/prisma"),
        import("@prisma/client"),
        import("./subscription.service"),
        import("./razorpay-webhook.service"),
      ]);

    return {
      prisma,
      Plan: prismaEnums.Plan,
      PaymentStatus: prismaEnums.PaymentStatus,
      SubscriptionStatus: prismaEnums.SubscriptionStatus,
      WebhookStatus: prismaEnums.WebhookStatus,
      createSubscription: subscriptionService.createSubscription,
      processRazorpayWebhookEvent: webhookService.processRazorpayWebhookEvent,
    };
  })();

  return runtimePromise;
};

const envelope = (event: string, payload: Record<string, unknown>) => ({
  entity: "event",
  event,
  payload,
});

test("billing integration: checkout persistence, webhook idempotency, and refunds", async (t) => {
  const {
    prisma,
    Plan,
    PaymentStatus,
    SubscriptionStatus,
    WebhookStatus,
    createSubscription,
    processRazorpayWebhookEvent,
  } = await getRuntime();

  const prefix = randomUUID().replace(/-/g, "");
  const email = `phase1-${prefix}@example.test`;
  const razorpaySubscriptionId = `sub_phase1_${prefix}`;
  const razorpayPaymentId = `pay_phase1_${prefix}`;
  const checkoutUrl = `https://rzp.io/i/${prefix}`;
  const webhookEventIds: string[] = [];
  let userId: string | undefined;
  let subscriptionId: string | undefined;

  const saveWebhook = async (
    eventType: string,
    payload: Record<string, unknown>,
    suffix: string
  ) => {
    const eventId = `evt_phase1_${prefix}_${suffix}`;
    webhookEventIds.push(eventId);
    await prisma.razorpayWebhookEvent.create({
      data: {
        eventId,
        eventType,
        payload: envelope(eventType, payload),
        razorpaySubscriptionId,
        status: WebhookStatus.PENDING,
      },
    });
    return eventId;
  };

  try {
    const user = await prisma.user.create({
      data: {
        name: "CloudBox Phase 1 Test",
        email,
        emailVerified: true,
      },
      select: { id: true },
    });
    userId = user.id;

    await t.test("creates a provider subscription and persists its checkout URL", async () => {
      let createCalls = 0;
      let cancelCalls = 0;

      const result = await createSubscription(user.id, Plan.PRO, {
        create: async (planId, requestedUserId) => {
          createCalls += 1;
          assert.equal(planId, "plan_test_pro");
          assert.equal(requestedUserId, user.id);
          return { id: razorpaySubscriptionId, short_url: checkoutUrl };
        },
        cancel: async () => {
          cancelCalls += 1;
        },
      });

      assert.equal(createCalls, 1);
      assert.equal(cancelCalls, 0);
      assert.equal(result.subscription.checkoutUrl, checkoutUrl);
      assert.equal(result.razorpay.shortUrl, checkoutUrl);

      const stored = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId },
      });
      assert.ok(stored);
      assert.equal(stored.checkoutUrl, checkoutUrl);
      assert.equal(stored.status, SubscriptionStatus.CREATED);
      subscriptionId = stored.id;
    });

    await t.test("prevents a second open subscription for the same user", async () => {
      let providerCreateCalls = 0;

      await assert.rejects(
        createSubscription(user.id, Plan.BUSINESS, {
          create: async () => {
            providerCreateCalls += 1;
            return {
              id: `sub_unexpected_${prefix}`,
              short_url: checkoutUrl,
            };
          },
          cancel: async () => undefined,
        }),
        /active or pending subscription/
      );

      assert.equal(providerCreateCalls, 0);
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const periodStart = nowSeconds - 60;
    const periodEnd = nowSeconds + 30 * 24 * 60 * 60;

    const chargedPayload = {
      subscription: {
        entity: {
          id: razorpaySubscriptionId,
          status: "active",
          plan_id: "plan_test_pro",
          current_start: periodStart,
          current_end: periodEnd,
        },
      },
      payment: {
        entity: {
          id: razorpayPaymentId,
          amount: 14900,
          currency: "INR",
          status: "captured",
          created_at: nowSeconds,
        },
      },
    };

    await t.test("processes the first captured charge and grants the Pro entitlement", async () => {
      const eventId = await saveWebhook(
        "subscription.charged",
        chargedPayload,
        "charged"
      );

      const result = await processRazorpayWebhookEvent(eventId);
      assert.equal(result.duplicate, false);

      const [subscription, updatedUser, payment, webhook] = await Promise.all([
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.payment.findUnique({
          where: { razorpayPaymentId },
        }),
        prisma.razorpayWebhookEvent.findUnique({ where: { eventId } }),
      ]);

      assert.equal(subscription?.status, SubscriptionStatus.ACTIVE);
      assert.equal(updatedUser?.plan, Plan.PRO);
      assert.equal(payment?.status, PaymentStatus.CAPTURED);
      assert.equal(payment?.amount, 14900);
      assert.equal(webhook?.status, WebhookStatus.PROCESSED);
    });

    await t.test("acknowledges a duplicate event without creating another payment", async () => {
      const eventId = webhookEventIds[0];
      const result = await processRazorpayWebhookEvent(eventId);
      assert.equal(result.duplicate, true);

      const payments = await prisma.payment.count({
        where: { subscriptionId },
      });
      assert.equal(payments, 1);
    });

    await t.test("does not let a delayed payment.failed event overwrite a captured payment", async () => {
      const eventId = await saveWebhook(
        "payment.failed",
        {
          payment: {
            entity: {
              id: razorpayPaymentId,
              subscription_id: razorpaySubscriptionId,
              amount: 14900,
              currency: "INR",
              status: "failed",
              error_description: "Delayed failure notification",
            },
          },
        },
        "late-failed"
      );

      await processRazorpayWebhookEvent(eventId);

      const payment = await prisma.payment.findUnique({
        where: { razorpayPaymentId },
      });
      const subscription = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId },
      });
      assert.equal(payment?.status, PaymentStatus.CAPTURED);
      assert.equal(subscription?.status, SubscriptionStatus.ACTIVE);
    });

    const refundProcessedAt = Math.floor(Date.now() / 1000);

    await t.test("records a partial refund but keeps the paid entitlement", async () => {
      const eventId = await saveWebhook(
        "refund.processed",
        {
          refund: {
            entity: {
              id: `rfnd_partial_${prefix}`,
              payment_id: razorpayPaymentId,
              amount: 5000,
              currency: "INR",
              status: "processed",
              created_at: refundProcessedAt,
            },
          },
        },
        "partial-refund"
      );

      await processRazorpayWebhookEvent(eventId);

      const [payment, updatedUser, refunds] = await Promise.all([
        prisma.payment.findUnique({ where: { razorpayPaymentId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.refund.count({
          where: {
            payment: {
              is: { razorpayPaymentId },
            },
          },
        }),
      ]);

      assert.equal(payment?.status, PaymentStatus.PARTIALLY_REFUNDED);
      assert.equal(payment?.amountRefunded, 5000);
      assert.equal(updatedUser?.plan, Plan.PRO);
      assert.equal(refunds, 1);
    });

    await t.test("does not double-count the same Razorpay refund ID", async () => {
      const eventId = await saveWebhook(
        "refund.processed",
        {
          refund: {
            entity: {
              id: `rfnd_partial_${prefix}`,
              payment_id: razorpayPaymentId,
              amount: 5000,
              currency: "INR",
              status: "processed",
              created_at: refundProcessedAt,
            },
          },
        },
        "partial-refund-duplicate"
      );

      await processRazorpayWebhookEvent(eventId);

      const payment = await prisma.payment.findUnique({
        where: { razorpayPaymentId },
      });
      assert.equal(payment?.amountRefunded, 5000);
      assert.equal(payment?.status, PaymentStatus.PARTIALLY_REFUNDED);
    });

    await t.test("revokes paid access only when the cumulative refund is full", async () => {
      const eventId = await saveWebhook(
        "refund.processed",
        {
          refund: {
            entity: {
              id: `rfnd_final_${prefix}`,
              payment_id: razorpayPaymentId,
              amount: 9900,
              currency: "INR",
              status: "processed",
              created_at: refundProcessedAt + 1,
            },
          },
        },
        "full-refund"
      );

      await processRazorpayWebhookEvent(eventId);

      const [payment, updatedUser, subscription] = await Promise.all([
        prisma.payment.findUnique({ where: { razorpayPaymentId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
      ]);

      assert.equal(payment?.status, PaymentStatus.REFUNDED);
      assert.equal(payment?.amountRefunded, 14900);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(updatedUser?.subscriptionStatus, SubscriptionStatus.REFUNDED);
      assert.equal(subscription?.status, SubscriptionStatus.REFUNDED);
    });

    await t.test("does not reactivate a fully refunded payment from a delayed charge event", async () => {
      const eventId = await saveWebhook(
        "subscription.charged",
        chargedPayload,
        "late-charged"
      );

      await processRazorpayWebhookEvent(eventId);

      const [payment, updatedUser, subscription] = await Promise.all([
        prisma.payment.findUnique({ where: { razorpayPaymentId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
      ]);

      assert.equal(payment?.status, PaymentStatus.REFUNDED);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(subscription?.status, SubscriptionStatus.REFUNDED);
    });
  } finally {
    if (webhookEventIds.length) {
      await prisma.razorpayWebhookEvent.deleteMany({
        where: { eventId: { in: webhookEventIds } },
      });
    }

    if (subscriptionId) {
      const payment = await prisma.payment.findFirst({
        where: { subscriptionId },
        select: { id: true },
      });
      if (payment) {
        await prisma.refund.deleteMany({
          where: { paymentId: payment.id },
        });
      }
      await prisma.payment.deleteMany({ where: { subscriptionId } });
      await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
    }

    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }

    await prisma.$disconnect();
  }
});
