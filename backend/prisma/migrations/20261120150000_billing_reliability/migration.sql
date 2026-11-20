-- Billing reliability: persist hosted checkout recovery and a refund ledger.
ALTER TABLE "Subscription"
ADD COLUMN "checkoutUrl" TEXT;

ALTER TABLE "Payment"
ADD COLUMN "amountRefunded" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "razorpayRefundId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Refund_razorpayRefundId_key"
ON "Refund"("razorpayRefundId");

CREATE INDEX "Refund_paymentId_createdAt_idx"
ON "Refund"("paymentId", "createdAt");

ALTER TABLE "Refund"
ADD CONSTRAINT "Refund_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- A user may have only one locally open subscription. This closes the race
-- where simultaneous checkout requests both pass the application-level check.
CREATE UNIQUE INDEX "Subscription_one_open_per_user_key"
ON "Subscription"("userId")
WHERE "status" IN ('CREATED', 'ACTIVE', 'PAST_DUE', 'HALTED');
