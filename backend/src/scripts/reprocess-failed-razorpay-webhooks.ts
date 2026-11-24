import "../config/env";
import { WebhookStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { processRazorpayWebhookEvent } from "../services/razorpay-webhook.service";

const requestedEventIds = [
  ...new Set(
    (process.env.RAZORPAY_WEBHOOK_EVENT_IDS ?? "")
      .split(",")
      .map((eventId) => eventId.trim())
      .filter(Boolean)
  ),
];

const supportedEventTypes = new Set([
  "subscription.authenticated",
  "payment.failed",
]);

async function main() {
  if (requestedEventIds.length === 0) {
    throw new Error(
      "Set RAZORPAY_WEBHOOK_EVENT_IDS to a comma-separated list of existing webhook event IDs."
    );
  }

  if (requestedEventIds.length > 50) {
    throw new Error("A maximum of 50 webhook event IDs can be reprocessed per run.");
  }

  const events = await prisma.razorpayWebhookEvent.findMany({
    where: { eventId: { in: requestedEventIds } },
    select: {
      eventId: true,
      eventType: true,
      status: true,
      responseMessage: true,
    },
  });

  const foundIds = new Set(events.map((event) => event.eventId));
  const missingIds = requestedEventIds.filter((eventId) => !foundIds.has(eventId));

  if (missingIds.length > 0) {
    throw new Error(`Webhook event IDs not found in this database: ${missingIds.join(", ")}`);
  }

  let processedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const event of events) {
    if (!supportedEventTypes.has(event.eventType)) {
      console.log("Skipping unsupported event type:", {
        eventId: event.eventId,
        eventType: event.eventType,
      });
      skippedCount += 1;
      continue;
    }

    if (event.status !== WebhookStatus.FAILED) {
      console.log("Skipping event that is not FAILED:", {
        eventId: event.eventId,
        eventType: event.eventType,
        status: event.status,
      });
      skippedCount += 1;
      continue;
    }

    console.log("Reprocessing failed webhook:", {
      eventId: event.eventId,
      eventType: event.eventType,
      previousError: event.responseMessage,
    });

    try {
      // Reuses the stored signed event payload and the normal idempotent
      // processor. payment.failed invoice correlation uses the configured
      // Razorpay API credentials; no new payment or subscription is created.
      await processRazorpayWebhookEvent(event.eventId);

      const updated = await prisma.razorpayWebhookEvent.findUnique({
        where: { eventId: event.eventId },
        select: {
          status: true,
          responseMessage: true,
          razorpaySubscriptionId: true,
        },
      });

      if (updated?.status === WebhookStatus.PROCESSED) {
        console.log("Processed:", {
          eventId: event.eventId,
          eventType: event.eventType,
          razorpaySubscriptionId: updated.razorpaySubscriptionId,
        });
        processedCount += 1;
      } else {
        console.error("Event did not reach PROCESSED:", {
          eventId: event.eventId,
          status: updated?.status,
          responseMessage: updated?.responseMessage,
        });
        failedCount += 1;
      }
    } catch (error) {
      const updated = await prisma.razorpayWebhookEvent.findUnique({
        where: { eventId: event.eventId },
        select: { status: true, responseMessage: true },
      });

      console.error("Reprocessing failed:", {
        eventId: event.eventId,
        error: error instanceof Error ? error.message : "Unknown error",
        status: updated?.status,
        responseMessage: updated?.responseMessage,
      });
      failedCount += 1;
    }
  }

  console.log("Webhook reprocessing summary:", {
    requested: requestedEventIds.length,
    processed: processedCount,
    skipped: skippedCount,
    failed: failedCount,
  });

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error: unknown) => {
    console.error(
      "Failed webhook reprocessing command error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
