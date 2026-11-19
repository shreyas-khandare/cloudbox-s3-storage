import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env } from "./config/env";
import prisma from "./config/prisma";
import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import fileRoutes from "./routes/file.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import razorpayWebhookRoutes from "./routes/razorpay-webhook.routes";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

const allowedOrigins = new Set(
  [
    env.CLIENT_URL,
    "http://localhost:5173",
    "https://cloudbox-s3-storage.vercel.app",
    "https://mycloudbox.vercel.app",
  ].filter(Boolean)
);

app.use(morgan("dev"));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      const error = Object.assign(
        new Error("Request origin is not allowed"),
        { code: "CORS_ORIGIN_DENIED" }
      );
      return callback(error);
    },
    credentials: true,
  })
);

// Keep the webhook's raw body parser ahead of express.json so its HMAC
// signature is verified against the exact bytes Razorpay sent.
app.use("/api/webhooks/razorpay", razorpayWebhookRoutes);

app.use(express.json({ limit: "1mb" }));

app.use(
  helmet({
    crossOriginOpenerPolicy: {
      policy: "same-origin-allow-popups",
    },
  })
);

app.use(cookieParser());

app.get("/", (_req, res) => {
  res.json({ message: "Cloud Storage API Running" });
});

app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/health/ready", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ready", dependencies: { database: "up" } });
  } catch (error) {
    return next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

app.use(errorHandler);

export default app;
