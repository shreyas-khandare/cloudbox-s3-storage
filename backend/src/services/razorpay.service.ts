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