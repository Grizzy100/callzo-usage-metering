import express from "express";
import helmet from "helmet";

import config from "./config/config.js";
import prisma from "./config/db.js";
import logger from "./utils/logger.js";

import errorHandler from "./middleware/error.middleware.js";
import webhookRoutes from "./routes/webhook.routes.js";
import authRoutes from "./routes/auth.routes.js";
import accountRoutes from "./routes/account.routes.js";


const app = express();

app.disable("x-powered-by");
app.use(helmet());

// Health check
app.get("/health", async (req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    next(error);
  }
});


// Webhooks must receive the raw body for HMAC verification.
app.use("/webhooks", webhookRoutes);

app.use(express.json({ limit: "1mb" }));

// Authentication routes
app.use("/api/auth", express.json(), authRoutes);
app.use("/api/accounts", accountRoutes);

// Centralized error handler (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`Callzo API running on port ${config.port}`);
});

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down...`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info("Database disconnected");
      process.exit(0);
    } catch (error) {
      logger.error("Shutdown failed", {
        error: error.message,
      });
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;