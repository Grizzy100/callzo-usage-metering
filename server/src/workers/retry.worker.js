
import processNextJob from "../services/retry.service.js";
import prisma from "../config/db.js";
import logger from "../utils/logger.js";

const POLL_INTERVAL_MS = 2000;

let isRunning = true;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
  logger.info("Retry worker started");

  while (isRunning) {
    try {
      const processed = await processNextJob();

      // If there was no job, wait before checking again.
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error("Worker iteration failed", {
        message: error.message,
      });

      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function shutdown(signal) {
  if (!isRunning) return;

  logger.info(`${signal} received. Stopping retry worker`);

  isRunning = false;

  try {
    // Wait for the current processing loop to finish.
    await workerPromise;

    await prisma.$disconnect();

    logger.info("Retry worker stopped");
    process.exit(0);
  } catch (error) {
    logger.error("Worker shutdown failed", {
      message: error.message,
    });
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const workerPromise = startWorker();
