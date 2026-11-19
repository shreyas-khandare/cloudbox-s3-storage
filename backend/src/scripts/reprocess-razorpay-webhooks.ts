import "../config/env";
import { WebhookStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { processRazorpayWebhookEvent } from "../services/razorpay-webhook.service";

const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID?.trim();

async function main(id: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: id },
    select: {
      id: true,
      plan: true,
      status: true,
      user: {
        select: {
          email: true,
          plan: true,
          storageLimit: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new Error("The supplied Razorpay subscription ID was not found in this CloudBox database.");
  }

  console.log("Target CloudBox subscription:", {
    razorpaySubscriptionId: id,
    email: subscription.user.email,
    plan: subscription.plan,
    currentStatus: subscription.status,
  });

  const failedEvents = await prisma.razorpayWebhookEvent.findMany({
    where: {
      razorpaySubscriptionId: id,
      eventType: {
        in: ["subscription.activated", "subscription.charged"],
      },
      status: WebhookStatus.FAILED,
    },
    orderBy: { receivedAt: "asc" },
    select: {
      eventId: true,
      eventType: true,
      status: true,
      responseMessage: true,
      receivedAt: true,
    },
  });

  if (failedEvents.length === 0) {
    console.log("No failed activation/charge events found for this subscription. No changes made.");
    return;
  }

  console.log(`Reprocessing ${failedEvents.length} failed event(s) for this exact subscription.`);

  for (const event of failedEvents) {
    console.log("Reprocessing:", {
      eventId: event.eventId,
      eventType: event.eventType,
      receivedAt: event.receivedAt.toISOString(),
      previousError: event.responseMessage,
    });

    // Uses the existing event record and the same idempotent webhook processor.
    // It does not call Razorpay, create a subscription, or charge a payment.
    await processRazorpayWebhookEvent(event.eventId);
    console.log(`Processed ${event.eventType} successfully.`);
  }

  const updated = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: id },
    select: {
      plan: true,
      status: true,
      currentPeriodEnd: true,
      user: {
        select: {
          email: true,
          plan: true,
          subscriptionStatus: true,
          storageLimit: true,
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          razorpayPaymentId: true,
          amount: true,
          currency: true,
          status: true,
          paidAt: true,
        },
      },
    },
  });

  console.log("Updated CloudBox billing state:", {
    email: updated?.user.email,
    userPlan: updated?.user.plan,
    userSubscriptionStatus: updated?.user.subscriptionStatus,
    subscriptionPlan: updated?.plan,
    subscriptionStatus: updated?.status,
    currentPeriodEnd: updated?.currentPeriodEnd?.toISOString() ?? null,
    storageLimitBytes: updated?.user.storageLimit.toString(),
    payments: updated?.payments.map((payment) => ({
      ...payment,
      paidAt: payment.paidAt?.toISOString() ?? null,
    })),
  });
}

if (!subscriptionId) {
  console.error("Set RAZORPAY_SUBSCRIPTION_ID to the existing Razorpay subscription ID.");
  process.exitCode = 1;
  void prisma.$disconnect();
} else {
  void main(subscriptionId)
    .catch((error: unknown) => {
      console.error(
        "Webhook reprocessing failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
