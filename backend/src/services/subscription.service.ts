import prisma from "../config/prisma";
import { env } from "../config/env";
import { Plan, SubscriptionStatus } from "@prisma/client";
import {
  createRazorpaySubscription,
  cancelRazorpaySubscription,
} from "./razorpay.service";

type RazorpaySubscriptionResponse = {
  id: string;
  short_url?: string | null;
};

export type SubscriptionGateway = {
  create: (
    planId: string,
    userId: string
  ) => Promise<RazorpaySubscriptionResponse>;
  cancel: (
    subscriptionId: string,
    cancelAtCycleEnd?: boolean
  ) => Promise<unknown>;
};

const defaultGateway: SubscriptionGateway = {
  create: createRazorpaySubscription,
  cancel: cancelRazorpaySubscription,
};

const isUniqueConstraintError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
};

export const createSubscription = async (
  userId: string,
  plan: Plan,
  gateway: SubscriptionGateway = defaultGateway
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
    select: { id: true },
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
          SubscriptionStatus.REFUNDED,
        ],
      },
    },
  });

  if (existingSubscription) {
    throw new Error("You already have an active or pending subscription");
  }

  // Create with Razorpay only after the application-level check. The partial
  // unique index in PostgreSQL is the final guard for concurrent requests.
  const razorpaySubscription = await gateway.create(razorpayPlanId, userId);

  try {
    const checkoutUrl = razorpaySubscription.short_url;

    if (
      typeof checkoutUrl !== "string" ||
      !checkoutUrl.startsWith("https://")
    ) {
      throw new Error("Razorpay did not return a valid hosted checkout URL");
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        razorpayPlanId,
        razorpaySubscriptionId: razorpaySubscription.id,
        checkoutUrl,
        status: SubscriptionStatus.CREATED,
      },
    });

    return {
      subscription,
      razorpay: {
        id: razorpaySubscription.id,
        shortUrl: checkoutUrl,
      },
    };
  } catch (persistenceError) {
    // Compensate for every provider subscription that could not be represented
    // locally, including concurrent requests rejected by the database index.
    try {
      await gateway.cancel(razorpaySubscription.id, false);
    } catch (compensationError) {
      console.error("[Billing] Failed to cancel orphaned Razorpay subscription:", {
        subscriptionId: razorpaySubscription.id,
        error:
          compensationError instanceof Error
            ? compensationError.message
            : "Unknown compensation error",
      });
    }

    if (isUniqueConstraintError(persistenceError)) {
      throw new Error("You already have an active or pending subscription");
    }

    throw persistenceError;
  }
};
