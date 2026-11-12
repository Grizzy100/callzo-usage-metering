
import prisma from "../config/db.js";

async function storeWebhookEvent(event) {
  const existingEvent = await prisma.callEvent.findUnique({
    where: { eventId: event.event_id },
    select: { id: true },
  });

  if (existingEvent) {
    return { duplicate: true };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { accountId: event.account_id },
        select: { id: true },
      });

      if (!account) {
        const error = new Error("Account not found");
        error.statusCode = 404;
        throw error;
      }

      const savedEvent = await tx.callEvent.create({
        data: {
          eventId: event.event_id,
          accountId: account.id,
          callId: event.call_id,
          eventType: event.event_type.replace(".", "_").toUpperCase(),
          eventTimestamp: new Date(event.timestamp),
          durationSeconds: event.duration_seconds,
          costCents: event.cost_cents,
          destinationCountry: event.destination_country,
          payload: event,
        },
      });

      await tx.retryJob.create({
        data: {
          callEventId: savedEvent.id,
          status: "PENDING",
        },
      });

      return {
        duplicate: false,
        eventId: savedEvent.eventId,
      };
    });
  } catch (error) {
    // Another request may have inserted the same event first.
    if (error.code === "P2002") {
      const existingEvent = await prisma.callEvent.findUnique({
        where: { eventId: event.event_id },
        select: { id: true },
      });

      if (existingEvent) {
        return { duplicate: true };
      }
    }

    throw error;
  }
}

export default storeWebhookEvent;
