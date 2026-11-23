import "../config/env";
import { PaymentStatus, SubscriptionStatus, WebhookStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import prisma from "../config/prisma";
import { processRazorpayWebhookEvent } from "../services/razorpay-webhook.service";

type RazorpayEntity = Record<string, any>;

const refundId = process.env.RAZORPAY_REFUND_ID?.trim();
const expectedPaymentId = process.env.RAZORPAY_EXPECTED_PAYMENT_ID?.trim();
const expectedEmail = process.env.RAZORPAY_EXPECTED_EMAIL?.trim().toLowerCase();

const authorization =
  "Basic " +
  Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");

async function razorpayGet(path: string): Promise<RazorpayEntity> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: { Authorization: authorization },
  });

  const data = (await response.json()) as RazorpayEntity;

  if (!response.ok) {
    const description =
      typeof data.error?.description === "string"
        ? data.error.description
        : "Unknown provider error";
    throw new Error(`Razorpay request failed (HTTP ${response.status}): ${description}`);
  }

  return data;
}

async function main() {
  if (!refundId || !expectedPaymentId || !expectedEmail) {
    throw new Error(
      "Set RAZORPAY_REFUND_ID, RAZORPAY_EXPECTED_PAYMENT_ID, and RAZORPAY_EXPECTED_EMAIL."
    );
  }

  if (
    !process.env.RAZORPAY_KEY_ID ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    throw new Error("Razorpay API credentials are missing from backend/.env.");
  }

  // Fetch the authoritative refund record directly from Razorpay. This does
  // not create a refund, charge a customer, or change provider subscription state.
  const refund = await razorpayGet(`/refunds/${encodeURIComponent(refundId)}`);

  if (
    refund.id !== refundId ||
    refund.status !== "processed" ||
    refund.payment_id !== expectedPaymentId ||
    !Number.isInteger(refund.amount) ||
    refund.amount <= 0 ||
    refund.currency !== "INR" ||
    typeof refund.created_at !== "number" ||
    !Number.isFinite(refund.created_at)
  ) {
    throw new Error(
      "Razorpay refund details do not match the requested processed refund, payment ID, amount, currency, or timestamp."
    );
  }

  const localPayment = await prisma.payment.findUnique({
    where: { razorpayPaymentId: expectedPaymentId },
    include: {
      subscription: {
        select: {
          id: true,
          userId: true,
          plan: true,
          status: true,
          razorpaySubscriptionId: true,
          razorpayPlanId: true,
        },
      },
      user: {
        select: {
          email: true,
          plan: true,
          storageLimit: true,
        },
      },
    },
  });

  if (!localPayment) {
    throw new Error("The specified payment does not exist in this CloudBox database.");
  }

  if (localPayment.user.email.toLowerCase() !== expectedEmail) {
    throw new Error(
      `Payment belongs to ${localPayment.user.email}, not the expected account ${expectedEmail}.`
    );
  }

  if (
    localPayment.status !== PaymentStatus.CAPTURED &&
    localPayment.status !== PaymentStatus.PARTIALLY_REFUNDED &&
    localPayment.status !== PaymentStatus.REFUNDED
  ) {
    throw new Error(
      `CloudBox payment status is ${localPayment.status}; refusing refund reconciliation.`
    );
  }

  if (
    refund.amount > localPayment.amount ||
    refund.currency !== localPayment.currency
  ) {
    throw new Error("Razorpay refund amount or currency does not match the CloudBox payment.");
  }

  if (refund.amount !== localPayment.amount) {
    throw new Error(
      "This recovery command is intentionally limited to a full refund equal to the original payment amount."
    );
  }

  const providerPayment = await razorpayGet(
    `/payments/${encodeURIComponent(expectedPaymentId)}`
  );

  if (
    providerPayment.id !== expectedPaymentId ||
    !["captured", "refunded"].includes(providerPayment.status) ||
    providerPayment.captured !== true ||
    providerPayment.amount !== localPayment.amount ||
    providerPayment.currency !== localPayment.currency
  ) {
    throw new Error(
      "The Razorpay payment is not a matching captured/refunded INR payment."
    );
  }

  const subscriptionId = localPayment.subscription.razorpaySubscriptionId;
  const providerSubscription = await razorpayGet(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );

  if (
    providerSubscription.id !== subscriptionId ||
    providerSubscription.plan_id !== localPayment.subscription.razorpayPlanId
  ) {
    throw new Error("Razorpay subscription or plan does not match the local CloudBox record.");
  }

  console.log("Verified refund and matching CloudBox records:", {
    refundId,
    paymentId: expectedPaymentId,
    email: localPayment.user.email,
    subscriptionId,
    refundAmount: refund.amount,
    refundCurrency: refund.currency,
    refundStatus: refund.status,
    providerSubscriptionStatus: providerSubscription.status,
  });

  // Use a stable local reconciliation event ID so rerunning this command is
  // idempotent. The refund service also enforces uniqueness by Razorpay refund ID.
  const eventId = `manual-refund-reconciliation:${refundId}`;
  const payload: Prisma.InputJsonObject = {
    entity: "event",
    event: "refund.processed",
    created_at: refund.created_at,
    payload: {
      refund: {
        entity: {
          id: refund.id,
          payment_id: refund.payment_id,
          amount: refund.amount,
          currency: refund.currency,
          status: refund.status,
          created_at: refund.created_at,
        },
      },
    },
  };

  const existingEvent = await prisma.razorpayWebhookEvent.findUnique({
    where: { eventId },
    select: { eventType: true, payload: true, status: true },
  });

  if (existingEvent) {
    if (
      existingEvent.eventType !== "refund.processed" ||
      existingEvent.status === WebhookStatus.PROCESSED
    ) {
      if (existingEvent.eventType !== "refund.processed") {
        throw new Error("The reconciliation event ID is already used by another event type.");
      }
      if (existingEvent.status === WebhookStatus.PROCESSED) {
        console.log("This refund reconciliation event is already processed; no duplicate refund will be applied.");
      }
    }
  } else {
    await prisma.razorpayWebhookEvent.create({
      data: {
        eventId,
        eventType: "refund.processed",
        razorpaySubscriptionId: subscriptionId,
        payload,
        status: WebhookStatus.PENDING,
      },
    });
  }

  const event = await prisma.razorpayWebhookEvent.findUnique({
    where: { eventId },
    select: { status: true },
  });

  if (event?.status !== WebhookStatus.PROCESSED) {
    const result = await processRazorpayWebhookEvent(eventId);
    if (result.inProgress) {
      throw new Error("Refund reconciliation event is already being processed. Check it before retrying.");
    }
  }

  const [updatedPayment, updatedSubscription, updatedUser, updatedEvent] =
    await Promise.all([
      prisma.payment.findUnique({
        where: { razorpayPaymentId: expectedPaymentId },
        select: { status: true, amountRefunded: true, amount: true },
      }),
      prisma.subscription.findUnique({
        where: { razorpaySubscriptionId: subscriptionId },
        select: { status: true, cancelAtPeriodEnd: true },
      }),
      prisma.user.findUnique({
        where: { id: localPayment.userId },
        select: { email: true, plan: true, storageLimit: true, subscriptionStatus: true },
      }),
      prisma.razorpayWebhookEvent.findUnique({
        where: { eventId },
        select: { status: true, responseMessage: true },
      }),
    ]);

  console.log("Refund reconciliation result:", {
    email: updatedUser?.email,
    paymentStatus: updatedPayment?.status,
    amountRefunded: updatedPayment?.amountRefunded,
    originalAmount: updatedPayment?.amount,
    subscriptionStatus: updatedSubscription?.status,
    cancelAtPeriodEnd: updatedSubscription?.cancelAtPeriodEnd,
    userPlan: updatedUser?.plan,
    userSubscriptionStatus: updatedUser?.subscriptionStatus,
    storageLimitBytes: updatedUser?.storageLimit.toString(),
    webhookStatus: updatedEvent?.status,
    webhookResponse: updatedEvent?.responseMessage,
  });

  if (
    updatedPayment?.status !== PaymentStatus.REFUNDED ||
    updatedPayment.amountRefunded !== updatedPayment.amount ||
    updatedSubscription?.status !== SubscriptionStatus.CANCELLED ||
    updatedUser?.plan !== "FREE" ||
    updatedEvent?.status !== WebhookStatus.PROCESSED
  ) {
    throw new Error(
      "Reconciliation did not reach the expected fully refunded, cancelled, FREE state. Inspect the reported state before taking further action."
    );
  }
}

void main()
  .catch((error: unknown) => {
    console.error(
      "Refund reconciliation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
