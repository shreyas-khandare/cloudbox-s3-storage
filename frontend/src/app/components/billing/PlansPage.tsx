import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CreditCard, ShieldCheck, Sparkles, LoaderCircle, RefreshCw } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { api } from "../../../services/api";
import { getApiErrorMessage } from "../../../services/api-error";
import type { Page } from "../../App";

type PlanId = "FREE" | "PRO" | "BUSINESS";

type Plan = {
  id: PlanId;
  name: string;
  price: number;
  currency: string;
  storageLimit: string;
  maxFileSize: number;
  deviceLimit: number;
};

type Subscription = {
  id: string;
  plan: PlanId;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  checkoutUrl?: string | null;
  createdAt?: string;
};

type SubscriptionOverview = {
  plan: PlanId;
  subscriptionStatus: string;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
  currentSubscription: Subscription | null;
};

interface Props {
  navigate: (page: Page) => void;
}

const ACTIVE_OR_PENDING_STATUSES = ["CREATED", "ACTIVE", "PAST_DUE", "HALTED", "REFUNDED"];
const MAX_SINGLE_UPLOAD_SIZE = 5_000_000_000;

function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes === MAX_SINGLE_UPLOAD_SIZE) return "5 GB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / Math.pow(1024, index);
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(index >= 3 ? 0 : 1);
  return `${formatted} ${units[index]}`;
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price / 100);
}

export function PlansPage({ navigate }: Props) {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPlan, setActionPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollCount = useRef(0);

  const userId = user?.id;

  const loadData = useCallback(async () => {
    const plansRequest = api.get("/subscriptions/plans");
    const accountRequest = userId ? api.get("/subscriptions/me") : Promise.resolve(null);
    const [plansResponse, accountResponse] = await Promise.all([plansRequest, accountRequest]);

    setPlans(plansResponse.data.data || []);
    if (accountResponse) setOverview(accountResponse.data.data);
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([loadData(), userId ? refreshUser() : Promise.resolve(null)])
      .catch((loadError) => {
        if (mounted) setError(getApiErrorMessage(loadError, "Unable to load plans."));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [loadData, userId, refreshUser]);

  const pendingSubscription = overview?.currentSubscription ?? null;
  const hasActiveOrPendingSubscription = Boolean(
    pendingSubscription && ACTIVE_OR_PENDING_STATUSES.includes(pendingSubscription.status)
  );

  useEffect(() => {
    if (!userId || !pendingSubscription || !["CREATED", "PAST_DUE"].includes(pendingSubscription.status)) {
      return;
    }

    pollCount.current = 0;
    const timer = window.setInterval(async () => {
      pollCount.current += 1;
      try {
        await Promise.all([loadData(), refreshUser()]);
      } catch {
        // Keep the current status visible; the user can retry manually.
      }
      if (pollCount.current >= 12) window.clearInterval(timer);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [userId, pendingSubscription?.id, pendingSubscription?.status, loadData, refreshUser]);

  // Hosted Razorpay checkout may return the customer to this tab after
  // authorization. Refresh immediately on focus/visibility instead of
  // relying only on the bounded polling interval.
  useEffect(() => {
    if (!userId) return;

    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible") return;
      void Promise.all([loadData(), refreshUser()]).catch(() => {
        // Keep the last known state visible; the user can still refresh manually.
      });
    };

    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [userId, loadData, refreshUser]);

  const handleChoosePlan = async (plan: Plan) => {
    setError("");
    setNotice("");
    if (!user) {
      routerNavigate("/login", {
        state: { from: `/plans?selected=${plan.id}` },
      });
      return;
    }

    if (plan.id === "FREE") {
      setNotice("The Free plan is included with every CloudBox account.");
      return;
    }

    if (hasActiveOrPendingSubscription) {
      navigate("billing");
      return;
    }

    setActionPlan(plan.id);

    try {
      const response = await api.post("/subscriptions", { plan: plan.id });
      const result = response.data?.data;
      const url = result?.razorpay?.shortUrl;

      if (typeof url !== "string" || !url.startsWith("https://")) {
        throw new Error("Razorpay did not return a valid hosted checkout URL.");
      }

      setOverview((current) => ({
        plan: current?.plan ?? user.plan,
        subscriptionStatus: "CREATED",
        currentPeriodEnd: current?.currentPeriodEnd ?? null,
        gracePeriodEnd: current?.gracePeriodEnd ?? null,
        currentSubscription: result.subscription,
      }));

      // Navigate in the same tab so the hosted checkout is not blocked as a popup.
      window.location.assign(url);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to complete the plan request."));
    } finally {
      setActionPlan(null);
    }
  };

  const refreshStatus = async () => {
    setError("");
    try {
      await Promise.all([loadData(), refreshUser()]);
      setNotice("Subscription status refreshed. Paid access is enabled only after Razorpay confirms the payment.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to complete the plan request."));
    }
  };

  const selectedPlan = new URLSearchParams(location.search).get("selected");

  return (
    <div className="min-h-screen cloudbox-font-body" style={{ background: "#F4F4FF" }}>
      <header className="sticky top-0 z-20 border-b border-[#E8E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button onClick={() => navigate(user ? (user.role === "ADMIN" ? "admin" : "dashboard") : "landing")} className="flex items-center gap-2 text-sm font-semibold text-[#55556F] hover:text-[#3D38F5]">
            <ArrowLeft className="h-4 w-4" /> {user ? "Back to workspace" : "Back to CloudBox"}
          </button>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <button onClick={() => navigate("billing")} className="text-sm font-semibold text-[#55556F] hover:text-[#3D38F5]">Billing</button>
                <span className="rounded-full bg-[#EEF0FF] px-3 py-1.5 text-xs font-semibold text-[#3D38F5]">{user.plan} plan</span>
              </>
            ) : (
              <>
                <Link to="/login" state={{ from: `${location.pathname}${location.search}` }} className="text-sm font-semibold text-[#55556F] hover:text-[#3D38F5]">Sign in</Link>
                <Link to="/register" state={{ from: `${location.pathname}${location.search}` }} className="rounded-xl px-4 py-2 text-sm font-semibold text-white accent-gradient">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DCD9FF] bg-white px-3 py-1.5 text-xs font-semibold text-[#3D38F5]">
            <CreditCard className="h-3.5 w-3.5" /> CloudBox plans
          </div>
          <h1 className="cloudbox-font-display text-3xl font-extrabold tracking-tight text-[#1A1A2E] sm:text-5xl">
            More room for everything that matters.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#6B6B8A] sm:text-base">
            Compare storage, per-file upload limits, and device limits. Choose a plan that fits how you use CloudBox.
          </p>
        </div>

        {error && (
          <div role="alert" className="mx-auto mb-5 max-w-3xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {notice && (
          <div role="status" className="mx-auto mb-5 max-w-3xl rounded-xl border border-[#DCD9FF] bg-white px-4 py-3 text-sm text-[#45418D]">{notice}</div>
        )}

        {user && pendingSubscription && ["CREATED", "PAST_DUE", "HALTED", "REFUNDED"].includes(pendingSubscription.status) && (
          <section className="mx-auto mb-8 flex max-w-4xl flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-900">Subscription status: {pendingSubscription.status.replace("_", " ")}</p>
              <p className="mt-1 text-sm text-amber-800">
                {pendingSubscription.status === "CREATED"
                  ? "Your subscription is awaiting payment authorization. Resume checkout or refresh the status after payment. Do not create another subscription."
                  : pendingSubscription.status === "REFUNDED"
                    ? "A full refund has been recorded and paid access is revoked. Manage Billing to cancel any remaining provider subscription."
                    : "Razorpay has reported a payment issue. Check your billing details or review your payment history."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {pendingSubscription.status === "CREATED" && pendingSubscription.checkoutUrl && (
                <button
                  onClick={() => window.location.assign(pendingSubscription.checkoutUrl!)}
                  className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Resume checkout
                </button>
              )}
              {pendingSubscription.status === "REFUNDED" && (
                <button onClick={() => navigate("billing")} className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900">
                  Manage billing
                </button>
              )}
              <button onClick={refreshStatus} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900">
                <RefreshCw className="h-4 w-4" /> Refresh status
              </button>
            </div>
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-[#6B6B8A]"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading plans…</div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const current = (overview?.plan ?? user?.plan) === plan.id;
              const paidPlan = plan.id !== "FREE";
              const isPendingPlan = pendingSubscription?.plan === plan.id && pendingSubscription.status === "CREATED";
              const isHighlighted = plan.id === "PRO" || selectedPlan === plan.id;
              const features = [
                `${formatBytes(plan.storageLimit)} storage`,
                `${formatBytes(plan.maxFileSize)} maximum file size`,
                `${plan.deviceLimit} registered devices`,
                "Private file access and management",
              ];

              return (
                <article key={plan.id} className={`relative flex flex-col rounded-3xl border p-6 sm:p-7 ${isHighlighted ? "border-[#706BFF] bg-white shadow-xl shadow-[#3D38F5]/10" : "border-[#E6E6F0] bg-white"}`}>
                  {plan.id === "PRO" && <div className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-bold text-white accent-gradient">POPULAR</div>}
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8585A0]">{plan.name}</p>
                      <div className="mt-2 flex items-end gap-1">
                        <span className="cloudbox-font-display text-4xl font-extrabold text-[#1A1A2E]">{formatPrice(plan.price, plan.currency)}</span>
                        <span className="pb-1 text-sm text-[#8585A0]">{plan.price > 0 ? "/ month" : "forever"}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#F0EFFF] p-3 text-[#514BFF]"><Sparkles className="h-5 w-5" /></div>
                  </div>

                  <p className="mb-5 text-sm leading-6 text-[#6B6B8A]">
                    {plan.id === "FREE" ? "A simple starting point for personal files." : plan.id === "PRO" ? "For people who need more storage and larger uploads." : "For larger personal libraries and heavier file workflows."}
                  </p>

                  <div className="mb-6 rounded-2xl bg-[#F7F7FF] p-4">
                    <p className="text-xs font-medium text-[#8585A0]">Included storage</p>
                    <p className="mt-1 cloudbox-font-display text-2xl font-bold text-[#1A1A2E]">{formatBytes(plan.storageLimit)}</p>
                  </div>

                  <ul className="mb-8 flex-1 space-y-3">
                    {features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-[#55556F]">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {feature}
                      </li>
                    ))}
                  </ul>

                  {current ? (
                    <div className="rounded-xl bg-[#F0F0FF] px-4 py-3 text-center text-sm font-semibold text-[#3D38F5]">Your current plan</div>
                  ) : isPendingPlan ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">Payment pending</div>
                  ) : paidPlan && hasActiveOrPendingSubscription ? (
                    <button onClick={() => navigate("billing")} className="rounded-xl border border-[#DCD9FF] px-4 py-3 text-sm font-semibold text-[#3D38F5]">Manage current subscription</button>
                  ) : plan.id === "FREE" ? (
                    <div className="rounded-xl border border-[#E8E8F0] px-4 py-3 text-center text-sm font-semibold text-[#8585A0]">Included with every account</div>
                  ) : (
                    <button
                      onClick={() => void handleChoosePlan(plan)}
                      disabled={actionPlan !== null}
                      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 accent-gradient"
                    >
                      {actionPlan === plan.id ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Creating subscription…</> : user ? `Choose ${plan.name}` : "Sign in to choose"}
                    </button>
                  )}
                  {!user && paidPlan && <p className="mt-3 text-center text-xs text-[#8585A0]">New here? <button onClick={() => routerNavigate("/register", { state: { from: `/plans?selected=${plan.id}` } })} className="font-semibold text-[#3D38F5]">Create an account</button></p>}
                </article>
              );
            })}
          </div>
        )}

        <div className="mx-auto mt-10 flex max-w-3xl items-start gap-3 rounded-2xl border border-[#E6E6F0] bg-white p-4 text-sm leading-6 text-[#6B6B8A]">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#3D38F5]" />
          <p>Payments are handled on Razorpay’s hosted subscription page. CloudBox updates paid storage only after a verified Razorpay webhook confirms the subscription charge. You can review renewals and cancellation details in <button onClick={() => user ? navigate("billing") : routerNavigate("/login", { state: { from: "/billing" } })} className="font-semibold text-[#3D38F5] underline underline-offset-2">Billing</button>.</p>
        </div>
      </main>
    </div>
  );
}
