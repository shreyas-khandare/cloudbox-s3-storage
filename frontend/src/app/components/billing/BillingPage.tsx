import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, CreditCard, RefreshCw, ReceiptText, ShieldCheck, XCircle } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { api } from "../../../services/api";
import { getApiErrorMessage } from "../../../services/api-error";
import type { Page } from "../../App";

type Payment = {
  id: string;
  razorpayPaymentId?: string | null;
  amount: number;
  currency: string;
  status: string;
  amountRefunded?: number;
  paidAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
  subscription?: { plan: string };
};

type Subscription = {
  plan: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  checkoutUrl?: string | null;
  createdAt?: string;
};

type BillingOverview = {
  plan: string;
  subscriptionStatus: string;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
  currentSubscription: Subscription | null;
};

interface Props {
  navigate: (page: Page) => void;
}

function formatDate(value?: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount / 100);
}

export function BillingPage({ navigate }: Props) {
  const { user, refreshUser } = useAuth();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadBilling = useCallback(async () => {
    const [subscriptionResponse, paymentResponse] = await Promise.all([
      api.get("/subscriptions/me"),
      api.get("/subscriptions/payments"),
    ]);
    setOverview(subscriptionResponse.data.data);
    setPayments(paymentResponse.data.data || []);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadBilling()
      .catch((loadError) => { if (mounted) setError(getApiErrorMessage(loadError, "Unable to load billing information.")); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [loadBilling]);

  // Refresh billing when the customer returns from Razorpay hosted
  // checkout or switches back to this tab after a payment attempt.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([loadBilling(), refreshUser()]).catch(() => {
        // Preserve the current view; the explicit Refresh action remains available.
      });
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [loadBilling, refreshUser]);

  const refresh = async () => {
    setError("");
    setRefreshing(true);
    try {
      await Promise.all([loadBilling(), refreshUser()]);
      setNotice("Billing information refreshed.");
    } catch (refreshError) {
      setError(getApiErrorMessage(refreshError, "Unable to refresh billing information."));
    } finally {
      setRefreshing(false);
    }
  };

  const cancelAtPeriodEnd = async () => {
    const periodEnd = subscription?.currentPeriodEnd
      ? new Date(subscription.currentPeriodEnd)
      : null;
    const canKeepAccess = Boolean(
      subscription?.status !== "REFUNDED" &&
      periodEnd &&
      periodEnd > new Date()
    );
    const confirmation = canKeepAccess
      ? "Schedule cancellation at the end of the current billing period? Paid access will remain until then."
      : "Cancel this subscription now? This will stop future billing and keep the account on the Free plan.";
    if (!window.confirm(confirmation)) return;
    setError("");
    setNotice("");
    setCancelling(true);
    try {
      await api.post("/subscriptions/cancel");
      await Promise.all([loadBilling(), refreshUser()]);
      setNotice(canKeepAccess
        ? "Cancellation has been scheduled. Your paid access remains until the current period ends."
        : "The subscription has been cancelled. Your account is now on the Free plan.");
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, "Unable to cancel the subscription."));
    } finally {
      setCancelling(false);
    }
  };

  const subscription = overview?.currentSubscription;
  const canCancel = Boolean(
    subscription &&
    ["ACTIVE", "PAST_DUE", "HALTED", "REFUNDED"].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd
  );

  return (
    <div className="min-h-screen cloudbox-font-body" style={{ background: "#F4F4FF" }}>
      <header className="border-b border-[#E8E8F0] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <button onClick={() => navigate(user?.role === "ADMIN" ? "admin" : "dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#55556F] hover:text-[#3D38F5]"><ArrowLeft className="h-4 w-4" /> Workspace</button>
          <span className="text-xs font-semibold text-[#8585A0]">{user?.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6B63FF]">Account</p>
            <h1 className="cloudbox-font-display text-3xl font-extrabold text-[#1A1A2E]">Billing & subscription</h1>
            <p className="mt-2 text-sm text-[#6B6B8A]">Manage your current plan, renewal date, and payment history.</p>
          </div>
          <button onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#DCD9FF] bg-white px-4 py-2.5 text-sm font-semibold text-[#3D38F5] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-xl border border-[#DCD9FF] bg-white px-4 py-3 text-sm text-[#45418D]">{notice}</div>}

        {loading ? (
          <div className="py-20 text-center text-sm text-[#6B6B8A]">Loading billing information…</div>
        ) : (
          <>
            <section className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-3xl border border-[#E6E6F0] bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#F0EFFF] p-3 text-[#514BFF]"><CreditCard className="h-5 w-5" /></div>
                    <div><p className="text-xs font-medium text-[#8585A0]">Current plan</p><h2 className="text-xl font-bold text-[#1A1A2E]">{overview?.plan ?? user?.plan ?? "FREE"}</h2></div>
                  </div>
                  <span className="rounded-full bg-[#F2F1FF] px-3 py-1.5 text-xs font-bold text-[#514BFF]">{subscription?.status ?? overview?.subscriptionStatus ?? "FREE"}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[#F7F7FF] p-4"><p className="text-xs text-[#8585A0]">Current period ends</p><p className="mt-1 font-semibold text-[#1A1A2E]">{formatDate(subscription?.currentPeriodEnd ?? overview?.currentPeriodEnd)}</p></div>
                  <div className="rounded-2xl bg-[#F7F7FF] p-4"><p className="text-xs text-[#8585A0]">Grace period ends</p><p className="mt-1 font-semibold text-[#1A1A2E]">{formatDate(overview?.gracePeriodEnd)}</p></div>
                </div>
                {subscription?.cancelAtPeriodEnd && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Cancellation is scheduled. Your paid plan remains available until {formatDate(subscription.currentPeriodEnd)}.</p>}
                {subscription?.status === "CREATED" && (
                  <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p>Your subscription is awaiting payment authorization. Resume hosted checkout to complete payment.</p>
                    {subscription.checkoutUrl && (
                      <button
                        onClick={() => window.location.assign(subscription.checkoutUrl!)}
                        className="mt-3 rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white"
                      >
                        Resume Razorpay checkout
                      </button>
                    )}
                  </div>
                )}
                {subscription?.status === "PAST_DUE" && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Payment is overdue. Your access remains available during the grace period ending {formatDate(overview?.gracePeriodEnd)}.</p>}
                {subscription?.status === "HALTED" && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Razorpay has halted this subscription. Your grace period ends {formatDate(overview?.gracePeriodEnd)}. Resolve the payment issue or cancel the subscription.</p>}
                {subscription?.status === "REFUNDED" && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">A full refund has been recorded and paid access has been revoked. Cancel the provider subscription here to stop future billing.</p>}
                {subscription?.status === "ACTIVE" && overview?.plan !== subscription.plan && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Your {subscription.plan} subscription is active with Razorpay. CloudBox will enable the paid plan and its storage limit after Razorpay confirms the first successful plan charge.</p>}
                {canCancel && <button onClick={() => void cancelAtPeriodEnd()} disabled={cancelling} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"><XCircle className="h-4 w-4" /> {cancelling ? "Scheduling…" : "Cancel at period end"}</button>}
                {subscription?.cancelAtPeriodEnd && <p className="mt-4 text-sm text-[#6B6B8A]">The subscription is already scheduled to cancel at the end of the billing period.</p>}
              </div>

              <aside className="rounded-3xl border border-[#E6E6F0] bg-white p-6">
                <div className="mb-4 flex items-center gap-3"><div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><h2 className="font-bold text-[#1A1A2E]">Plan actions</h2></div>
                <p className="mb-5 text-sm leading-6 text-[#6B6B8A]">Compare available storage limits or review billing activity for your CloudBox account.</p>
                <button onClick={() => navigate("plans")} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white accent-gradient">View available plans</button>
                <div className="mt-4 flex items-center gap-2 text-xs leading-5 text-[#8585A0]"><CalendarClock className="h-4 w-4 shrink-0" /> Subscription access changes are confirmed by Razorpay webhooks.</div>
              </aside>
            </section>

            <section className="mt-8 overflow-hidden rounded-3xl border border-[#E6E6F0] bg-white">
              <div className="flex items-center gap-3 border-b border-[#EFEFF6] px-6 py-5"><ReceiptText className="h-5 w-5 text-[#514BFF]" /><div><h2 className="font-bold text-[#1A1A2E]">Payment history</h2><p className="mt-1 text-xs text-[#8585A0]">Payments recorded from verified Razorpay events</p></div></div>
              {payments.length === 0 ? (
                <div className="px-6 py-12 text-center"><p className="font-semibold text-[#1A1A2E]">No payments yet</p><p className="mt-1 text-sm text-[#8585A0]">Your completed and failed subscription payments will appear here.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left">
                    <thead className="bg-[#FAFAFF] text-xs uppercase tracking-wide text-[#8585A0]"><tr><th className="px-6 py-3 font-semibold">Date</th><th className="px-6 py-3 font-semibold">Plan</th><th className="px-6 py-3 font-semibold">Amount</th><th className="px-6 py-3 font-semibold">Payment ID</th><th className="px-6 py-3 font-semibold">Status</th></tr></thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id} className="border-t border-[#EFEFF6] text-sm">
                          <td className="px-6 py-4 text-[#55556F]">{formatDate(payment.paidAt ?? payment.createdAt)}</td>
                          <td className="px-6 py-4 font-medium text-[#1A1A2E]">{payment.subscription?.plan ?? "—"}</td>
                          <td className="px-6 py-4 font-semibold text-[#1A1A2E]">{formatMoney(payment.amount, payment.currency)}</td>
                          <td className="px-6 py-4 font-mono text-xs text-[#8585A0]">{payment.razorpayPaymentId ?? "Pending"}</td>
                          <td className="px-6 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${payment.status === "CAPTURED" ? "bg-emerald-50 text-emerald-700" : payment.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{payment.status}</span>
                            {Boolean(payment.amountRefunded) && <p className="mt-1 text-xs text-[#8585A0]">Refunded {formatMoney(payment.amountRefunded!, payment.currency)}</p>}
                            {payment.failureReason && <p className="mt-1 max-w-[180px] text-xs text-red-600">{payment.failureReason}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
