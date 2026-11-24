import "../config/env";
import { SubscriptionStatus, WebhookStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { processRazorpayWebhookEvent } from "../services/razorpay-webhook.service";

const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID?.trim();

async function main(id: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: id },
    select: {
      id: true,
      status: true,
      plan: true,
      user: {
        select: {
          email: true,
          plan: true,
          subscriptionStatus: true,
          storageLimit: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new Error("The supplied Razorpay subscription ID was not found in this CloudBox database.");
  }

  if (
    subscription.status === SubscriptionStatus.CANCELLED ||
    subscription.status === SubscriptionStatus.EXPIRED ||
    subscription.status === SubscriptionStatus.REFUNDED
  ) {
    throw new Error(
      `Refusing to reprocess a pending event for a terminal subscription (${subscription.status}).`
    );
  }

  // A failed charge may already have been acknowledged by an older handler
  // that ignored ACTIVE -> PAST_DUE. Reprocess only the latest matching
  // subscription.pending event for this exact subscription, received recently.
  const recentCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const event = await prisma.razorpayWebhookEvent.findFirst({
    where: {
      razorpaySubscriptionId: id,
      eventType: "subscription.pending",
      status: {
        in: [WebhookStatus.PROCESSED, WebhookStatus.FAILED],
      },
      receivedAt: { gte: recentCutoff },
    },
    orderBy: { receivedAt: "desc" },
    select: {
      eventId: true,
      eventType: true,
      status: true,
      payload: true,
      receivedAt: true,
      responseMessage: true,
    },
  });

  if (!event) {
    throw new Error(
      "No recent processed/failed subscription.pending webhook exists for this subscription. No changes made."
    );
  }

  const envelope = event.payload as {
    payload?: {
      subscription?: {
        entity?: {
          id?: string;
          status?: string;
        };
      };
    };
  };
  const providerSubscription = envelope.payload?.subscription?.entity;

  if (
    providerSubscription?.id !== id ||
    providerSubscription.status !== "pending"
  ) {
    throw new Error(
      "The latest stored pending event does not match the supplied subscription. No changes made."
    );
  }

  console.log("Reprocessing previously acknowledged failure event:", {
    email: subscription.user.email,
    razorpaySubscriptionId: id,
    eventId: event.eventId,
    previousStatus: event.status,
    receivedAt: event.receivedAt.toISOString(),
    previousResponse: event.responseMessage,
  });

  const reset = await prisma.razorpayWebhookEvent.updateMany({
    where: {
      eventId: event.eventId,
      status: {
        in: [WebhookStatus.PROCESSED, WebhookStatus.FAILED],
      },
    },
    data: {
      status: WebhookStatus.PENDING,
      processedAt: null,
      responseMessage: null,
    },
  });

  if (reset.count !== 1) {
    throw new Error("Webhook event changed concurrently. No reprocessing was attempted.");
  }

  await processRazorpayWebhookEvent(event.eventId);

  const [updatedSubscription, updatedEvent] = await Promise.all([
    prisma.subscription.findUnique({
      where: { razorpaySubscriptionId: id },
      select: {
        plan: true,
        status: true,
        gracePeriodEnd: true,
        user: {
          select: {
            email: true,
            plan: true,
            subscriptionStatus: true,
            storageLimit: true,
          },
        },
      },
    }),
    prisma.razorpayWebhookEvent.findUnique({
      where: { eventId: event.eventId },
      select: { status: true, responseMessage: true },
    }),
  ]);

  console.log("Reprocessing result:", {
    email: updatedSubscription?.user.email,
    subscriptionPlan: updatedSubscription?.plan,
    subscriptionStatus: updatedSubscription?.status,
    gracePeriodEnd: updatedSubscription?.gracePeriodEnd?.toISOString() ?? null,
    userPlan: updatedSubscription?.user.plan,
    userSubscriptionStatus: updatedSubscription?.user.subscriptionStatus,
    storageLimitBytes: updatedSubscription?.user.storageLimit.toString(),
    webhookStatus: updatedEvent?.status,
    webhookResponse: updatedEvent?.responseMessage,
  });

  if (
    updatedEvent?.status !== WebhookStatus.PROCESSED ||
    updatedSubscription?.status !== SubscriptionStatus.PAST_DUE
  ) {
    throw new Error("The pending event did not produce the expected PAST_DUE state. Review the output before retrying anything.");
  }
}

if (!subscriptionId) {
  console.error("Set RAZORPAY_SUBSCRIPTION_ID to the exact existing Razorpay subscription ID.");
  process.exitCode = 1;
  void prisma.$disconnect();
} else {
  void main(subscriptionId)
    .catch((error: unknown) => {
      console.error(
        "Pending webhook reprocessing failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
