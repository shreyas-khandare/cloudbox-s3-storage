
import {
  Plan,
  SubscriptionStatus,
} from "@prisma/client";

import prisma from "../config/prisma";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";

type ExpireSubscriptionOptions = {
  userId?: string;
};

export const expireSubscriptions = async (
  options: ExpireSubscriptionOptions = {}
) => {
  const { userId } = options;
  const now = new Date();

  const expiredSubscriptions = await prisma.subscription.findMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: [
        {
          status: {
            in: [
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.HALTED,
            ],
          },
          gracePeriodEnd: {
            lte: now,
          },
        },
        {
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.REFUNDED],
          },
          cancelAtPeriodEnd: true,
          currentPeriodEnd: {
            lte: now,
          },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
    },
  });

  let processedCount = 0;

  for (const subscription of expiredSubscriptions) {
    await prisma.$transaction(async (tx) => {
      const currentSubscription = await tx.subscription.findUnique({
        where: { id: subscription.id },
      });

      if (!currentSubscription) return;

      const isGracePeriodExpired =
        (
          currentSubscription.status === SubscriptionStatus.PAST_DUE ||
          currentSubscription.status === SubscriptionStatus.HALTED
        ) &&
        currentSubscription.gracePeriodEnd !== null &&
        currentSubscription.gracePeriodEnd <= now;

      const isScheduledCancellationExpired =
        (
          currentSubscription.status === SubscriptionStatus.ACTIVE ||
          currentSubscription.status === SubscriptionStatus.REFUNDED
        ) &&
        currentSubscription.cancelAtPeriodEnd &&
        currentSubscription.currentPeriodEnd !== null &&
        currentSubscription.currentPeriodEnd <= now;

      if (!isGracePeriodExpired && !isScheduledCancellationExpired) {
        return;
      }

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: isScheduledCancellationExpired
            ? SubscriptionStatus.CANCELLED
            : SubscriptionStatus.EXPIRED,
          endDate: now,
          cancelledAt: isScheduledCancellationExpired ? now : undefined,
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
            subscriptionStatus: isScheduledCancellationExpired
              ? SubscriptionStatus.CANCELLED
              : SubscriptionStatus.FREE,
            currentPeriodEnd: null,
            gracePeriodEnd: null,
            storageLimit: SUBSCRIPTION_PLANS.FREE.storageLimit,
          },
        });
      }

      processedCount++;
    });
  }

  return processedCount;
};

let expiryJobRunning = false;

export const startSubscriptionExpiryScheduler = (): NodeJS.Timeout => {
  const runExpiryJob = async () => {
    if (expiryJobRunning) return;

    expiryJobRunning = true;

    try {
      const expiredCount = await expireSubscriptions();

      console.log(
        `[Subscription Cleanup] Processed ${expiredCount} subscriptions`
      );
    } catch (error) {
      console.error(
        "[Subscription Cleanup] Failed:",
        error
      );
    } finally {
      expiryJobRunning = false;
    }
  };

  // Run immediately when the server starts.
  void runExpiryJob();

  // Repeat every hour without keeping the process alive during shutdown.
  const timer = setInterval(() => {
    void runExpiryJob();
  }, 60 * 60 * 1000);
  timer.unref();
  return timer;
};
