
import { Request, Response } from "express";
import { verifyRazorpayWebhookSignature } from "../utils/razorpay-webhook-signature";
import { Prisma } from "@prisma/client";

import { env } from "../config/env";
import prisma from "../config/prisma";
import { processRazorpayWebhookEvent } from "../services/razorpay-webhook.service";

export const razorpayWebhookController = async (
  req: Request,
  res: Response
) => {
  try {
    const webhookSecret = env.RAZORPAY.WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const eventId = req.headers["x-razorpay-event-id"];

    if (!webhookSecret) {
      return res.status(503).json({
        success: false,
        message: "Webhook secret is not configured",
      });
    }

    if (
      !Buffer.isBuffer(req.body) ||
      typeof signature !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook request",
      });
    }

    // Validate signature format before constant-time comparison.
    if (!/^[a-f0-9]{64}$/i.test(signature)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature format",
      });
    }

    // Verify the signature against the exact raw request body.
    if (!verifyRazorpayWebhookSignature(req.body, signature, webhookSecret)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    if (typeof eventId !== "string" || !eventId.trim()) {
      return res.status(400).json({
        success: false,
        message: "Missing webhook event ID",
      });
    }

    // Parse webhook payload only after signature verification.
    let payload: any;

    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON payload",
      });
    }

    if (
      !payload ||
      typeof payload.event !== "string" ||
      !payload.event.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook event",
      });
    }

    const subscriptionId =
      payload.payload?.subscription?.entity?.id ??
      payload.payload?.payment?.entity?.subscription_id ??
      null;

    // Store the webhook event.
    try {
      await prisma.razorpayWebhookEvent.create({
        data: {
          eventId,
          eventType: payload.event,
          razorpaySubscriptionId: subscriptionId,
          payload,
          status: "PENDING",
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingEvent =
          await prisma.razorpayWebhookEvent.findUnique({
            where: { eventId },
          });

        if (!existingEvent) {
          throw error;
        }

        if (existingEvent.status === "PROCESSED") {
          return res.status(200).json({
            success: true,
            message: "Event already processed",
          });
        }

        // A PENDING or FAILED event can be retried.
      } else {
        throw error;
      }
    }

    // Process the event.
    const result = await processRazorpayWebhookEvent(eventId);

    if (result.inProgress) {
      return res.status(500).json({
        success: false,
        message: "Webhook event is still being processed. Retry required.",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.duplicate
        ? "Event already processed"
        : "Webhook event processed successfully",
    });
  } catch (error) {
    console.error("Razorpay webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};
