import { env } from "../config/env";
import prisma from "../config/prisma";
import { SUBSCRIPTION_PLANS } from "../config/subscription-plans";
import { activateSubscription } from "../services/razorpay-webhook.service";

type RazorpayEntity = Record<string, any>;

const subscriptionId = process.env.RAZORPAY_SUBSCRIPTION_ID?.trim();

const authorization =
  "Basic " +
  Buffer.from(
    `${env.RAZORPAY.KEY_ID}:${env.RAZORPAY.KEY_SECRET}`
  ).toString("base64");

async function razorpayGet<T extends RazorpayEntity = RazorpayEntity>(
  path: string
): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: { Authorization: authorization },
  });

  const data = (await response.json()) as T & {
    error?: { description?: string };
  };

  if (!response.ok) {
    throw new Error(
      `Razorpay request failed (HTTP ${response.status}): ${data.error?.description ?? "Unknown provider error"}`
    );
  }

  return data;
}

function timestampToDate(value: unknown, field: string): Date {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Razorpay returned an invalid ${field} timestamp.`);
  }

  const date = new Date(value * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Razorpay returned an invalid ${field} date.`);
  }

  return date;
}

async function main(subscriptionId: string) {
  const localSubscription = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: subscriptionId },
    select: {
      id: true,
      userId: true,
      plan: true,
      status: true,
      razorpayPlanId: true,
      razorpaySubscriptionId: true,
    },
  });

  if (!localSubscription) {
    throw new Error(
      "The supplied Razorpay subscription ID does not exist in this CloudBox database."
    );
  }

  if (
    localSubscription.status === "CANCELLED" ||
    localSubscription.status === "EXPIRED"
  ) {
    throw new Error(
      `The local subscription is ${localSubscription.status}; automatic activation is refused.`
    );
  }

  const planConfig = SUBSCRIPTION_PLANS[localSubscription.plan];

  const remoteSubscription = await razorpayGet(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`
  );

  if (remoteSubscription.id !== subscriptionId) {
    throw new Error("Razorpay returned a different subscription ID.");
  }

  if (remoteSubscription.status !== "active") {
    throw new Error(
      `Razorpay subscription status is ${remoteSubscription.status}; expected active.`
    );
  }

  if (remoteSubscription.plan_id !== localSubscription.razorpayPlanId) {
    throw new Error(
      "Razorpay plan ID does not match the plan saved in CloudBox."
    );
  }

  const invoiceResponse = await razorpayGet(
    `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=100`
  );

  const invoices: RazorpayEntity[] = Array.isArray(invoiceResponse.items)
    ? invoiceResponse.items
    : [];

  const paidInvoice = invoices
    .filter(
      (invoice) =>
        invoice.status === "paid" &&
        invoice.currency === "INR" &&
        invoice.amount === planConfig.price &&
        invoice.amount_paid === planConfig.price &&
        invoice.amount_due === 0 &&
        typeof invoice.payment_id === "string" &&
        (!invoice.subscription_id || invoice.subscription_id === subscriptionId)
    )
    .sort((a, b) => (b.paid_at ?? 0) - (a.paid_at ?? 0))[0];

  if (!paidInvoice) {
    throw new Error(
      `No paid INR invoice matching the ${localSubscription.plan} plan amount was found.`
    );
  }

  const payment = await razorpayGet(
    `/payments/${encodeURIComponent(paidInvoice.payment_id)}`
  );

  if (
    payment.id !== paidInvoice.payment_id ||
    payment.status !== "captured" ||
    payment.captured !== true ||
    payment.amount !== planConfig.price ||
    payment.currency !== "INR" ||
    payment.subscription_id !== subscriptionId
  ) {
    throw new Error(
      "The invoice's linked payment is not a captured payment matching this subscription and plan."
    );
  }

  const paidAt = timestampToDate(payment.created_at, "payment created_at");
  const currentPeriodStart = timestampToDate(
    remoteSubscription.current_start,
    "subscription current_start"
  );
  const currentPeriodEnd = timestampToDate(
    remoteSubscription.current_end,
    "subscription current_end"
  );

  if (currentPeriodEnd <= currentPeriodStart) {
    throw new Error("Razorpay returned an invalid subscription billing period.");
  }

  // Reuse CloudBox's existing transactional activation function. It checks
  // the plan amount/currency again and atomically records the payment,
  // subscription status, user plan, and storage entitlement.
  await activateSubscription(
    subscriptionId,
    payment.id,
    payment.amount,
    payment.currency,
    paidAt,
    currentPeriodStart,
    currentPeriodEnd
  );

  const updated = await prisma.subscription.findUnique({
    where: { razorpaySubscriptionId: subscriptionId },
    select: {
      plan: true,
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      user: {
        select: {
          plan: true,
          subscriptionStatus: true,
          storageLimit: true,
        },
      },
      payments: {
        where: { razorpayPaymentId: payment.id },
        select: {
          status: true,
          amount: true,
          currency: true,
          paidAt: true,
        },
      },
    },
  });

  console.log("CloudBox subscription reconciliation completed.");
  console.log({
    razorpaySubscriptionStatus: remoteSubscription.status,
    razorpayInvoiceStatus: paidInvoice.status,
    razorpayPaymentStatus: payment.status,
    plan: updated?.user.plan,
    subscriptionStatus: updated?.status,
    storageLimitBytes: updated?.user.storageLimit.toString(),
    payment: updated?.payments[0]
      ? {
          status: updated.payments[0].status,
          amount: updated.payments[0].amount,
          currency: updated.payments[0].currency,
        }
      : null,
  });
}

if (!subscriptionId) {
  console.error(
    "Set RAZORPAY_SUBSCRIPTION_ID to the existing Razorpay subscription ID before running this script."
  );
  process.exitCode = 1;
  void prisma.$disconnect();
} else {
  void main(subscriptionId)
    .catch((error: unknown) => {
      console.error(
        "Subscription reconciliation failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
