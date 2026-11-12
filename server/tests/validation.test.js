
import test from "node:test";
import assert from "node:assert/strict";
import webhookSchema from "../src/validators/webhook.validator.js";

const validEvent = {
  event_id: "test_event_001",
  event_type: "call.ended",
  account_id: "acct_001",
  call_id: "test_call_001",
  timestamp: "2026-11-12T10:00:00.000Z",
  duration_seconds: 120,
  cost_cents: 250,
  destination_country: "IN",
};

test("accepts a valid call event", () => {
  const result = webhookSchema.safeParse(validEvent);
  assert.equal(result.success, true);
});

test("rejects an unknown event type", () => {
  const result = webhookSchema.safeParse({
    ...validEvent,
    event_type: "call.unknown",
  });

  assert.equal(result.success, false);
});

test("rejects an invalid account ID", () => {
  const result = webhookSchema.safeParse({
    ...validEvent,
    account_id: "acct_999",
  });

  assert.equal(result.success, false);
});

test("rejects negative duration", () => {
  const result = webhookSchema.safeParse({
    ...validEvent,
    duration_seconds: -10,
  });

  assert.equal(result.success, false);
});

test("rejects decimal cost values", () => {
  const result = webhookSchema.safeParse({
    ...validEvent,
    cost_cents: 10.5,
  });

  assert.equal(result.success, false);
});

test("rejects missing event ID", () => {
  const { event_id, ...event } = validEvent;

  const result = webhookSchema.safeParse(event);
  assert.equal(result.success, false);
});
