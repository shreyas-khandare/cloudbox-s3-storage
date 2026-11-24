/**
 * Razorpay webhook rows store the complete signed event envelope. Most
 * event handlers consume the inner `payload` object. Accept both shapes so
 * persisted events and already-unwrapped unit-test/provider payloads work.
 */
export const unwrapRazorpayWebhookPayload = (value: any): any => {
  const nestedPayload = value?.payload;

  if (
    nestedPayload &&
    typeof nestedPayload === "object" &&
    !Array.isArray(nestedPayload)
  ) {
    return nestedPayload;
  }

  return value;
};

export type RazorpayInvoiceSubscriptionLookup = {
  subscription_id?: string | null;
};

/**
 * Resolve the CloudBox subscription associated with a failed payment.
 *
 * Razorpay's payment.failed payload may omit subscription_id from the payment
 * entity. For subscription invoices, invoice.fetch(invoice_id) exposes the
 * authoritative subscription_id. Lookup errors deliberately propagate so the
 * webhook can be retried instead of silently losing a billing transition.
 */
export const resolvePaymentFailedSubscriptionId = async (
  payload: any,
  fetchInvoice: (
    invoiceId: string
  ) => Promise<RazorpayInvoiceSubscriptionLookup>
): Promise<string | null> => {
  const eventPayload = unwrapRazorpayWebhookPayload(payload);
  const payment = eventPayload?.payment?.entity;

  const directPaymentSubscriptionId = payment?.subscription_id;
  if (
    typeof directPaymentSubscriptionId === "string" &&
    directPaymentSubscriptionId.trim()
  ) {
    return directPaymentSubscriptionId.trim();
  }

  const siblingSubscriptionId = eventPayload?.subscription?.entity?.id;
  if (
    typeof siblingSubscriptionId === "string" &&
    siblingSubscriptionId.trim()
  ) {
    return siblingSubscriptionId.trim();
  }

  const invoiceId = payment?.invoice_id;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) {
    return null;
  }

  const invoice = await fetchInvoice(invoiceId.trim());
  return typeof invoice?.subscription_id === "string" &&
    invoice.subscription_id.trim()
    ? invoice.subscription_id.trim()
    : null;
};

export type ParsedSubscriptionCharge = {
  subscriptionId: string;
  paymentId: string;
  amount: number;
  currency: "INR";
  paidAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

/**
 * Parse a signed Razorpay subscription.charged payload.
 *
 * Razorpay places the subscription and payment in sibling entities. Its
 * documented payment entity does not include payment.subscription_id, so
 * the parent subscription entity is the authoritative subscription link.
 * If a provider payload does include payment.subscription_id, reject it
 * when it conflicts with the parent subscription ID.
 */
export const parseSubscriptionChargedEvent = (
  payload: any
): ParsedSubscriptionCharge => {
  const eventPayload = unwrapRazorpayWebhookPayload(payload);
  const subscription = eventPayload?.subscription?.entity;
  const payment = eventPayload?.payment?.entity;

  if (
    typeof subscription?.id !== "string" ||
    !subscription.id ||
    typeof payment?.id !== "string" ||
    !payment.id ||
    (
      payment.subscription_id != null &&
      payment.subscription_id !== subscription.id
    ) ||
    payment.status !== "captured" ||
    !Number.isInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.currency !== "INR" ||
    !Number.isFinite(payment.created_at) ||
    !Number.isFinite(subscription.current_start) ||
    !Number.isFinite(subscription.current_end)
  ) {
    throw new Error("Invalid subscription.charged payload");
  }

  const currentPeriodStart = new Date(subscription.current_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_end * 1000);
  const paidAt = new Date(payment.created_at * 1000);

  if (
    !Number.isFinite(currentPeriodStart.getTime()) ||
    !Number.isFinite(currentPeriodEnd.getTime()) ||
    !Number.isFinite(paidAt.getTime()) ||
    currentPeriodEnd <= currentPeriodStart
  ) {
    throw new Error("Invalid subscription billing period");
  }

  return {
    subscriptionId: subscription.id,
    paymentId: payment.id,
    amount: payment.amount,
    currency: "INR",
    paidAt,
    currentPeriodStart,
    currentPeriodEnd,
  };
};
