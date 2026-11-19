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
  } catch (error: unknown) {
    const errorRecord =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const nestedError =
      errorRecord?.error && typeof errorRecord.error === "object"
        ? (errorRecord.error as Record<string, unknown>)
        : null;
    const response =
      errorRecord?.response && typeof errorRecord.response === "object"
        ? (errorRecord.response as Record<string, unknown>)
        : null;
    const responseData =
      response?.data && typeof response.data === "object"
        ? (response.data as Record<string, unknown>)
        : null;
    const responseError =
      responseData?.error && typeof responseData.error === "object"
        ? (responseData.error as Record<string, unknown>)
        : null;

    const providerDescription =
      (typeof nestedError?.description === "string" && nestedError.description) ||
      (typeof responseError?.description === "string" && responseError.description) ||
      (typeof errorRecord?.description === "string" && errorRecord.description) ||
      (typeof responseData?.message === "string" && responseData.message) ||
      null;

    const providerCode =
      (typeof nestedError?.code === "string" && nestedError.code) ||
      (typeof responseError?.code === "string" && responseError.code) ||
      (typeof errorRecord?.code === "string" && errorRecord.code) ||
      null;

    const providerStatus =
      typeof errorRecord?.statusCode === "number"
        ? errorRecord.statusCode
        : typeof response?.status === "number"
          ? response.status
          : null;

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

    if (providerDescription || providerCode || providerStatus) {
      console.error("Razorpay subscription creation rejected:", {
        statusCode: providerStatus,
        code: providerCode,
        description: providerDescription,
      });

      return res.status(502).json({
        success: false,
        message:
          providerDescription ||
          "Razorpay rejected the subscription request. Check the backend Razorpay credentials and Plan ID mode.",
        code: providerCode,
      });
    }

    next(error instanceof Error ? error : new Error("Unknown subscription creation error"));
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
  const userId = req.user!.id;

  let subscription;
  try {
    subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  } catch (error) {
    console.error("[Billing] Failed to load subscription before cancellation:", error);
    return res.status(503).json({
      message: "Billing data is temporarily unavailable. Please try again.",
    });
  }

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

  // First ask Razorpay to schedule cancellation. Do not change local state
  // unless the provider accepts the request.
  try {
    await cancelRazorpaySubscription(subscription.razorpaySubscriptionId);
  } catch (error) {
    console.error("[Billing] Razorpay rejected cancellation:", error);
    return res.status(502).json({
      message: "Razorpay could not schedule the cancellation. No local billing changes were made.",
    });
  }

  // The provider accepted the request; persist the matching local flag.
  try {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });
  } catch (error) {
    console.error("[Billing] Razorpay accepted cancellation but CloudBox could not persist it:", error);
    return res.status(503).json({
      message: "Razorpay accepted the cancellation, but CloudBox could not update its billing record. Refresh Billing before trying again.",
      providerAccepted: true,
    });
  }

  return res.status(200).json({
    message: "Subscription cancellation scheduled successfully",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
};
