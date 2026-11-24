import { cancelRazorpaySubscription } from "./razorpay.service";
import { isDefinitiveRazorpayRejection } from "../utils/razorpay-error";

export type CancellationProvider = (
  subscriptionId: string,
  cancelAtCycleEnd: boolean
) => Promise<unknown>;

export type CancellationRequestResult =
  | { kind: "accepted" }
  | { kind: "rejected"; error: unknown }
  | { kind: "reconciliation_required"; error: unknown };

/**
 * Send (or retry) a cancellation request to Razorpay.
 *
 * A locally persisted cancelAtPeriodEnd flag is only an intent marker. It is
 * not proof that Razorpay accepted the request. When an earlier request may
 * have timed out, retry the provider call rather than returning success based
 * on the local flag alone.
 */
export const requestRazorpayCancellation = async (
  subscriptionId: string,
  cancelAtCycleEnd: boolean,
  cancellationIntentAlreadyPresent: boolean,
  cancelProvider: CancellationProvider = cancelRazorpaySubscription
): Promise<CancellationRequestResult> => {
  try {
    await cancelProvider(subscriptionId, cancelAtCycleEnd);
    return { kind: "accepted" };
  } catch (error) {
    // A previous request may already have reached Razorpay even if its
    // response was lost. Do not erase that intent based on a later rejection.
    if (
      cancellationIntentAlreadyPresent ||
      !isDefinitiveRazorpayRejection(error)
    ) {
      return { kind: "reconciliation_required", error };
    }

    // For a first attempt, a definitive provider 4xx means the request was
    // rejected; the caller may safely roll back the intent it just wrote.
    return { kind: "rejected", error };
  }
};
