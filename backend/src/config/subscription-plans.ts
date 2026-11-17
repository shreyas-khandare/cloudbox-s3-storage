import type { Plan } from "@prisma/client";

export const SUBSCRIPTION_GRACE_PERIOD_DAYS = 3;

export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: "Free",
    price: 0,
    currency: "INR",
    storageLimit: 1n * 1024n * 1024n * 1024n,
    maxFileSize: 100 * 1024 * 1024,
    deviceLimit: 2,
  },

  PRO: {
    name: "Pro",
    price: 14900,
    currency: "INR",
    storageLimit: 100n * 1024n * 1024n * 1024n,
    maxFileSize: 2 * 1024 * 1024 * 1024,
    deviceLimit: 3,
  },

  BUSINESS: {
    name: "Business",
    price: 39900,
    currency: "INR",
    storageLimit: 1024n * 1024n * 1024n * 1024n,
    maxFileSize: 10 * 1024 * 1024 * 1024,
    deviceLimit: 3,
  },
} as const;

export type SubscriptionPlan = Plan;