import app from "./app";
import { env } from "./config/env";
import prisma from "./config/prisma";
import { startSessionCleanup } from "./services/session-cleanup.service";
import { startSubscriptionExpiryScheduler } from "./services/subscription-expiry.service";

const PORT = env.PORT;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

server.on("error", (error) => {
  console.error("[Server] Failed to start HTTP listener:", error);
  process.exitCode = 1;
});

const sessionCleanupTimer = startSessionCleanup();
const subscriptionExpiryTimer = startSubscriptionExpiryScheduler();

let shuttingDown = false;

const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`[Server] Received ${signal}; starting graceful shutdown.`);

  clearInterval(sessionCleanupTimer);
  clearInterval(subscriptionExpiryTimer);

  const forceShutdownTimer = setTimeout(() => {
    console.error("[Server] Graceful shutdown timed out; closing remaining connections.");
    server.closeAllConnections();
    void prisma.$disconnect().finally(() => {
      process.exitCode = 1;
    });
  }, 10_000);
  forceShutdownTimer.unref();

  server.close((error) => {
    clearTimeout(forceShutdownTimer);

    if (error) {
      console.error("[Server] Error while closing HTTP server:", error);
      process.exitCode = 1;
    }

    void prisma.$disconnect().catch((disconnectError) => {
      console.error("[Server] Failed to disconnect Prisma cleanly:", disconnectError);
      process.exitCode = 1;
    });
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
