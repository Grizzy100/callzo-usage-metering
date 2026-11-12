
import webhookSchema from "../validators/webhook.validator.js";
import storeWebhookEvent from "../services/webhook.service.js";
import logger from "../utils/logger.js";

async function receiveWebhook(req, res) {
  let payload;

  // Parse JSON only after signature verification.
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON payload",
    });
  }

  const validation = webhookSchema.safeParse(payload);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook payload",
      errors: validation.error.flatten().fieldErrors,
    });
  }

  const event = validation.data;

  // Validate event-specific values.
  if (
    event.event_type === "call.started" ||
    event.event_type === "call.failed"
  ) {
    if (event.duration_seconds !== 0 || event.cost_cents !== 0) {
      return res.status(400).json({
        success: false,
        message: "Started and failed events must have zero duration and cost",
      });
    }
  }

  const result = await storeWebhookEvent(event);

  logger.info("Webhook received", {
    eventId: event.event_id,
    eventType: event.event_type,
    duplicate: result.duplicate,
  });

  return res.status(200).json({
    success: true,
    message: result.duplicate
      ? "Event already received"
      : "Event accepted",
    duplicate: result.duplicate,
  });
}

export default receiveWebhook;
