import "../config/env";
import { createHmac } from "node:crypto";
import { PaymentStatus, SubscriptionStatus, WebhookStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { env } from "../config/env";

const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID?.trim();
const targetUrl = process.env.RAZORPAY_WEBHOOK_TEST_URL?.trim();

type StoredEnvelope = {
  entity?: string;
  event?: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: { id?: string } };
    payment?: { entity?: { id?: string } };
  };
};

async function getSnapshot(id: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: id },
    select: {
      status: true,
      plan: true,
      user: {
        select: {
          plan: true,
          subscriptionStatus: true,
          storageLimit: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new Error("CloudBox subscription not found.");
  }

  const payments = await prisma.payment.findMany({
    where: { subscription: { razorpaySubscriptionId: id } },
    select: {
      razorpayPaymentId: true,
      amount: true,
      amountRefunded: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    subscriptionStatus: subscription.status,
    subscriptionPlan: subscription.plan,
    userPlan: subscription.user.plan,
    userSubscriptionStatus: subscription.user.subscriptionStatus,
    storageLimitBytes: subscription.user.storageLimit.toString(),
    paymentCount: payments.length,
    payments: payments.map((payment) => ({
      paymentId: payment.razorpayPaymentId,
      amount: payment.amount,
      amountRefunded: payment.amountRefunded,
      status: payment.status,
    })),
  };
}

async function main() {
  if (!subscriptionId || !targetUrl) {
    throw new Error(
      "Set RAZORPAY_SUBSCRIPTION_ID and RAZORPAY_WEBHOOK_TEST_URL."
    );
  }

  const secret = env.RAZORPAY.WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is missing from backend/.env.");
  }

  const url = new URL(targetUrl);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("Webhook test URL must use HTTPS (or localhost for a local test).");
  }

  const event = await prisma.razorpayWebhookEvent.findFirst({
    where: {
      razorpaySubscriptionId: subscriptionId,
      eventType: "subscription.charged",
      status: WebhookStatus.PROCESSED,
    },
    orderBy: [{ processedAt: "desc" }, { receivedAt: "desc" }],
    select: {
      eventId: true,
      eventType: true,
      status: true,
      payload: true,
    },
  });

  if (!event) {
    throw new Error(
      "No already-processed subscription.charged event was found for this subscription."
    );
  }

  const envelope = event.payload as StoredEnvelope;
  const storedSubscriptionId = envelope.payload?.subscription?.entity?.id;
  if (
    envelope.event !== "subscription.charged" ||
    storedSubscriptionId !== subscriptionId
  ) {
    throw new Error("Stored event payload does not match the requested subscription.");
  }

  const rawBody = Buffer.from(JSON.stringify(event.payload), "utf8");
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  const before = await getSnapshot(subscriptionId);

  console.log("Sending a duplicate of an already-processed webhook:", {
    eventId: event.eventId,
    eventType: event.eventType,
    subscriptionId,
    paymentId: envelope.payload?.payment?.entity?.id ?? null,
    destination: url.origin + url.pathname,
  });
  console.log("Billing snapshot before duplicate:", before);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": signature,
      "X-Razorpay-Event-Id": event.eventId,
    },
    body: rawBody,
    signal: AbortSignal.timeout(10_000),
  });

  const responseBody = await response.text();
  let parsed: { success?: boolean; message?: string } = {};
  try {
    parsed = JSON.parse(responseBody) as typeof parsed;
  } catch {
    // Keep the raw response below for diagnostics.
  }

  const after = await getSnapshot(subscriptionId);
  console.log("Duplicate delivery response:", {
    httpStatus: response.status,
    response: parsed.success === undefined ? responseBody : parsed,
  });
  console.log("Billing snapshot after duplicate:", after);

  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const acknowledged =
    response.status === 200 &&
    parsed.success === true &&
    parsed.message === "Event already processed";

  if (!acknowledged || !unchanged) {
    throw new Error(
      "Duplicate delivery did not meet expectations. Review the response and before/after snapshots. No new payment was initiated by this test."
    );
  }

  console.log("PASS: duplicate webhook returned HTTP 200 and made no billing changes.");
}

void main()
  .catch((error: unknown) => {
    console.error(
      "Duplicate webhook test failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
