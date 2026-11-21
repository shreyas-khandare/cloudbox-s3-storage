import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import test from "node:test";
import type { Prisma } from "@prisma/client";

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
  process.env[key] = value;
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

const envelope = (
  event: string,
  payload: Record<string, unknown>
): Prisma.InputJsonObject => ({
  entity: "event",
  event,
  payload: payload as unknown as Prisma.InputJsonObject,
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

    await t.test("the database rejects simultaneous open subscriptions and compensates the losing provider subscription", async () => {
      const raceUser = await prisma.user.create({
        data: {
          name: "CloudBox Concurrent Checkout Test",
          email: `phase1-race-${prefix}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });

      let providerCreateCalls = 0;
      const cancelledProviderIds: string[] = [];
      let releaseProviderCreates: () => void = () => undefined;
      const bothProviderCreatesStarted = new Promise<void>((resolve) => {
        releaseProviderCreates = resolve;
      });

      const gateway = {
        create: async () => {
          providerCreateCalls += 1;
          const attempt = providerCreateCalls;
          if (attempt === 2) releaseProviderCreates();
          await bothProviderCreatesStarted;
          return {
            id: `sub_phase1_race_${prefix}_${attempt}`,
            short_url: `https://rzp.io/i/race-${prefix}-${attempt}`,
          };
        },
        cancel: async (id: string) => {
          cancelledProviderIds.push(id);
        },
      };

      try {
        const results = await Promise.allSettled([
          createSubscription(raceUser.id, Plan.PRO, gateway),
          createSubscription(raceUser.id, Plan.BUSINESS, gateway),
        ]);

        assert.equal(providerCreateCalls, 2);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        assert.equal(results.filter((result) => result.status === "rejected").length, 1);
        assert.equal(cancelledProviderIds.length, 1);

        const openSubscriptions = await prisma.subscription.count({
          where: {
            userId: raceUser.id,
            status: {
              in: [
                SubscriptionStatus.CREATED,
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAST_DUE,
                SubscriptionStatus.HALTED,
                SubscriptionStatus.REFUNDED,
              ],
            },
          },
        });
        assert.equal(openSubscriptions, 1);
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: raceUser.id } });
        await prisma.user.delete({ where: { id: raceUser.id } });
      }
    });

    await t.test("moves a new subscription through pending, halted, and resumed without granting paid access", async () => {
      const pendingEventId = await saveWebhook(
        "subscription.pending",
        {
          subscription: {
            entity: {
              id: razorpaySubscriptionId,
              status: "pending",
            },
          },
        },
        "pending"
      );
      await processRazorpayWebhookEvent(pendingEventId);

      const pending = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId },
      });      const pendingUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      assert.equal(pending?.status, SubscriptionStatus.PAST_DUE);
      assert.ok(pending?.gracePeriodEnd && pending.gracePeriodEnd > new Date());
      assert.equal(pendingUser?.plan, Plan.FREE);
      assert.equal(pendingUser?.subscriptionStatus, SubscriptionStatus.PAST_DUE);

      const haltedEventId = await saveWebhook(
        "subscription.halted",
        {
          subscription: {
            entity: {
              id: razorpaySubscriptionId,
              status: "halted",
            },
          },
        },
        "halted"
      );
      await processRazorpayWebhookEvent(haltedEventId);

      const halted = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId },
      });
      assert.equal(halted?.status, SubscriptionStatus.HALTED);
      assert.ok(halted?.gracePeriodEnd && halted.gracePeriodEnd > new Date());

      const resumedEventId = await saveWebhook(
        "subscription.resumed",
        {
          subscription: {
            entity: {
              id: razorpaySubscriptionId,
              status: "active",
            },
          },
        },
        "resumed"
      );
      await processRazorpayWebhookEvent(resumedEventId);

      const resumed = await prisma.subscription.findUnique({
        where: { razorpaySubscriptionId },
      });
      const resumedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      assert.equal(resumed?.status, SubscriptionStatus.HALTED);
      assert.equal(resumedUser?.plan, Plan.FREE);
    });

    await t.test("subscription.authenticated does not grant paid access", async () => {
      const eventId = await saveWebhook(
        "subscription.authenticated",
        {
          subscription: {
            entity: {
              id: razorpaySubscriptionId,
              status: "authenticated",
            },
          },
        },
        "authenticated"
      );

      await processRazorpayWebhookEvent(eventId);

      const [subscription, updatedUser] = await Promise.all([
        prisma.subscription.findUnique({ where: { razorpaySubscriptionId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
      ]);

      // The preceding pending/halted/resumed events must not be promoted by
      // authentication alone. Only a captured subscription.charged event
      // grants paid plan/storage entitlements.
      assert.equal(subscription?.status, SubscriptionStatus.HALTED);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(updatedUser?.subscriptionStatus, SubscriptionStatus.HALTED);
    });

    await t.test("subscription.completed cannot grant access without a recorded captured payment", async () => {
      const completedUser = await prisma.user.create({
        data: {
          name: "CloudBox Completed Without Payment",
          email: `completed-no-payment-${prefix}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });
      const completedSubscriptionId = `sub_completed_no_payment_${prefix}`;
      const completedEventId = `evt_completed_no_payment_${prefix}`;

      try {
        await prisma.subscription.create({
          data: {
            userId: completedUser.id,
            plan: Plan.PRO,
            razorpayPlanId: "plan_test_pro",
            razorpaySubscriptionId: completedSubscriptionId,
            status: SubscriptionStatus.CREATED,
          },
        });
        await prisma.razorpayWebhookEvent.create({
          data: {
            eventId: completedEventId,
            eventType: "subscription.completed",
            payload: envelope("subscription.completed", {
              subscription: {
                entity: {
                  id: completedSubscriptionId,
                  status: "completed",
                  current_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                },
              },
            }),
            razorpaySubscriptionId: completedSubscriptionId,
            status: WebhookStatus.PENDING,
          },
        });

        await processRazorpayWebhookEvent(completedEventId);

        const [completedSubscription, completedAccount] = await Promise.all([
          prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: completedSubscriptionId },
          }),
          prisma.user.findUnique({ where: { id: completedUser.id } }),
        ]);

        assert.equal(completedSubscription?.status, SubscriptionStatus.CANCELLED);
        assert.equal(completedAccount?.plan, Plan.FREE);
        assert.equal(completedAccount?.subscriptionStatus, SubscriptionStatus.FREE);
      } finally {
        await prisma.razorpayWebhookEvent.deleteMany({
          where: { eventId: completedEventId },
        });
        await prisma.subscription.deleteMany({
          where: { razorpaySubscriptionId: completedSubscriptionId },
        });
        await prisma.user.delete({ where: { id: completedUser.id } });
      }
    });

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

    await t.test("a new failed renewal moves an active subscription into its grace period", async () => {
      const eventId = await saveWebhook(
        "payment.failed",
        {
          payment: {
            entity: {
              id: `pay_failed_${prefix}`,
              subscription_id: razorpaySubscriptionId,
              amount: 14900,
              currency: "INR",
              status: "failed",
              error_description: "Insufficient funds",
            },
          },
        },
        "new-failed-payment"
      );

      await processRazorpayWebhookEvent(eventId);

      const [subscription, updatedUser, failedPayment] = await Promise.all([
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.payment.findUnique({
          where: { razorpayPaymentId: `pay_failed_${prefix}` },
        }),
      ]);

      assert.equal(subscription?.status, SubscriptionStatus.PAST_DUE);
      assert.ok(subscription?.gracePeriodEnd && subscription.gracePeriodEnd > new Date());
      assert.equal(updatedUser?.plan, Plan.PRO);
      assert.equal(updatedUser?.subscriptionStatus, SubscriptionStatus.PAST_DUE);
      assert.equal(failedPayment?.status, PaymentStatus.FAILED);
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
              currency: "INR",              status: "processed",
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

      let providerCancellationAttempts = 0;
      await assert.rejects(
        processRazorpayWebhookEvent(eventId, {
          cancelRefundedSubscription: async (providerSubscriptionId) => {
            providerCancellationAttempts += 1;
            assert.equal(providerSubscriptionId, razorpaySubscriptionId);
            throw new Error("Razorpay temporarily unavailable");
          },
        }),
        /Razorpay temporarily unavailable/
      );

      const failedCancellationEvent = await prisma.razorpayWebhookEvent.findUnique({
        where: { eventId },
        select: { status: true },
      });
      assert.equal(failedCancellationEvent?.status, WebhookStatus.FAILED);

      const delayedFailureEvent = await saveWebhook(
        "payment.failed",
        {
          payment: {
            entity: {
              id: `pay_failed_after_refund_${prefix}`,
              subscription_id: razorpaySubscriptionId,
              amount: 14900,
              currency: "INR",
              status: "failed",
              error_description: "Delayed renewal failure after refund",
            },
          },
        },
        "failed-after-full-refund"
      );
      await processRazorpayWebhookEvent(delayedFailureEvent);

      const [refundedSubscription, refundedUser] = await Promise.all([
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
        prisma.user.findUnique({ where: { id: user.id } }),
      ]);
      assert.equal(refundedSubscription?.status, SubscriptionStatus.REFUNDED);
      assert.equal(refundedUser?.plan, Plan.FREE);

      // A webhook retry must not count the refund twice, but must retry the
      // provider cancellation that failed after the local refund committed.
      await processRazorpayWebhookEvent(eventId, {
        cancelRefundedSubscription: async (providerSubscriptionId) => {
          providerCancellationAttempts += 1;
          assert.equal(providerSubscriptionId, razorpaySubscriptionId);
        },
      });
      assert.equal(providerCancellationAttempts, 2);

      const [payment, updatedUser, subscription, processedEvent] = await Promise.all([
        prisma.payment.findUnique({ where: { razorpayPaymentId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
        prisma.razorpayWebhookEvent.findUnique({
          where: { eventId },
          select: { status: true },
        }),
      ]);

      assert.equal(processedEvent?.status, WebhookStatus.PROCESSED);
      assert.equal(payment?.status, PaymentStatus.REFUNDED);
      assert.equal(payment?.amountRefunded, 14900);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(updatedUser?.subscriptionStatus, SubscriptionStatus.CANCELLED);
      assert.equal(subscription?.status, SubscriptionStatus.CANCELLED);
    });

    await t.test("does not reactivate a fully refunded payment from a delayed charge event", async () => {
      const eventId = await saveWebhook(
        "subscription.charged",
        chargedPayload,
        "late-charged"
      );

      await assert.rejects(
        processRazorpayWebhookEvent(eventId),
        /cancelled, expired, or refunded subscription/
      );

      const [payment, updatedUser, subscription] = await Promise.all([
        prisma.payment.findUnique({ where: { razorpayPaymentId } }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
      ]);

      assert.equal(payment?.status, PaymentStatus.REFUNDED);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(subscription?.status, SubscriptionStatus.CANCELLED);
    });
    await t.test("rejects a new captured payment against a fully refunded subscription", async () => {
      const newPaymentId = `pay_after_refund_${prefix}`;
      const eventId = await saveWebhook(
        "subscription.charged",
        {
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
              id: newPaymentId,
              amount: 14900,
              currency: "INR",
              status: "captured",
              created_at: refundProcessedAt + 2,
            },
          },
        },
        "new-charge-after-refund"
      );

      await assert.rejects(
        processRazorpayWebhookEvent(eventId),
        /cancelled, expired, or refunded subscription/
      );

      const [newPayment, subscription, updatedUser, webhook] = await Promise.all([
        prisma.payment.findUnique({
          where: { razorpayPaymentId: newPaymentId },
        }),
        prisma.subscription.findUnique({
          where: { razorpaySubscriptionId },
        }),
        prisma.user.findUnique({ where: { id: user.id } }),
        prisma.razorpayWebhookEvent.findUnique({ where: { eventId } }),
      ]);

      assert.equal(newPayment, null);
      assert.equal(subscription?.status, SubscriptionStatus.CANCELLED);
      assert.equal(updatedUser?.plan, Plan.FREE);
      assert.equal(webhook?.status, WebhookStatus.FAILED);
    });

    await t.test("allows a fresh checkout after the refunded provider subscription is cancelled", async () => {
      const newSubscriptionId = `sub_after_refund_${prefix}`;
      const result = await createSubscription(user.id, Plan.BUSINESS, {
        create: async () => ({
          id: newSubscriptionId,
          short_url: `https://rzp.io/i/after-refund-${prefix}`,
        }),
        cancel: async () => undefined,
      });

      assert.equal(result.subscription.status, SubscriptionStatus.CREATED);
      assert.equal(result.subscription.razorpaySubscriptionId, newSubscriptionId);
    });

    await t.test("preserves paid access when Razorpay confirms a scheduled cycle-end cancellation", async () => {
      const scheduledUser = await prisma.user.create({
        data: {
          name: "CloudBox Scheduled Cancellation Test",
          email: `scheduled-cancel-${prefix}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });
      const newSubscriptionId = `sub_scheduled_cancel_${prefix}`;
      const scheduledEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      try {
      const created = await createSubscription(scheduledUser.id, Plan.BUSINESS, {
        create: async () => ({
          id: newSubscriptionId,
          short_url: `https://rzp.io/i/scheduled-cancel-${prefix}`,
        }),
        cancel: async () => undefined,
      });

      await prisma.subscription.update({
        where: { id: created.subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: true,
          currentPeriodStart: new Date(),
          currentPeriodEnd: scheduledEnd,
        },
      });
      await prisma.user.update({
        where: { id: scheduledUser.id },
        data: {
          plan: Plan.BUSINESS,
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: scheduledEnd,
        },
      });

      const eventId = `evt_scheduled_cancel_${prefix}`;
      webhookEventIds.push(eventId);
      await prisma.razorpayWebhookEvent.create({
        data: {
          eventId,
          eventType: "subscription.cancelled",
          razorpaySubscriptionId: newSubscriptionId,
          payload: envelope("subscription.cancelled", {
            subscription: {
              entity: {
                id: newSubscriptionId,
                status: "cancelled",
                ended_at: Math.floor(Date.now() / 1000),
              },
            },
          }),
          status: WebhookStatus.PENDING,
        },
      });

      await processRazorpayWebhookEvent(eventId);

      const [subscription, updatedUser] = await Promise.all([
        prisma.subscription.findUnique({ where: { id: created.subscription.id } }),
        prisma.user.findUnique({ where: { id: scheduledUser.id } }),
      ]);

      assert.equal(subscription?.status, SubscriptionStatus.ACTIVE);
      assert.equal(subscription?.cancelAtPeriodEnd, true);
      assert.equal(updatedUser?.plan, Plan.BUSINESS);
      assert.equal(updatedUser?.subscriptionStatus, SubscriptionStatus.ACTIVE);
      assert.equal(updatedUser?.currentPeriodEnd?.getTime(), scheduledEnd.getTime());
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: scheduledUser.id } });
        await prisma.user.delete({ where: { id: scheduledUser.id } });
      }
    });

    await t.test("expires a refunded subscription after end-of-period cancellation", async () => {
      const { expireSubscriptions } = await import("./subscription-expiry.service");
      const expiryUser = await prisma.user.create({
        data: {
          name: "CloudBox Refunded Expiry Test",
          email: `refunded-expiry-${prefix}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });
      const expiredRefundedSubscriptionId = `sub_refunded_expiry_${prefix}`;

      try {
        await prisma.subscription.create({
          data: {
            userId: expiryUser.id,
            plan: Plan.PRO,
            razorpayPlanId: "plan_test_pro",
            razorpaySubscriptionId: expiredRefundedSubscriptionId,
            status: SubscriptionStatus.REFUNDED,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: new Date(Date.now() - 1000),
          },
        });

        const processed = await expireSubscriptions({ userId: expiryUser.id });
        assert.equal(processed, 1);

        const [subscription, updatedUser] = await Promise.all([
          prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: expiredRefundedSubscriptionId },
          }),
          prisma.user.findUnique({ where: { id: expiryUser.id } }),
        ]);

        assert.equal(subscription?.status, SubscriptionStatus.CANCELLED);
        assert.equal(updatedUser?.plan, Plan.FREE);
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: expiryUser.id } });
        await prisma.user.delete({ where: { id: expiryUser.id } });
      }
    });

    await t.test("expires HALTED subscriptions when the grace period ends", async () => {
      const haltedUser = await prisma.user.create({
        data: {
          name: "CloudBox HALTED Expiry Test",
          email: `phase1-halted-${prefix}@example.test`,
          emailVerified: true,
        },
        select: { id: true },
      });
      const haltedSubscriptionId = `sub_phase1_halted_${prefix}`;

      try {
        await prisma.subscription.create({          data: {
            userId: haltedUser.id,
            plan: Plan.BUSINESS,
            razorpayPlanId: "plan_test_business",
            razorpaySubscriptionId: haltedSubscriptionId,
            status: SubscriptionStatus.HALTED,
            gracePeriodEnd: new Date(Date.now() - 1000),
          },
        });
        await prisma.user.update({
          where: { id: haltedUser.id },
          data: {
            plan: Plan.BUSINESS,
            subscriptionStatus: SubscriptionStatus.HALTED,
            storageLimit: 1024n * 1024n * 1024n * 1024n,
            gracePeriodEnd: new Date(Date.now() - 1000),
          },
        });

        const { expireSubscriptions } = await import("./subscription-expiry.service");
        const processed = await expireSubscriptions({ userId: haltedUser.id });
        assert.equal(processed, 1);

        const [subscription, updatedUser] = await Promise.all([
          prisma.subscription.findUnique({
            where: { razorpaySubscriptionId: haltedSubscriptionId },
          }),
          prisma.user.findUnique({ where: { id: haltedUser.id } }),
        ]);

        assert.equal(subscription?.status, SubscriptionStatus.EXPIRED);
        assert.equal(updatedUser?.plan, Plan.FREE);
      } finally {
        await prisma.subscription.deleteMany({ where: { userId: haltedUser.id } });
        await prisma.user.delete({ where: { id: haltedUser.id } });
      }
    });
  } finally {
    if (webhookEventIds.length) {
      await prisma.razorpayWebhookEvent.deleteMany({
        where: { eventId: { in: webhookEventIds } },
      });
    }

    if (userId) {
      const subscriptions = await prisma.subscription.findMany({
        where: { userId },
        select: { id: true },
      });
      const subscriptionIds = subscriptions.map((subscription) => subscription.id);

      if (subscriptionIds.length) {
        const payments = await prisma.payment.findMany({
          where: { subscriptionId: { in: subscriptionIds } },
          select: { id: true },
        });
        const paymentIds = payments.map((payment) => payment.id);

        if (paymentIds.length) {
          await prisma.refund.deleteMany({
            where: { paymentId: { in: paymentIds } },
          });
        }

        await prisma.payment.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await prisma.subscription.deleteMany({
          where: { id: { in: subscriptionIds } },
        });
      }

      await prisma.user.delete({ where: { id: userId } });
    }

    await prisma.$disconnect();
  }
});