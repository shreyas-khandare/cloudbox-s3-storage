import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the payment signature returned by Razorpay Subscription Checkout.
 * The subscription ID is read back from CloudBox's own database before this
 * helper is called; it is not trusted merely because the browser supplied it.
 */
export const verifyRazorpaySubscriptionCheckoutSignature = (
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret: string
): boolean => {
  if (
    !paymentId ||
    !subscriptionId ||
    !secret ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest();
  const received = Buffer.from(signature, "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
};
