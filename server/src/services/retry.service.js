
import prisma from "../config/db.js";
import processCallEvent from "./event-processing.service.js";

const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_MINUTES = 5;

async function claimJob() {
  return prisma.$transaction(async (tx) => {
    // Recover jobs whose workers crashed on their final attempt.
    await tx.$executeRaw`
      UPDATE retry_jobs
      SET
        status = 'DEAD',
        locked_at = NULL,
        last_error = COALESCE(last_error, 'Worker stopped during final attempt'),
        updated_at = NOW()
      WHERE
        status = 'PROCESSING'
        AND attempts >= ${MAX_ATTEMPTS}
        AND locked_at < NOW() -
          (${LOCK_TIMEOUT_MINUTES} * INTERVAL '1 minute')
    `;

    // Claim one available job.
    const jobs = await tx.$queryRaw`
      UPDATE retry_jobs
      SET
        status = 'PROCESSING',
        attempts = attempts + 1,
        locked_at = NOW(),
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM retry_jobs
        WHERE
          (
            status = 'PENDING'
            AND next_retry_at <= NOW()
            AND attempts < ${MAX_ATTEMPTS}
          )
          OR
          (
            status = 'PROCESSING'
            AND attempts < ${MAX_ATTEMPTS}
            AND locked_at < NOW() -
              (${LOCK_TIMEOUT_MINUTES} * INTERVAL '1 minute')
          )
        ORDER BY next_retry_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, call_event_id, attempts
    `;

    return jobs[0] || null;
  });
}

function getRetryDelay(attempt) {
  // 5s, 10s, 20s, 40s, 60s maximum.
  return Math.min(5000 * 2 ** (attempt - 1), 60000);
}

async function completeJob(jobId) {
  await prisma.retryJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      lockedAt: null,
      lastError: null,
    },
  });
}

async function failJob(job, error) {
  const permanentlyFailed = job.attempts >= MAX_ATTEMPTS;

  await prisma.retryJob.update({
    where: { id: job.id },
    data: {
      status: permanentlyFailed ? "DEAD" : "PENDING",
      lockedAt: null,
      nextRetryAt: new Date(
        Date.now() + getRetryDelay(job.attempts)
      ),
      lastError: String(error.message || error).slice(0, 2000),
    },
  });
}

async function processNextJob() {
  const job = await claimJob();

  if (!job) {
    return false;
  }

  try {
    const event = await prisma.callEvent.findUnique({
      where: { id: job.call_event_id },
      select: { eventId: true },
    });

    if (!event) {
      throw new Error("Related webhook event not found");
    }

    await processCallEvent(event.eventId);
    await completeJob(job.id);

    return true;
  } catch (error) {
    await failJob(job, error);
    return true;
  }
}

export default processNextJob;
