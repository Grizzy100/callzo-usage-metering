import prisma from "../config/db.js";
import { allocateUsage } from "./event-processing.service.js";

// Helper: Converts "YYYY-MM" to UTC start and end dates with year/month checks
function getMonthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthNumber = Number(monthStr);

  if (year < 2000 || year > 2100 || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Invalid month or year range");
  }

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { start, end };
}

async function reconcileMonthlyUsage(month) {
  const { start, end } = getMonthRange(month);

  return prisma.$transaction(async (tx) => {
    // 1. Fetch all accounts
    const accounts = await tx.account.findMany();
    let accountsReconciled = 0;

    for (const account of accounts) {
      // Step A: Fetch terminal events in arrival order (earliest received first)
      // This fetches are finsihed events : SUCESSFUL or FAILED
      const rawEvents = await tx.callEvent.findMany({
        where: {
          accountId: account.id,
          eventType: { in: ["CALL_ENDED", "CALL_FAILED"] },
          eventTimestamp: { gte: start, lt: end },
        },
        orderBy: [
          { receivedAt: "asc" },
          { id: "asc" },
        ],
      });

      // Step B: Deduplicate by callId — the FIRST terminal event received wins
      // failed calls should not contribute to usage consumption
      // Thats why only sucessful counts
      const seenCallIds = new Set();
      const completedCalls = [];

      for (const event of rawEvents) {
        if (!seenCallIds.has(event.callId)) {
          seenCallIds.add(event.callId);

          // Only successful calls with duration count towards usage
          if (event.eventType === "CALL_ENDED") {
            completedCalls.push(event);
          }
        }
      }



      // Clear previous monthly usage record for this specific account
      // The previous one might be wrong while calculating or requires update, so we entirely delete that one first
      await tx.monthlyUsage.deleteMany({
        where: {
          accountId: account.id,
          month: start,
        },
      });

      // If no completed calls exist for this account in this month, move to next
      if (completedCalls.length === 0) {
        continue;
      }

      // Step C: Sort completed calls chronologically by call time
      // (with receivedAt as deterministic tie-breaker for identical timestamps)
      completedCalls.sort((a, b) => {
        return (
          a.eventTimestamp.getTime() - b.eventTimestamp.getTime() ||
          a.receivedAt.getTime() - b.receivedAt.getTime()
        );
      });

      // Step D: Apply monthly cap chronologically
      let totalDurationSeconds = 0;
      let totalCostCents = 0;
      let actualDurationSeconds = 0;
      let excessDurationSeconds = 0;
      let excessCostCents = 0;
      let capExceededAt = null;

      for (const call of completedCalls) {
        const remainingCap = Math.max(
          account.monthlyCapSeconds - totalDurationSeconds,
          0
        );

        const allocation = allocateUsage(
          call.durationSeconds,
          call.costCents,
          remainingCap
        );

        totalDurationSeconds += allocation.billableDurationSeconds;
        totalCostCents += allocation.billableCostCents;
        actualDurationSeconds += call.durationSeconds;
        excessDurationSeconds += allocation.excessDurationSeconds;
        excessCostCents += allocation.excessCostCents;

        if (allocation.excessDurationSeconds > 0 && !capExceededAt) {
          capExceededAt = call.eventTimestamp;
        }
      }

      // Step E: Save clean reconciled row
      await tx.monthlyUsage.create({
        data: {
          accountId: account.id,
          month: start,
          totalDurationSeconds,
          totalCostCents,
          actualDurationSeconds,
          excessDurationSeconds,
          excessCostCents,
          completedCalls: completedCalls.length,
          capSeconds: account.monthlyCapSeconds,
          capExceededAt,
        },
      });

      accountsReconciled++;
    }

    return { month, accountsReconciled };
  });
}

export default reconcileMonthlyUsage;
