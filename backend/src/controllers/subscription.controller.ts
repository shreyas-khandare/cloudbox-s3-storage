import { Request, Response, NextFunction } from "express";
import { Plan, SubscriptionStatus } from "@prisma/client";
import { createSubscription } from "../services/subscription.service";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";
import { MAX_SINGLE_UPLOAD_SIZE } from "../config/upload";
import { cancelRazorpaySubscription } from "../services/razorpay.service";
import { isDefinitiveRazorpayRejection } from "../utils/razorpay-error";
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
            checkoutUrl: true,
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
        amountRefunded: true,
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
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.HALTED,
            SubscriptionStatus.REFUNDED,
          ],
        },
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
      message: "No cancellable subscription found",
    });
  }

  if (subscription.cancelAtPeriodEnd) {
    return res.status(200).json({
      message: "Subscription cancellation is already scheduled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }

  const now = new Date();
  // A fully refunded subscription must be cancelled immediately even
  // when its previous billing period has a future end date. Scheduling
  // cancellation would leave the provider subscription capable of charging.
  const keepAccessUntilPeriodEnd =
    subscription.status !== SubscriptionStatus.REFUNDED &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd > now;

  // Persist cycle-end intent before calling Razorpay. Razorpay can emit
  // subscription.cancelled while the API request is still in flight; the
  // webhook must already know to preserve the customer's paid access.
  if (keepAccessUntilPeriodEnd) {
    try {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    } catch (error) {
      console.error("[Billing] Failed to persist scheduled cancellation intent:", error);
      return res.status(503).json({
        message: "Billing data could not be updated. No cancellation was requested.",
      });
    }
  }

  // If a future paid period remains, schedule cancellation for its end.
  // Past-due/halted/refunded subscriptions whose period has ended are
  // cancelled immediately, removing the provider's future billing schedule.
  try {
    await cancelRazorpaySubscription(
      subscription.razorpaySubscriptionId,
      keepAccessUntilPeriodEnd
    );
  } catch (error) {
    console.error("[Billing] Razorpay cancellation request failed:", error);

    // Only a provider 4xx response proves that Razorpay rejected the request.
    // Network errors, timeouts and 5xx responses are ambiguous: Razorpay may
    // have committed the cancellation before the response was lost.
    if (!isDefinitiveRazorpayRejection(error)) {
      return res.status(503).json({
        message: "Razorpay's cancellation outcome could not be confirmed. CloudBox has retained the cancellation intent; refresh Billing later or contact support before retrying.",
        reconciliationRequired: true,
      });
    }

    // A definitive 4xx rejection means the provider did not accept the request,
    // so the pre-written cycle-end intent can safely be rolled back.
    if (keepAccessUntilPeriodEnd) {
      try {
        await prisma.subscription.updateMany({
          where: {
            id: subscription.id,
            cancelAtPeriodEnd: true,
          },
          data: { cancelAtPeriodEnd: false },
        });
      } catch (rollbackError) {
        console.error("[Billing] Failed to roll back rejected cancellation intent:", rollbackError);
        return res.status(503).json({
          message: "Razorpay rejected cancellation and CloudBox could not roll back the pending request. Refresh Billing before retrying.",
          reconciliationRequired: true,
        });
      }
    }

    return res.status(502).json({
      message: "Razorpay rejected the cancellation request. No cancellation was scheduled.",
    });
  }

  try {
    if (!keepAccessUntilPeriodEnd) {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: now,
            endDate: now,
            cancelAtPeriodEnd: false,
            gracePeriodEnd: null,
          },
        });

        const anotherEntitledSubscription = await tx.subscription.findFirst({
          where: {
            userId,
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
            where: { id: userId },
            data: {
              plan: anotherEntitledSubscription.plan,
              subscriptionStatus: anotherEntitledSubscription.status,
              currentPeriodEnd: anotherEntitledSubscription.currentPeriodEnd,
              gracePeriodEnd: anotherEntitledSubscription.gracePeriodEnd,
              storageLimit: SUBSCRIPTION_PLANS[anotherEntitledSubscription.plan].storageLimit,
            },
          });
        } else {
          await tx.user.update({
            where: { id: userId },
            data: {
              plan: Plan.FREE,
              subscriptionStatus: SubscriptionStatus.CANCELLED,
              currentPeriodEnd: null,
              gracePeriodEnd: null,
              storageLimit: SUBSCRIPTION_PLANS.FREE.storageLimit,
            },
          });
        }
      });
    }
  } catch (error) {
    console.error("[Billing] Razorpay accepted cancellation but CloudBox could not persist it:", error);
    return res.status(503).json({
      message: "Razorpay accepted the cancellation, but CloudBox could not update its billing record. Refresh Billing before trying again.",
      providerAccepted: true,
    });
  }

  return res.status(200).json({
    message: keepAccessUntilPeriodEnd
      ? "Subscription cancellation scheduled successfully"
      : "Subscription cancelled successfully",
    cancelAtPeriodEnd: keepAccessUntilPeriodEnd,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
};
