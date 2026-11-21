import {
  PaymentStatus,
  Plan,
  SubscriptionStatus,
} from "@prisma/client";

import prisma from "../config/prisma";
import { ensureRazorpaySubscriptionCancelled } from "./razorpay.service";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";
import { unwrapRazorpayWebhookPayload } from "../utils/razorpay-webhook-payload";

type ProcessedRefund = {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: number;
};

/**
 * Apply a final refund exactly once. Only refund.processed is used, so
 * pending refunds never revoke paid access.
 */
export const processRefundProcessedEvent = async (
  payload: unknown,
  cancelProviderSubscription: (subscriptionId: string) => Promise<unknown> =
    ensureRazorpaySubscriptionCancelled
) => {
  const eventPayload = unwrapRazorpayWebhookPayload(payload);
  const refund = eventPayload?.refund?.entity as ProcessedRefund | undefined;

  if (
    !refund ||
    typeof refund.id !== "string" ||
    !refund.id ||
    typeof refund.payment_id !== "string" ||
    !refund.payment_id ||
    !Number.isInteger(refund.amount) ||
    refund.amount <= 0 ||
    refund.currency !== "INR" ||
    refund.status !== "processed" ||
    !Number.isFinite(refund.created_at)
  ) {
    throw new Error("Invalid refund.processed payload");
  }

  const processedAt = new Date(refund.created_at * 1000);
  if (!Number.isFinite(processedAt.getTime())) {
    throw new Error("Invalid refund processed timestamp");
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { razorpayPaymentId: refund.payment_id },
      include: {
        subscription: {
          select: {
            id: true,
            razorpaySubscriptionId: true,
            userId: true,
            plan: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            gracePeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    });

    if (!payment) {
      throw new Error("Refund references an unknown CloudBox payment");
    }

    if (refund.currency !== payment.currency) {
      throw new Error("Refund currency does not match the captured payment");
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      // Any further refund against an already fully refunded payment is invalid.
      throw new Error("Payment has already been fully refunded");
    }

    const isRefundablePayment =
      payment.status === PaymentStatus.CAPTURED ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED;

    if (!isRefundablePayment) {
      throw new Error("Refund does not match a captured INR payment");
    }

    // The unique Razorpay refund ID protects against duplicate business
    // operations even if Razorpay retries with a different webhook event ID.
    const inserted = await tx.refund.createMany({
      data: {
        paymentId: payment.id,
        razorpayRefundId: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        processedAt,
      },
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      const existingRefund = await tx.refund.findUnique({
        where: { razorpayRefundId: refund.id },
        select: {
          paymentId: true,
          amount: true,
          currency: true,
          processedAt: true,
        },
      });

      if (
        !existingRefund ||
        existingRefund.paymentId !== payment.id ||
        existingRefund.amount !== refund.amount ||
        existingRefund.currency !== refund.currency
      ) {
        throw new Error("Razorpay refund ID was previously used with different refund details");
      }

      const latestPayment = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true, amountRefunded: true },
      });
      return {
        duplicate: true,
        paymentStatus: latestPayment?.status ?? payment.status,
        amountRefunded: latestPayment?.amountRefunded ?? payment.amountRefunded,
        shouldCancelProviderSubscription:
          latestPayment?.status === PaymentStatus.REFUNDED &&
          payment.subscription.status === SubscriptionStatus.REFUNDED,
        razorpaySubscriptionId: payment.subscription.razorpaySubscriptionId,
      };
    }

    const applied = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: {
          in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_REFUNDED],
        },
        amountRefunded: {
          lte: payment.amount - refund.amount,
        },
      },
      data: {
        amountRefunded: { increment: refund.amount },
      },
    });

    if (applied.count !== 1) {
      throw new Error("Refund amount exceeds the remaining captured payment amount");
    }

    const updatedPayment = await tx.payment.findUnique({
      where: { id: payment.id },
      select: {
        id: true,
        amount: true,
        amountRefunded: true,
      },
    });

    if (!updatedPayment || updatedPayment.amountRefunded > updatedPayment.amount) {
      throw new Error("Refund total exceeds the captured payment amount");
    }

    const isFullyRefunded =
      updatedPayment.amountRefunded === updatedPayment.amount;

    const paymentStatus = isFullyRefunded
      ? PaymentStatus.REFUNDED
      : PaymentStatus.PARTIALLY_REFUNDED;

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: paymentStatus },
    });

    let entitlementRevoked = false;

    if (isFullyRefunded) {
      const subscription = payment.subscription;
      const paidAt = payment.paidAt?.getTime() ?? null;
      const periodStart = subscription.currentPeriodStart?.getTime() ?? null;
      const periodEnd = subscription.currentPeriodEnd?.getTime() ?? null;

      // A late refund for an older billing cycle must not remove access that
      // has already been renewed by a newer successful charge.
      const isCurrentBillingCyclePayment =
        paidAt === null ||
        periodStart === null ||
        (
          paidAt >= periodStart - 24 * 60 * 60 * 1000 &&
          (periodEnd === null || paidAt < periodEnd)
        );

      if (
        isCurrentBillingCyclePayment &&
        subscription.status !== SubscriptionStatus.CANCELLED &&
        subscription.status !== SubscriptionStatus.EXPIRED
      ) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.REFUNDED,
            gracePeriodEnd: null,
          },
        });

        const anotherEntitledSubscription = await tx.subscription.findFirst({
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
          select: {
            plan: true,
            status: true,
            currentPeriodEnd: true,
            gracePeriodEnd: true,
          },
        });

        if (anotherEntitledSubscription) {
          await tx.user.update({
            where: { id: subscription.userId },
            data: {
              plan: anotherEntitledSubscription.plan,
              subscriptionStatus: anotherEntitledSubscription.status,
              currentPeriodEnd: anotherEntitledSubscription.currentPeriodEnd,
              gracePeriodEnd: anotherEntitledSubscription.gracePeriodEnd,
              storageLimit:
                SUBSCRIPTION_PLANS[anotherEntitledSubscription.plan].storageLimit,
            },
          });
        } else {
          await tx.user.update({
            where: { id: subscription.userId },
            data: {
              plan: Plan.FREE,
              subscriptionStatus: SubscriptionStatus.REFUNDED,
              currentPeriodEnd: subscription.currentPeriodEnd,
              gracePeriodEnd: null,
              storageLimit: SUBSCRIPTION_PLANS.FREE.storageLimit,
            },
          });
        }

        entitlementRevoked = !anotherEntitledSubscription;
      }
    }

    return {
      duplicate: false,
      paymentStatus,
      amountRefunded: updatedPayment.amountRefunded,
      entitlementRevoked,
      shouldCancelProviderSubscription:
        isFullyRefunded &&
        subscription.status !== SubscriptionStatus.CANCELLED &&
        subscription.status !== SubscriptionStatus.EXPIRED &&
        subscription.status !== SubscriptionStatus.REFUNDED &&
        isCurrentBillingCyclePayment,
      razorpaySubscriptionId: subscription.razorpaySubscriptionId,
    };
  });

  // Do not perform network calls inside the database transaction. If Razorpay
  // is unavailable, the webhook remains retryable; duplicate refund delivery
  // reaches the same cancellation step without double-counting the refund.
  if (
    result.shouldCancelProviderSubscription &&
    result.razorpaySubscriptionId
  ) {
    await cancelProviderSubscription(result.razorpaySubscriptionId);
  }

  return {
    duplicate: result.duplicate,
    paymentStatus: result.paymentStatus,
    amountRefunded: result.amountRefunded,
    ...( "entitlementRevoked" in result
      ? { entitlementRevoked: result.entitlementRevoked }
      : {}),
  };
};
