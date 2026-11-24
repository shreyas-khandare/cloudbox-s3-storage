export type RazorpaySubscriptionCheckoutResult = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayPaymentFailure = {
  error?: {
    description?: string;
    reason?: string;
  };
};

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySubscriptionCheckoutResult) => void;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayCheckoutInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    handler: (response: RazorpayPaymentFailure) => void
  ) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

export const loadRazorpayCheckout = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("Razorpay Checkout can only be loaded in a browser.");
  }

  if (window.Razorpay) return;

  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.id = "razorpay-checkout-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        if (window.Razorpay) {
          resolve();
        } else {
          checkoutScriptPromise = null;
          reject(new Error("Razorpay Checkout loaded without its SDK."));
        }
      };
      script.onerror = () => {
        checkoutScriptPromise = null;
        reject(new Error("Unable to load Razorpay Checkout. Check your connection and try again."));
      };
      document.body.appendChild(script);
    });
  }

  await checkoutScriptPromise;

  if (!window.Razorpay) {
    throw new Error("Razorpay Checkout is not available.");
  }
};

export const openRazorpaySubscriptionCheckout = (
  options: RazorpayCheckoutOptions,
  onFailure: (message: string) => void
): void => {
  if (!window.Razorpay) {
    throw new Error("Razorpay Checkout has not been loaded.");
  }

  const checkout = new window.Razorpay(options);
  checkout.on("payment.failed", (response) => {
    onFailure(
      response.error?.description ||
        response.error?.reason ||
        "Razorpay could not complete the payment. You can retry checkout."
    );
  });
  checkout.open();
};
