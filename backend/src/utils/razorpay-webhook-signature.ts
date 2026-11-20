import { createHmac, timingSafeEqual } from "node:crypto";

export const verifyRazorpayWebhookSignature = (
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean => {
  if (
    !Buffer.isBuffer(rawBody) ||
    !secret ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  const receivedSignature = Buffer.from(signature, "hex");

  return (
    receivedSignature.length === expectedSignature.length &&
    timingSafeEqual(receivedSignature, expectedSignature)
  );
};
