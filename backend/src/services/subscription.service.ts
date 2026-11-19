import prisma from "../config/prisma";
import { env } from "../config/env";
import { Plan, SubscriptionStatus } from "@prisma/client";
import {
  createRazorpaySubscription,
  cancelRazorpaySubscription,
} from "./razorpay.service";

export const createSubscription = async (
  userId: string,
  plan: Plan
) => {
  if (plan === Plan.FREE) {
    throw new Error("Free plan does not require a subscription");
  }

  const planConfig = {
    [Plan.PRO]: env.RAZORPAY.PLANS.PRO,
    [Plan.BUSINESS]: env.RAZORPAY.PLANS.BUSINESS,
  };

  const razorpayPlanId = planConfig[plan];

  if (!razorpayPlanId) {
    throw new Error(
      `Razorpay plan ID for ${plan} is not configured. Set RAZORPAY_${plan}_PLAN_ID in the backend environment.`
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: {
        in: [
          SubscriptionStatus.CREATED,
          SubscriptionStatus.ACTIVE,
          SubscriptionStatus.PAST_DUE,
          SubscriptionStatus.HALTED,
        ],
      },
    },
  });

  if (existingSubscription) {
    throw new Error("You already have an active or pending subscription");
  }

  // Create subscription with Razorpay
  const razorpaySubscription = await createRazorpaySubscription(
    razorpayPlanId,
    userId
  );

  // Persist the provider subscription locally. If PostgreSQL rejects the
  // write (for example, a concurrent request wins the one-open-subscription
  // constraint), immediately cancel the external subscription as compensation.
  try {
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        razorpayPlanId,
        razorpaySubscriptionId: razorpaySubscription.id,
        status: SubscriptionStatus.CREATED,
      },
    });

    return {
      subscription,
      razorpay: {
        id: razorpaySubscription.id,
        shortUrl: razorpaySubscription.short_url,
      },
    };
  } catch (persistenceError) {
    try {
      await cancelRazorpaySubscription(razorpaySubscription.id, false);
    } catch (compensationError) {
      console.error("[Billing] Failed to cancel orphaned Razorpay subscription:", {
        subscriptionId: razorpaySubscription.id,
        error:
          compensationError instanceof Error
            ? compensationError.message
            : "Unknown compensation error",
      });
    }

    throw persistenceError;
  }
};