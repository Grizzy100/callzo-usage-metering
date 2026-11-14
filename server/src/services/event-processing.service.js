import prisma from "../config/db.js";

function getUsageMonth(timestamp) {
  return new Date(
    Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      1
    )
  );
}

function allocateUsage(durationSeconds, costCents, billableSeconds) {
  const billableDurationSeconds = Math.max(
    0,
    Math.min(durationSeconds, billableSeconds)
  );
  const excessDurationSeconds =
    durationSeconds - billableDurationSeconds;
  const billableCostCents =
    durationSeconds === 0
      ? costCents
      : Math.round(
          (costCents * billableDurationSeconds) / durationSeconds
        );

  return {
    billableDurationSeconds,
    billableCostCents,
    excessDurationSeconds,
    excessCostCents: costCents - billableCostCents,
  };
}

async function processCallEvent(eventId) {
  return prisma.$transaction(async (tx) => {
    // 1. Find the event.
    const event = await tx.callEvent.findUnique({
      where: { eventId },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // 2. Skip events already processed.
    if (event.processedAt) {
      return { alreadyProcessed: true };
    }

    // 3. Lock this account-call pair.
    // This also protects the case where the Call row does not exist yet.
    await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
        hashtextextended(
        ${event.accountId} || ':' || ${event.callId},
        0
        )
    )::text AS lock_result
    `;

    // 4. Create the call if it doesn't exist.
    await tx.call.upsert({
      where: {
        accountId_callId: {
          accountId: event.accountId,
          callId: event.callId,
        },
      },
      create: {
        accountId: event.accountId,
        callId: event.callId,
        status: "STARTED",
      },
      update: {},
    });

    // 5. Lock the call row.
    const calls = await tx.$queryRaw`
      SELECT *
      FROM calls
      WHERE account_id = ${event.accountId}::uuid
        AND call_id = ${event.callId}
      FOR UPDATE
    `;

    const call = calls[0];

    if (!call) {
      throw new Error(`Call could not be loaded: ${event.callId}`);
    }

    // 6. Apply a started event.
    // A late started event must never reverse a terminal status.
    if (event.eventType === "CALL_STARTED") {
      if (!call.started_at) {
        await tx.call.update({
          where: { id: call.id },
          data: {
            startedAt: event.eventTimestamp,
          },
        });
      }
    }

    // 7. Process terminal events.
    if (
      event.eventType === "CALL_ENDED" ||
      event.eventType === "CALL_FAILED"
    ) {
      // Find the earliest terminal event received for this call.
      const firstTerminalEvent = await tx.callEvent.findFirst({
        where: {
          accountId: event.accountId,
          callId: event.callId,
          eventType: {
            in: ["CALL_ENDED", "CALL_FAILED"],
          },
        },
        orderBy: [
          { receivedAt: "asc" },
          { id: "asc" },
        ],
        select: {
          id: true,
        },
      });

      // Only the earliest received terminal event can decide the outcome.
      if (
        firstTerminalEvent?.id === event.id &&
        call.status === "STARTED"
      ) {
        if (event.eventType === "CALL_FAILED") {
          await tx.call.update({
            where: { id: call.id },
            data: {
              status: "FAILED",
              endedAt: event.eventTimestamp,
            },
          });
        }

        if (event.eventType === "CALL_ENDED") {
          const usageMonth = getUsageMonth(event.eventTimestamp);

          const account = await tx.account.findUniqueOrThrow({
            where: { id: event.accountId },
            select: {
              monthlyCapSeconds: true,
            },
          });

          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${event.accountId} || ':' || ${usageMonth.toISOString()},
                0
              )
            )::text AS lock_result
          `;

          const existingUsage = await tx.monthlyUsage.findUnique({
            where: {
              accountId_month: {
                accountId: event.accountId,
                month: usageMonth,
              },
            },
            select: {
              totalDurationSeconds: true,
            },
          });

          const remainingSeconds = Math.max(
            account.monthlyCapSeconds -
              (existingUsage?.totalDurationSeconds ?? 0),
            0
          );
          const allocation = allocateUsage(
            event.durationSeconds,
            event.costCents,
            remainingSeconds
          );

          // Update the call lifecycle.
          await tx.call.update({
            where: { id: call.id },
            data: {
              status: "ENDED",
              endedAt: event.eventTimestamp,
              durationSeconds: event.durationSeconds,
              costCents: event.costCents,
              destinationCountry: event.destinationCountry,
              usageMonth,
              usageAppliedAt: new Date(),
            },
          });

          // Add usage atomically after locking the account-month aggregate.
          const usage = await tx.monthlyUsage.upsert({
            where: {
              accountId_month: {
                accountId: event.accountId,
                month: usageMonth,
              },
            },
            create: {
              accountId: event.accountId,
              month: usageMonth,
              capSeconds: account.monthlyCapSeconds,
              totalDurationSeconds:
                allocation.billableDurationSeconds,
              totalCostCents: allocation.billableCostCents,
              actualDurationSeconds: event.durationSeconds,
              excessDurationSeconds:
                allocation.excessDurationSeconds,
              excessCostCents: allocation.excessCostCents,
              completedCalls: 1,
              capExceededAt:
                allocation.excessDurationSeconds > 0
                  ? new Date()
                  : null,
            },
            update: {
              totalDurationSeconds: {
                increment: allocation.billableDurationSeconds,
              },
              totalCostCents: {
                increment: allocation.billableCostCents,
              },
              actualDurationSeconds: {
                increment: event.durationSeconds,
              },
              excessDurationSeconds: {
                increment: allocation.excessDurationSeconds,
              },
              excessCostCents: {
                increment: allocation.excessCostCents,
              },
              completedCalls: {
                increment: 1,
              },
            },
          });

          // Mark when the account crosses its monthly cap.
          if (
            usage.excessDurationSeconds > 0 &&
            !usage.capExceededAt
          ) {
            await tx.monthlyUsage.update({
              where: { id: usage.id },
              data: {
                capExceededAt: new Date(),
              },
            });
          }
        }
      }
    }

    // 8. Mark this event as processed.
    // This happens in the same transaction as usage updates.
    await tx.callEvent.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
      },
    });

    // 9. Return the latest call state.
    const updatedCall = await tx.call.findUniqueOrThrow({
      where: { id: call.id },
    });

    return {
      processed: true,
      callId: updatedCall.callId,
      status: updatedCall.status,
    };
  });
}

export { allocateUsage };
export default processCallEvent;