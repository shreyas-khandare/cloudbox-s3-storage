import { Router } from "express";
import express from "express";
import { razorpayWebhookController } from "../controllers/razorpay-webhook.controller";

const router = Router();

router.post(
  "/",
  express.raw({ type: "application/json" }),
  razorpayWebhookController
);

export default router;