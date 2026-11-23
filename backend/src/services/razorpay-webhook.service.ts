import {
    PaymentStatus,
    Plan,
    SubscriptionStatus,
    WebhookStatus,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";

import prisma from "../config/prisma";
import { processRefundProcessedEvent } from "./razorpay-refund.service";
import { parseSubscriptionChargedEvent, unwrapRazorpayWebhookPayload } from "../utils/razorpay-webhook-payload";

import {
    SUBSCRIPTION_PLANS,
    SUBSCRIPTION_GRACE_PERIOD_DAYS,
} from "../config/subscription-plans";

export const activateSubscription = async (
  razorpaySubscriptionId: string,
  razorpayPaymentId: string,
  amount: number,
  currency: string,
  paidAt: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date
) => {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { razorpaySubscriptionId },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.REFUNDED
    ) {
      throw new Error(
        "Cannot activate a cancelled, expired, or refunded subscription"
      );
    }

    const planConfig = SUBSCRIPTION_PLANS[subscription.plan];

    // Verify the payment amount against the selected plan.
    if (
      amount !== planConfig.price ||
      currency !== "INR"
    ) {
      throw new Error("Payment amount does not match subscription plan");
    }

    const existingPayment = await tx.payment.findUnique({
      where: { razorpayPaymentId },
    });

    if (existingPayment) {
      // A payment cannot belong to a different subscription or user.
      if (
        existingPayment.userId !== subscription.userId ||
        existingPayment.subscriptionId !== subscription.id
      ) {
        throw new Error(
          "Payment does not belong to this subscription"
        );
      }

      if (
        existingPayment.status === PaymentStatus.REFUNDED ||
        existingPayment.status === PaymentStatus.PARTIALLY_REFUNDED
      ) {
        // A delayed charged event must never undo an already-recorded refund.
        return { duplicate: true, refunded: true };
      }

      if (existingPayment.status !== PaymentStatus.CAPTURED) {
        await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: PaymentStatus.CAPTURED,
            amount,
            currency,
            paidAt,
            failureReason: null,
          },
        });
      }
    } else {
      await tx.payment.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          razorpayPaymentId,
          amount,
          currency,
          status: PaymentStatus.CAPTURED,
          paidAt,
        },
      });
    }

    // Update subscription and user entitlements atomically.
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart,
        currentPeriodEnd,
        gracePeriodEnd: null,
      },
    });

    await tx.user.update({
      where: { id: subscription.userId },
      data: {
        plan: subscription.plan,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currentPeriodEnd,
        gracePeriodEnd: null,
        storageLimit: planConfig.storageLimit,
      },
    });

    return { duplicate: false };
  });
};

export const processSubscriptionChargedEvent = async (
  payload: any
) => {
  const charge = parseSubscriptionChargedEvent(payload);

  return activateSubscription(
    charge.subscriptionId,
    charge.paymentId,
    charge.amount,
    charge.currency,
    charge.paidAt,
    charge.currentPeriodStart,
    charge.currentPeriodEnd
  );
};

export const handlePaymentFailure = async (
  razorpaySubscriptionId: string,
  razorpayPaymentId: string,
  amount: number,
  currency: string,
  failureReason: string
) => {
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { razorpaySubscriptionId },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const planConfig = SUBSCRIPTION_PLANS[subscription.plan];

    // Validate the failed payment details.
    if (
      !razorpayPaymentId ||
      !Number.isInteger(amount) ||
      amount !== planConfig.price ||
      currency !== "INR"
    ) {
      throw new Error("Invalid failed payment details");
    }

    const existingPayment = await tx.payment.findUnique({
      where: { razorpayPaymentId },
    });

    // Never overwrite a successfully captured payment.
    if (
      existingPayment?.status === PaymentStatus.CAPTURED ||
      existingPayment?.status === PaymentStatus.REFUNDED ||
      existingPayment?.status === PaymentStatus.PARTIALLY_REFUNDED
    ) {
      return { duplicate: true };
    }

    // Ensure the payment belongs to this subscription.
    if (
      existingPayment &&
      (
        existingPayment.userId !== subscription.userId ||
        existingPayment.subscriptionId !== subscription.id
      )
    ) {
      throw new Error("Payment does not belong to this subscription");
    }

    if (existingPayment) {
      await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: PaymentStatus.FAILED,
          amount,
          currency,
          failureReason,
        },
      });
    } else {
      await tx.payment.create({
        data: {
          userId: subscription.userId,
          subscriptionId: subscription.id,
          razorpayPaymentId,
          amount,
          currency,
          status: PaymentStatus.FAILED,
          failureReason,
        },
      });
    }

    // Do not change already cancelled or expired subscriptions.
    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.REFUNDED
    ) {
      // A full refund is terminal even while provider-side cancellation is
      // awaiting retry. Record the failed invoice, but do not reopen billing.
      return { duplicate: false };
    }

    // Preserve the existing grace period on repeated failures.
    const gracePeriodEnd =
      subscription.gracePeriodEnd ??
      new Date(
        Date.now() +
          SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
      );

    // Do not downgrade HALTED to PAST_DUE due to an older event.
    const nextStatus =
      subscription.status === SubscriptionStatus.HALTED
        ? SubscriptionStatus.HALTED
        : SubscriptionStatus.PAST_DUE;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: nextStatus,
        gracePeriodEnd,
      },
    });

    await tx.user.update({
      where: { id: subscription.userId },
      data: {
        subscriptionStatus: nextStatus,
        gracePeriodEnd,
      },
    });

    return { duplicate: false };
  });
};

export const processPaymentFailedEvent = async (
    payload: any
) => {
    const payment = payload?.payment?.entity;
    const subscriptionId =
      payment?.subscription_id ?? payload?.subscription?.entity?.id;

    if (
        !payment?.id ||
        !subscriptionId ||
        payment.status !== "failed" ||
        !Number.isInteger(payment.amount) ||
        typeof payment.currency !== "string"
    ) {
        throw new Error("Invalid payment.failed payload");
    }

    return handlePaymentFailure(
        subscriptionId,
        payment.id,
        payment.amount,
        payment.currency,
        payment.error_description || "Payment failed"
    );
};

type RazorpayWebhookDependencies = {
  cancelRefundedSubscription?: (subscriptionId: string) => Promise<unknown>;
};

export const processRazorpayWebhookEvent = async (
  eventId: string,
  dependencies: RazorpayWebhookDependencies = {}
) => {
  const webhookEvent = await prisma.razorpayWebhookEvent.findUnique({
    where: { eventId },
  });

  if (!webhookEvent) {
    throw new Error("Webhook event not found");
  }

  if (webhookEvent.status === WebhookStatus.PROCESSED) {
    return { duplicate: true };
  }

  // Allow recovery of events stuck in PROCESSING for over 10 minutes.
  const staleProcessingThreshold = new Date(
    Date.now() - 10 * 60 * 1000
  );

  // Atomically claim the event. Only one request can claim it.
  const claim = await prisma.razorpayWebhookEvent.updateMany({
    where: {
      eventId,
      OR: [
        {
          status: {
            in: [
              WebhookStatus.PENDING,
              WebhookStatus.FAILED,
            ],
          },
        },
        {
          status: WebhookStatus.PROCESSING,
          updatedAt: {
            lte: staleProcessingThreshold,
          },
        },
      ],
    },
    data: {
      status: WebhookStatus.PROCESSING,
      responseMessage: null,
    },
  });

  if (claim.count === 0) {
    const latestEvent = await prisma.razorpayWebhookEvent.findUnique({
      where: { eventId },
      select: { status: true },
    });

    if (latestEvent?.status === WebhookStatus.PROCESSED) {
      return { duplicate: true };
    }

    return { duplicate: true, inProgress: true };
  }

  try {
    // The database stores the complete signed Razorpay event envelope.
    // Normalize it once before dispatching to handlers that consume the
    // inner resource payload (subscription/payment entities).
    const eventPayload = unwrapRazorpayWebhookPayload(webhookEvent.payload);

    switch (webhookEvent.eventType) {
      case "subscription.charged":
        await processSubscriptionChargedEvent(eventPayload);
        break;

      case "subscription.activated":
        await processSubscriptionActivatedEvent(eventPayload);
        break;

      case "payment.failed":
        await processPaymentFailedEvent(eventPayload);
        break;

      case "refund.processed":
        await processRefundProcessedEvent(
          eventPayload,
          dependencies.cancelRefundedSubscription
        );
        break;

      case "subscription.cancelled":
        await processSubscriptionCancelledEvent(eventPayload);
        break;

      case "subscription.pending":
        await processSubscriptionPendingEvent(eventPayload, getWebhookOccurredAt(webhookEvent.payload));
        break;

      case "subscription.halted":
        await processSubscriptionHaltedEvent(eventPayload, getWebhookOccurredAt(webhookEvent.payload));
        break;

      case "subscription.resumed":
        await processSubscriptionResumedEvent(eventPayload);
        break;

      case "subscription.authenticated":
        await processSubscriptionAuthenticatedEvent(eventPayload);
        break;

      case "subscription.completed":
        await processSubscriptionCompletedEvent(eventPayload);
        break;

      case "subscription.updated":
        await processSubscriptionInformationalEvent(eventPayload, "updated");
        break;

      case "subscription.paused":
        await processSubscriptionInformationalEvent(eventPayload, "paused");
        break;

      default:
        console.log(
          `Webhook event not handled yet: ${webhookEvent.eventType}`
        );
    }

    await prisma.razorpayWebhookEvent.updateMany({
      where: {
        eventId,
        status: WebhookStatus.PROCESSING,
      },
      data: {
        status: WebhookStatus.PROCESSED,
        processedAt: new Date(),
        responseMessage: "Event processed successfully",
      },
    });

    return { duplicate: false };
  } catch (error) {
    await prisma.razorpayWebhookEvent.updateMany({
      where: {
        eventId,
        status: WebhookStatus.PROCESSING,
      },
      data: {
        status: WebhookStatus.FAILED,
        responseMessage:
          error instanceof Error
            ? error.message
            : "Unknown processing error",
      },
    });

    throw error;
  }
};


/**
 * Records the Razorpay subscription lifecycle transition to ACTIVE.
 *
 * This event alone does not prove that the plan amount was captured.
 * Paid plan/storage entitlements are therefore granted only by the
 * subscription.charged handler after payment amount and capture checks.
 */
export const processSubscriptionActivatedEvent = async (
  payload: any
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (
    !razorpaySubscription?.id ||
    razorpaySubscription.status !== "active"
  ) {
    throw new Error("Invalid subscription.activated payload");
  }

  const currentPeriodStart = Number.isFinite(razorpaySubscription.current_start)
    ? new Date(razorpaySubscription.current_start * 1000)
    : null;
  const currentPeriodEnd = Number.isFinite(razorpaySubscription.current_end)
    ? new Date(razorpaySubscription.current_end * 1000)
    : null;

  if (
    (currentPeriodStart && !Number.isFinite(currentPeriodStart.getTime())) ||
    (currentPeriodEnd && !Number.isFinite(currentPeriodEnd.getTime())) ||
    (currentPeriodStart &&
      currentPeriodEnd &&
      currentPeriodEnd <= currentPeriodStart)
  ) {
    throw new Error("Invalid subscription billing period");
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: {
        razorpaySubscriptionId: razorpaySubscription.id,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.PAST_DUE ||
      subscription.status === SubscriptionStatus.HALTED ||
      subscription.status === SubscriptionStatus.REFUNDED
    ) {
      return { ignored: true, awaitingCharge: true };
    }

    if (
      razorpaySubscription.plan_id &&
      razorpaySubscription.plan_id !== subscription.razorpayPlanId
    ) {
      throw new Error("Razorpay plan does not match local subscription");
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        ...(currentPeriodStart ? { currentPeriodStart } : {}),
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });

    await tx.user.update({
      where: { id: subscription.userId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    return {
      activated: true,
      awaitingCharge: true,
    };
  });
};


export const processSubscriptionCancelledEvent = async (
  payload: any
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (
    !razorpaySubscription?.id ||
    razorpaySubscription.status !== "cancelled"
  ) {
    throw new Error("Invalid subscription.cancelled payload");
  }

  const cancelledAt = Number.isFinite(razorpaySubscription.ended_at)
    ? new Date(razorpaySubscription.ended_at * 1000)
    : new Date();

  if (!Number.isFinite(cancelledAt.getTime())) {
    throw new Error("Invalid subscription cancellation timestamp");
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: {
        razorpaySubscriptionId: razorpaySubscription.id,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      return { duplicate: true };
    }

    // A cycle-end cancellation stops future renewals but does not remove
    // already-paid access before the current billing period expires.
    const preservePaidAccessUntilPeriodEnd =
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd > new Date();

    if (preservePaidAccessUntilPeriodEnd) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: true,
          gracePeriodEnd: null,
        },
      });

      // The subscription's cycle-end cancellation must not overwrite a
      // different plan entitlement if another subscription has since become
      // the user's current paid subscription.
      await tx.user.updateMany({
        where: {
          id: subscription.userId,
          plan: subscription.plan,
        },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: subscription.currentPeriodEnd,
          gracePeriodEnd: null,
        },
      });

      return { duplicate: false, cancellationScheduled: true };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt,
        endDate: cancelledAt,
        cancelAtPeriodEnd: false,
        gracePeriodEnd: null,
      },
    });

    const anotherPaidSubscription = await tx.subscription.findFirst({
      where: {
        userId: subscription.userId,
        id: { not: subscription.id },
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.HALTED,
          ],
        },
      },
    });

    if (!anotherPaidSubscription) {
      await tx.user.update({
        where: { id: subscription.userId },
        data: {
          plan: Plan.FREE,
          subscriptionStatus: SubscriptionStatus.CANCELLED,
          currentPeriodEnd: null,
          gracePeriodEnd: null,
          storageLimit: SUBSCRIPTION_PLANS.FREE.storageLimit,
        },
      });
    }

    return { duplicate: false };
  });
};


const getWebhookOccurredAt = (storedPayload: Prisma.JsonValue): Date | undefined => {
  if (
    typeof storedPayload !== "object" ||
    storedPayload === null ||
    Array.isArray(storedPayload)
  ) {
    return undefined;
  }

  const createdAt = (storedPayload as Prisma.JsonObject).created_at;
  return typeof createdAt === "number" && Number.isFinite(createdAt) && createdAt > 0
    ? new Date(createdAt * 1000)
    : undefined;
};

/**
 * Protect a newer successful charge from an older failure webhook delivered
 * out of order. Razorpay's subscription webhook envelope includes created_at.
 */
const hasCapturedPaymentAfterWebhook = async (
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  webhookOccurredAt?: Date
): Promise<boolean> => {
  if (!webhookOccurredAt) return false;

  const newerCapturedPayment = await tx.payment.findFirst({
    where: {
      subscriptionId,
      status: {
        in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED],
      },
      paidAt: { gt: webhookOccurredAt },
    },
    select: { id: true },
  });

  return Boolean(newerCapturedPayment);
};

export const processSubscriptionPendingEvent = async (
  payload: any,
  webhookOccurredAt?: Date
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (!razorpaySubscription?.id || razorpaySubscription.status !== "pending") {
    throw new Error("Invalid subscription.pending payload");
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: {
        razorpaySubscriptionId: razorpaySubscription.id,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.HALTED ||
      subscription.status === SubscriptionStatus.REFUNDED ||
      subscription.status === SubscriptionStatus.PAST_DUE
    ) {
      return { ignored: true };
    }

    // A failed renewal legitimately moves an ACTIVE subscription to PAST_DUE.
    // Ignore only a stale pending webhook that arrived after a newer captured
    // payment already restored the subscription.
    if (
      await hasCapturedPaymentAfterWebhook(
        tx,
        subscription.id,
        webhookOccurredAt
      )
    ) {
      return { ignored: true, stale: true };
    }

    const gracePeriodEnd =
      subscription.gracePeriodEnd ??
      new Date(
        Date.now() +
          SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
      );

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEnd,
      },
    });

    // Do not replace an unrelated plan if the user's current entitlement has
    // since moved to another subscription.
    await tx.user.updateMany({
      where: {
        id: subscription.userId,
        OR: [{ plan: subscription.plan }, { plan: Plan.FREE }],
      },
      data: {
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        gracePeriodEnd,
      },
    });

    return { ignored: false };
  });
};

export const processSubscriptionHaltedEvent = async (
  payload: any,
  webhookOccurredAt?: Date
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (!razorpaySubscription?.id || razorpaySubscription.status !== "halted") {
    throw new Error("Invalid subscription.halted payload");
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: {
        razorpaySubscriptionId: razorpaySubscription.id,
      },
    });

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.REFUNDED ||
      subscription.status === SubscriptionStatus.HALTED
    ) {
      return { ignored: true };
    }

    if (
      await hasCapturedPaymentAfterWebhook(
        tx,
        subscription.id,
        webhookOccurredAt
      )
    ) {
      return { ignored: true, stale: true };
    }

    const gracePeriodEnd =
      subscription.gracePeriodEnd ??
      new Date(
        Date.now() +
          SUBSCRIPTION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
      );

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.HALTED,
        gracePeriodEnd,
      },
    });

    await tx.user.updateMany({
      where: {
        id: subscription.userId,
        OR: [{ plan: subscription.plan }, { plan: Plan.FREE }],
      },
      data: {
        subscriptionStatus: SubscriptionStatus.HALTED,
        gracePeriodEnd,
      },
    });

    return { ignored: false };
  });
};

export const processSubscriptionResumedEvent = async (
  payload: any
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (
    !razorpaySubscription?.id ||
    razorpaySubscription.status !== "active"
  ) {
    throw new Error("Invalid subscription.resumed payload");
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      razorpaySubscriptionId: razorpaySubscription.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  if (
    subscription.status === SubscriptionStatus.CANCELLED ||
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.REFUNDED
  ) {
    return { ignored: true };
  }

  // Do not restore paid access here.
  // Wait for subscription.charged to confirm successful payment.
  return {
    resumed: true,
    awaitingPaymentConfirmation: true,
  };
};

/**
 * Authentication means the customer completed the first subscription
 * authentication payment. It is not, by itself, proof that the plan invoice
 * was captured; entitlement is still granted only by subscription.charged.
 */
export const processSubscriptionAuthenticatedEvent = async (payload: any) => {
  const entity = payload?.subscription?.entity;
  if (!entity?.id || entity.status !== "authenticated") {
    throw new Error("Invalid subscription.authenticated payload");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: entity.id },
    select: { status: true },
  });

  if (!subscription) throw new Error("Subscription not found");

  return {
    authenticated: true,
    awaitingCharge: true,
    entitlementGranted: false,
  };
};

/**
 * Razorpay emits completed when all invoices have been generated. Preserve
 * the final paid period, then let the expiry scheduler downgrade the account.
 */
export const processSubscriptionCompletedEvent = async (payload: any) => {
  const entity = payload?.subscription?.entity;
  if (!entity?.id || entity.status !== "completed") {
    throw new Error("Invalid subscription.completed payload");
  }

  const providerPeriodStart = Number.isFinite(entity.current_start)
    ? new Date(entity.current_start * 1000)
    : null;
  const providerPeriodEnd = Number.isFinite(entity.current_end)
    ? new Date(entity.current_end * 1000)
    : null;
  if (
    (providerPeriodStart && !Number.isFinite(providerPeriodStart.getTime())) ||
    (providerPeriodEnd && !Number.isFinite(providerPeriodEnd.getTime())) ||
    (providerPeriodStart &&
      providerPeriodEnd &&
      providerPeriodEnd <= providerPeriodStart)
  ) {
    throw new Error("Invalid completed subscription period");
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { razorpaySubscriptionId: entity.id },
    });
    if (!subscription) throw new Error("Subscription not found");

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED ||
      subscription.status === SubscriptionStatus.REFUNDED
    ) {
      return { ignored: true };
    }

    const periodStart = providerPeriodStart ?? subscription.currentPeriodStart;
    const periodEnd = providerPeriodEnd ?? subscription.currentPeriodEnd;
    const hasPaidTimeRemaining = Boolean(periodEnd && periodEnd > new Date());

    // "completed" describes the provider subscription lifecycle, not proof
    // that CloudBox received a successful charge. Preserve an existing
    // entitlement only when a captured (or partially refunded) invoice is
    // already recorded locally. Never grant a plan from this event alone.
    const user = await tx.user.findUnique({
      where: { id: subscription.userId },
      select: { plan: true },
    });
    // Without known period boundaries, there is no safe way to associate a
    // historical payment with the final completed billing cycle.
    const paidPayment = periodStart && periodEnd
      ? await tx.payment.findFirst({
          where: {
            subscriptionId: subscription.id,
            status: {
              in: [
                PaymentStatus.CAPTURED,
                PaymentStatus.PARTIALLY_REFUNDED,
              ],
            },
            amount: SUBSCRIPTION_PLANS[subscription.plan].price,
            // A payment from an earlier billing cycle cannot justify access
            // through the final period of a completed subscription.
            paidAt: { gte: periodStart, lte: periodEnd },
          },
          select: { id: true },
        })
      : null;

    const hasRecordedEntitlement =
      user?.plan === subscription.plan && Boolean(paidPayment);

    if (hasPaidTimeRemaining && hasRecordedEntitlement) {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: true,
          gracePeriodEnd: null,
        },
      });
      await tx.user.update({
        where: { id: subscription.userId },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
          gracePeriodEnd: null,
        },
      });
      return { completed: true, accessUntil: periodEnd, entitlementPreserved: true };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
        endDate: new Date(),
        cancelAtPeriodEnd: false,
        gracePeriodEnd: null,
      },
    });

    const another = await tx.subscription.findFirst({
      where: {
        userId: subscription.userId,
        id: { not: subscription.id },
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.HALTED,
          ],
        },
      },
    });

    if (!another && user?.plan === subscription.plan) {
      await tx.user.update({
        where: { id: subscription.userId },
        data: {
          plan: Plan.FREE,
          subscriptionStatus: SubscriptionStatus.CANCELLED,
          currentPeriodEnd: null,
          gracePeriodEnd: null,
          storageLimit: SUBSCRIPTION_PLANS.FREE.storageLimit,
        },
      });
    }

    return {
      completed: true,
      accessUntil: null,
      entitlementPreserved: false,
    };
  });
};

export const processSubscriptionInformationalEvent = async (
  payload: any,
  event: "updated" | "paused"
) => {
  const entity = payload?.subscription?.entity;
  if (!entity?.id) {
    throw new Error(`Invalid subscription.${event} payload`);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: entity.id },
    select: { id: true },
  });
  if (!subscription) throw new Error("Subscription not found");

  return { acknowledged: true, entitlementChanged: false };
};
