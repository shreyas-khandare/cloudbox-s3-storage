import {
    PaymentStatus,
    Plan,
    SubscriptionStatus,
    WebhookStatus,
} from "@prisma/client";

import prisma from "../config/prisma";

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
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new Error(
        "Cannot activate a cancelled or expired subscription"
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
  const subscription = payload?.subscription?.entity;
  const payment = payload?.payment?.entity;

  if (
    !subscription?.id ||
    !payment?.id ||
    payment.subscription_id !== subscription.id ||
    payment.status !== "captured" ||
    !Number.isInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.currency !== "INR" ||
    !Number.isFinite(payment.created_at) ||
    !Number.isFinite(subscription.current_start) ||
    !Number.isFinite(subscription.current_end)
  ) {
    throw new Error("Invalid subscription.charged payload");
  }

  const currentPeriodStart = new Date(
    subscription.current_start * 1000
  );

  const currentPeriodEnd = new Date(
    subscription.current_end * 1000
  );

  const paidAt = new Date(payment.created_at * 1000);

  if (
    !Number.isFinite(currentPeriodStart.getTime()) ||
    !Number.isFinite(currentPeriodEnd.getTime()) ||
    !Number.isFinite(paidAt.getTime()) ||
    currentPeriodEnd <= currentPeriodStart
  ) {
    throw new Error("Invalid subscription billing period");
  }

  return activateSubscription(
    subscription.id,
    payment.id,
    payment.amount,
    payment.currency,
    paidAt,
    currentPeriodStart,
    currentPeriodEnd
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
    if (existingPayment?.status === PaymentStatus.CAPTURED) {
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
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
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

    if (
        !payment?.id ||
        !payment?.subscription_id ||
        payment.status !== "failed" ||
        !Number.isInteger(payment.amount) ||
        typeof payment.currency !== "string"
    ) {
        throw new Error("Invalid payment.failed payload");
    }

    return handlePaymentFailure(
        payment.subscription_id,
        payment.id,
        payment.amount,
        payment.currency,
        payment.error_description || "Payment failed"
    );
};

export const processRazorpayWebhookEvent = async (
  eventId: string
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
    switch (webhookEvent.eventType) {
      case "subscription.charged":
        await processSubscriptionChargedEvent(webhookEvent.payload);
        break;

      case "payment.failed":
        await processPaymentFailedEvent(webhookEvent.payload);
        break;

      case "subscription.cancelled":
        await processSubscriptionCancelledEvent(webhookEvent.payload);
        break;

      case "subscription.pending":
        await processSubscriptionPendingEvent(webhookEvent.payload);
        break;

      case "subscription.halted":
        await processSubscriptionHaltedEvent(webhookEvent.payload);
        break;

      case "subscription.resumed":
        await processSubscriptionResumedEvent(webhookEvent.payload);
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


export const processSubscriptionPendingEvent = async (
  payload: any
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (!razorpaySubscription?.id) {
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
      subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.HALTED
    ) {
      return { ignored: true };
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

    await tx.user.update({
      where: { id: subscription.userId },
      data: {
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        gracePeriodEnd,
      },
    });

    return { ignored: false };
  });
};

export const processSubscriptionHaltedEvent = async (
  payload: any
) => {
  const razorpaySubscription = payload?.subscription?.entity;

  if (!razorpaySubscription?.id) {
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
      subscription.status === SubscriptionStatus.ACTIVE
    ) {
      return { ignored: true };
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

    await tx.user.update({
      where: { id: subscription.userId },
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
    subscription.status === SubscriptionStatus.EXPIRED
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
