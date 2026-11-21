import Razorpay from "razorpay";
import { env } from "../config/env";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY.KEY_ID,
  key_secret: env.RAZORPAY.KEY_SECRET,
});

export const createRazorpaySubscription = async (
  planId: string,
  userId: string
) => {
  return razorpay.subscriptions.create({
    plan_id: planId,
    total_count: 120,
    quantity: 1,
    customer_notify: 1,
    notes: {
      userId,
      application: "CloudBox",
    },
  });
};

/**
 * A 4xx HTTP response is an explicit provider rejection. Timeouts, transport
 * failures and 5xx responses are ambiguous because the provider may have
 * completed the operation before the response was lost.
 */
export const isDefinitiveRazorpayRejection = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const record = error as Record<string, unknown>;
  const response =
    typeof record.response === "object" && record.response !== null
      ? (record.response as Record<string, unknown>)
      : null;
  const statusCode =
    typeof record.statusCode === "number"
      ? record.statusCode
      : typeof response?.status === "number"
        ? response.status
        : null;

  return statusCode !== null && statusCode >= 400 && statusCode < 500;
};

export const cancelRazorpaySubscription = async (
  subscriptionId: string,
  cancelAtCycleEnd = true
) => {
  return razorpay.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
};

/**
 * Ensure a fully refunded subscription cannot generate future charges.
 * Fetch first because Razorpay rejects cancellation requests for subscriptions
 * that are already cancelled, completed, or expired.
 */
export const ensureRazorpaySubscriptionCancelled = async (
  subscriptionId: string
) => {
  const subscription = await razorpay.subscriptions.fetch(subscriptionId);

  if (
    subscription.status === "cancelled" ||
    subscription.status === "completed" ||
    subscription.status === "expired"
  ) {
    return subscription;
  }

  return razorpay.subscriptions.cancel(subscriptionId, false);
};

export default razorpay;