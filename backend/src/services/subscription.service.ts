import prisma from "../config/prisma";
import { env } from "../config/env";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { createRazorpaySubscription } from "./razorpay.service";

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

  // Save subscription in PostgreSQL
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
};