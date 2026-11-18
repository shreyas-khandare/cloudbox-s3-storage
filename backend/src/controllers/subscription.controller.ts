import { Request, Response, NextFunction } from "express";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { createSubscription } from "../services/subscription.service";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";
import { MAX_SINGLE_UPLOAD_SIZE } from "../config/upload";
import { cancelRazorpaySubscription } from "../services/razorpay.service";
import prisma from "../config/prisma";

export const createSubscriptionController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { plan } = req.body;

    if (plan !== Plan.PRO && plan !== Plan.BUSINESS) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid subscription plan",
      });
    }

    const result = await createSubscription(req.user!.id, plan);

    return res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "You already have an active or pending subscription"
    ) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error instanceof Error &&
      error.message.includes("Razorpay plan ID") &&
      error.message.includes("is not configured")
    ) {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
};

export const getSubscriptionPlansController = (
  _req: Request,
  res: Response
) => {
  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    storageLimit: plan.storageLimit.toString(),
    maxFileSize: Math.min(plan.maxFileSize, MAX_SINGLE_UPLOAD_SIZE),
    deviceLimit: plan.deviceLimit,
  }));

  return res.status(200).json({
    success: true,
    data: plans,
  });
};

export const getMySubscriptionController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        gracePeriodEnd: true,
        storageUsed: true,
        storageLimit: true,

        subscriptions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            plan: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        storageUsed: user.storageUsed.toString(),
        storageLimit: user.storageLimit.toString(),
        currentSubscription: user.subscriptions[0] ?? null,
        subscriptions: undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistoryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        userId: req.user!.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        razorpayPaymentId: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        failureReason: true,
        createdAt: true,
        subscription: {
          select: {
            plan: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelSubscriptionController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user!.id;

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!subscription) {
      return res.status(404).json({
        message: "No active subscription found",
      });
    }

    if (
      !subscription.currentPeriodEnd ||
      subscription.currentPeriodEnd <= new Date()
    ) {
      return res.status(400).json({
        message: "Subscription has no valid active billing period",
      });
    }

    if (subscription.cancelAtPeriodEnd) {
      return res.status(400).json({
        message: "Subscription cancellation is already scheduled",
      });
    }

    // Schedule cancellation through Razorpay at the end of the billing cycle.
    await cancelRazorpaySubscription(
      subscription.razorpaySubscriptionId
    );

    // Update the local subscription record.
    await prisma.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        cancelAtPeriodEnd: true,
      },
    });

    return res.status(200).json({
      message: "Subscription cancellation scheduled successfully",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error("Cancel subscription error:", error);

    return res.status(500).json({
      message: "Failed to schedule subscription cancellation",
    });
  }
};