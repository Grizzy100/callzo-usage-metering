
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import prisma from "../src/config/db.js";

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

const API_URL =
  process.env.API_BASE_URL || "http://localhost:3000";

const WEBHOOK_URL = `${API_URL}/webhooks/calls`;
const SECRET = process.env.WEBHOOK_SECRET;

const LOG_DIRECTORY = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIRECTORY, "simulation.log");

const WAIT_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 500;

const runId = crypto.randomUUID().slice(0, 8);

if (!SECRET) {
  throw new Error("WEBHOOK_SECRET is missing from .env");
}

fs.mkdirSync(LOG_DIRECTORY, { recursive: true });

// --------------------------------------------------
// LOGGING
// --------------------------------------------------

function log(message, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    ...details,
  };

  const line = JSON.stringify(entry);

  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// --------------------------------------------------
// SIGNATURE GENERATION
// --------------------------------------------------

function generateSignature(rawBody) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(rawBody)
    .digest("hex");
}

// --------------------------------------------------
// HTTP REQUEST HELPERS
// --------------------------------------------------

async function sendRawRequest(rawBody, signature = true) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (signature === true) {
    headers["X-Signature"] = generateSignature(rawBody);
  } else if (typeof signature === "string") {
    headers["X-Signature"] = signature;
  }

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: rawBody,
  });

  const responseText = await response.text();

  let responseBody;

  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText;
  }

  return {
    status: response.status,
    body: responseBody,
  };
}

async function sendEvent(event) {
  const rawBody = JSON.stringify(event);
  return sendRawRequest(rawBody, true);
}

// --------------------------------------------------
// EVENT GENERATION
// --------------------------------------------------

function createEvent({
  eventId,
  eventType,
  accountId,
  callId,
  timestamp,
  duration = 0,
  cost = 0,
}) {
  return {
    event_id: eventId,
    event_type: eventType,
    account_id: accountId,
    call_id: callId,
    timestamp: timestamp.toISOString(),
    duration_seconds: duration,
    cost_cents: cost,
    destination_country: "IN",
  };
}

function createIds(scenario) {
  const id = `${runId}_${scenario}`;

  return {
    eventId: (suffix) => `sim_${id}_${suffix}`,
    callId: (suffix) => `sim_${id}_${suffix}`,
  };
}

// --------------------------------------------------
// DATABASE HELPERS
// --------------------------------------------------

async function getAccount(accountId) {
  const account = await prisma.account.findUnique({
    where: { accountId },
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  return account;
}

async function getCall(accountId, callId) {
  const account = await getAccount(accountId);

  return prisma.call.findUnique({
    where: {
      accountId_callId: {
        accountId: account.id,
        callId,
      },
    },
  });
}

async function getMonthlyUsage(accountId, date) {
  const account = await getAccount(accountId);

  const month = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1
    )
  );

  return prisma.monthlyUsage.findUnique({
    where: {
      accountId_month: {
        accountId: account.id,
        month,
      },
    },
  });
}

// Wait until all supplied events have been processed
// by the background worker.

async function waitForEvents(eventIds) {
  const start = Date.now();

  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    const events = await prisma.callEvent.findMany({
      where: {
        eventId: { in: eventIds },
      },
      select: {
        eventId: true,
        processedAt: true,
      },
    });

    if (
      events.length === eventIds.length &&
      events.every((event) => event.processedAt !== null)
    ) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL_MS)
    );
  }

  throw new Error(
    `Timed out waiting for events: ${eventIds.join(", ")}`
  );
}

async function waitForCall(accountId, callId, expectedStatus) {
  const start = Date.now();

  while (Date.now() - start < WAIT_TIMEOUT_MS) {
    const call = await getCall(accountId, callId);

    if (call?.status === expectedStatus) {
      return call;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL_MS)
    );
  }

  throw new Error(
    `Call ${callId} did not reach status ${expectedStatus}`
  );
}

// --------------------------------------------------
// SCENARIO RESULT HANDLER
// --------------------------------------------------

let passed = 0;
let failed = 0;

async function runScenario(name, callback) {
  log(`Starting scenario: ${name}`);

  try {
    const result = await callback();

    passed++;

    log(`Scenario passed: ${name}`, {
      result,
    });
  } catch (error) {
    failed++;

    log(`Scenario failed: ${name}`, {
      error: error.message,
      stack: error.stack,
    });
  }
}

// --------------------------------------------------
// 1. NORMAL SCENARIO
// --------------------------------------------------

async function testNormal() {
  const accountId = "acct_001";
  const ids = createIds("normal");

  const callId = ids.callId("call");
  const startId = ids.eventId("started");
  const endId = ids.eventId("ended");

  const now = new Date();
  const startTime = new Date(now.getTime() - 120000);

  const started = createEvent({
    eventId: startId,
    eventType: "call.started",
    accountId,
    callId,
    timestamp: startTime,
  });

  const startResponse = await sendEvent(started);

  if (startResponse.status !== 200) {
    throw new Error(
      `Started event returned ${startResponse.status}`
    );
  }

  await waitForEvents([startId]);

  const ended = createEvent({
    eventId: endId,
    eventType: "call.ended",
    accountId,
    callId,
    timestamp: now,
    duration: 120,
    cost: 250,
  });

  const endResponse = await sendEvent(ended);

  if (endResponse.status !== 200) {
    throw new Error(
      `Ended event returned ${endResponse.status}`
    );
  }

  await waitForEvents([endId]);

  const call = await waitForCall(
    accountId,
    callId,
    "ENDED"
  );

  if (call.durationSeconds !== 120) {
    throw new Error("Incorrect call duration");
  }

  if (call.costCents !== 250) {
    throw new Error("Incorrect call cost");
  }

  return {
    callId,
    status: call.status,
    durationSeconds: call.durationSeconds,
    costCents: call.costCents,
  };
}

// --------------------------------------------------
// 2. DUPLICATE SCENARIO
// --------------------------------------------------

async function testDuplicate() {
  const accountId = "acct_002";
  const ids = createIds("duplicate");

  const callId = ids.callId("call");
  const startId = ids.eventId("started");
  const endId = ids.eventId("ended");

  const now = new Date();

  const started = createEvent({
    eventId: startId,
    eventType: "call.started",
    accountId,
    callId,
    timestamp: new Date(now.getTime() - 60000),
  });

  const startResponse = await sendEvent(started);

  if (startResponse.status !== 200) {
    throw new Error("Started event was rejected");
  }

  await waitForEvents([startId]);

  const ended = createEvent({
    eventId: endId,
    eventType: "call.ended",
    accountId,
    callId,
    timestamp: now,
    duration: 90,
    cost: 150,
  });

  const firstResponse = await sendEvent(ended);
  const secondResponse = await sendEvent(ended);

  if (firstResponse.status !== 200) {
    throw new Error("First ended event was rejected");
  }

  if (secondResponse.status !== 200) {
    throw new Error("Duplicate event request was rejected");
  }

  if (firstResponse.body.duplicate !== false) {
    throw new Error("First event was incorrectly marked duplicate");
  }

  if (secondResponse.body.duplicate !== true) {
    throw new Error("Second event was not marked duplicate");
  }

  await waitForEvents([endId]);

  const eventCount = await prisma.callEvent.count({
    where: { eventId: endId },
  });

  if (eventCount !== 1) {
    throw new Error("Duplicate event was stored more than once");
  }

  const jobCount = await prisma.retryJob.count({
    where: {
      callEvent: {
        eventId: endId,
      },
    },
  });

  if (jobCount !== 1) {
    throw new Error("Duplicate retry job detected");
  }

  const call = await waitForCall(
    accountId,
    callId,
    "ENDED"
  );

  if (call.durationSeconds !== 90) {
    throw new Error("Duplicate event affected call duration");
  }

  return {
    firstResponse: firstResponse.body,
    secondResponse: secondResponse.body,
    storedEvents: eventCount,
    retryJobs: jobCount,
  };
}

// --------------------------------------------------
// 3. OUT-OF-ORDER SCENARIO
// --------------------------------------------------

async function testOutOfOrder() {
  const accountId = "acct_003";
  const ids = createIds("out_of_order");

  const callId = ids.callId("call");
  const startId = ids.eventId("started");
  const endId = ids.eventId("ended");

  const now = new Date();

  // Send ended first.

  const ended = createEvent({
    eventId: endId,
    eventType: "call.ended",
    accountId,
    callId,
    timestamp: now,
    duration: 180,
    cost: 300,
  });

  const endResponse = await sendEvent(ended);

  if (endResponse.status !== 200) {
    throw new Error("Ended event was rejected");
  }

  // Ensure ended is processed before started is sent.

  await waitForEvents([endId]);

  const endedCall = await waitForCall(
    accountId,
    callId,
    "ENDED"
  );

  if (endedCall.startedAt !== null) {
    throw new Error(
      "Call unexpectedly has a start timestamp"
    );
  }

  // Now send started.

  const started = createEvent({
    eventId: startId,
    eventType: "call.started",
    accountId,
    callId,
    timestamp: new Date(now.getTime() - 180000),
  });

  const startResponse = await sendEvent(started);

  if (startResponse.status !== 200) {
    throw new Error("Late started event was rejected");
  }

  await waitForEvents([startId]);

  const finalCall = await waitForCall(
    accountId,
    callId,
    "ENDED"
  );

  if (!finalCall.startedAt) {
    throw new Error("Started timestamp was not filled");
  }

  if (finalCall.durationSeconds !== 180) {
    throw new Error("Call status or duration changed incorrectly");
  }

  return {
    status: finalCall.status,
    startedAt: finalCall.startedAt,
    endedAt: finalCall.endedAt,
    durationSeconds: finalCall.durationSeconds,
  };
}

// --------------------------------------------------
// 4. LATE EVENT SCENARIO
// --------------------------------------------------

async function testLateEvent() {
  const accountId = "acct_004";
  const ids = createIds("late");

  const callId = ids.callId("call");
  const startId = ids.eventId("started");
  const endId = ids.eventId("ended");

  const oldTime = new Date(
    Date.now() - 35 * 24 * 60 * 60 * 1000
  );

  const endTime = new Date(oldTime.getTime() + 120000);

  const started = createEvent({
    eventId: startId,
    eventType: "call.started",
    accountId,
    callId,
    timestamp: oldTime,
  });

  const startResponse = await sendEvent(started);

  if (startResponse.status !== 200) {
    throw new Error("Late started event was rejected");
  }

  await waitForEvents([startId]);

  const ended = createEvent({
    eventId: endId,
    eventType: "call.ended",
    accountId,
    callId,
    timestamp: endTime,
    duration: 120,
    cost: 200,
  });

  const endResponse = await sendEvent(ended);

  if (endResponse.status !== 200) {
    throw new Error("Late ended event was rejected");
  }

  await waitForEvents([endId]);

  const call = await waitForCall(
    accountId,
    callId,
    "ENDED"
  );

  const usage = await getMonthlyUsage(
    accountId,
    endTime
  );

  if (!usage) {
    throw new Error("Historical monthly usage not created");
  }

  if (usage.totalDurationSeconds < 120) {
    throw new Error("Historical duration was not recorded");
  }

  const expectedMonth = new Date(
    Date.UTC(
      endTime.getUTCFullYear(),
      endTime.getUTCMonth(),
      1
    )
  );

  if (
    call.usageMonth.getTime() !== expectedMonth.getTime()
  ) {
    throw new Error("Late call assigned to wrong usage month");
  }

  return {
    eventTimestamp: endTime.toISOString(),
    usageMonth: call.usageMonth,
    durationSeconds: call.durationSeconds,
  };
}

// --------------------------------------------------
// 5. MALFORMED PAYLOAD SCENARIO
// --------------------------------------------------

async function testMalformed() {
  const validBase = {
    event_id: `sim_${runId}_malformed`,
    event_type: "call.started",
    account_id: "acct_005",
    call_id: `sim_${runId}_malformed_call`,
    timestamp: new Date().toISOString(),
    duration_seconds: 0,
    cost_cents: 0,
  };

  const testCases = [
    {
      name: "missing required field",
      body: JSON.stringify({
        ...validBase,
        call_id: undefined,
      }),
    },
    {
      name: "wrong field type",
      body: JSON.stringify({
        ...validBase,
        duration_seconds: "not-a-number",
      }),
    },
    {
      name: "truncated JSON",
      body: '{"event_id":',
    },
    {
      name: "unknown event type",
      body: JSON.stringify({
        ...validBase,
        event_type: "call.paused",
      }),
    },
    {
      name: "empty body",
      body: "",
    },
  ];

  const results = [];

  for (const testCase of testCases) {
    const response = await sendRawRequest(
      testCase.body,
      true
    );

    results.push({
      name: testCase.name,
      status: response.status,
    });

    if (response.status !== 400) {
      throw new Error(
        `${testCase.name} returned ${response.status}, expected 400`
      );
    }
  }

  return results;
}

// --------------------------------------------------
// 6. BAD SIGNATURE SCENARIO
// --------------------------------------------------

async function testBadSignature() {
  const event = createEvent({
    eventId: `sim_${runId}_bad_signature`,
    eventType: "call.started",
    accountId: "acct_006",
    callId: `sim_${runId}_bad_signature_call`,
    timestamp: new Date(),
  });

  const rawBody = JSON.stringify(event);

  // Missing signature.

  const missing = await sendRawRequest(
    rawBody,
    false
  );

  // Invalid signature format.

  const malformed = await sendRawRequest(
    rawBody,
    "invalid-signature"
  );

  // Correct format, incorrect signature.

  const incorrect = await sendRawRequest(
    rawBody,
    "0".repeat(64)
  );

  const results = [
    { name: "missing signature", status: missing.status },
    { name: "malformed signature", status: malformed.status },
    { name: "incorrect signature", status: incorrect.status },
  ];

  for (const result of results) {
    if (result.status !== 401) {
      throw new Error(
        `${result.name} returned ${result.status}, expected 401`
      );
    }
  }

  return results;
}

// --------------------------------------------------
// 7. CAP BURST SCENARIO
// --------------------------------------------------

async function testCapBurst() {
  const accountId = "acct_010";
  const account = await getAccount(accountId);

  const now = new Date();

  const usageBefore = await getMonthlyUsage(
    accountId,
    now
  );

  const initialDuration =
    usageBefore?.totalDurationSeconds || 0;

  const cap = account.monthlyCapSeconds;

  // Exactly 40 calls.
  // Ensure their combined duration exceeds the cap.

  const callCount = 40;

  const durationPerCall = Math.max(
    120,
    Math.floor(cap / callCount) + 1
  );

  const totalExpectedDuration =
    callCount * durationPerCall;

  const ids = createIds("cap_burst");

  const startedEvents = [];
  const endedEvents = [];

  const startIds = [];
  const endIds = [];

  // First send all 40 started events.

  for (let i = 1; i <= callCount; i++) {
    const callId = ids.callId(`call_${i}`);
    const startId = ids.eventId(`started_${i}`);
    const endId = ids.eventId(`ended_${i}`);

    const started = createEvent({
      eventId: startId,
      eventType: "call.started",
      accountId,
      callId,
      timestamp: new Date(
        now.getTime() - durationPerCall * 1000
      ),
    });

    startedEvents.push(started);
    startIds.push(startId);

    const ended = createEvent({
      eventId: endId,
      eventType: "call.ended",
      accountId,
      callId,
      timestamp: now,
      duration: durationPerCall,
      cost: 100,
    });

    endedEvents.push(ended);
    endIds.push(endId);
  }

  for (const event of startedEvents) {
    const response = await sendEvent(event);

    if (response.status !== 200) {
      throw new Error("Cap-burst started event rejected");
    }
  }

  await waitForEvents(startIds);

  // Then send all 40 ended events.

  for (const event of endedEvents) {
    const response = await sendEvent(event);

    if (response.status !== 200) {
      throw new Error("Cap-burst ended event rejected");
    }
  }

  await waitForEvents(endIds);

  const usageAfter = await getMonthlyUsage(
    accountId,
    now
  );

  if (!usageAfter) {
    throw new Error("Monthly usage record was not created");
  }

  const actualDuration =
    usageAfter.totalDurationSeconds - initialDuration;

  const actualCalls =
    usageAfter.completedCalls -
    (usageBefore?.completedCalls || 0);

  if (actualDuration !== totalExpectedDuration) {
    throw new Error(
      `Expected ${totalExpectedDuration} additional seconds, got ${actualDuration}`
    );
  }

  if (actualCalls !== callCount) {
    throw new Error(
      `Expected ${callCount} completed calls, got ${actualCalls}`
    );
  }

  if (
    usageAfter.totalDurationSeconds <= usageAfter.capSeconds
  ) {
    throw new Error("Monthly cap was not exceeded");
  }

  if (!usageAfter.capExceededAt) {
    throw new Error("Cap exceeded timestamp was not recorded");
  }

  return {
    accountId,
    monthlyCapSeconds: usageAfter.capSeconds,
    callsSent: callCount,
    durationPerCall,
    additionalDuration: actualDuration,
    totalMonthlyDuration: usageAfter.totalDurationSeconds,
    capExceededAt: usageAfter.capExceededAt,
  };
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  log("Webhook simulation started", {
    runId,
    apiUrl: WEBHOOK_URL,
  });

  await runScenario("normal", testNormal);
  await runScenario("duplicate", testDuplicate);
  await runScenario("out_of_order", testOutOfOrder);
  await runScenario("late", testLateEvent);
  await runScenario("malformed", testMalformed);
  await runScenario("bad_signature", testBadSignature);
  await runScenario("cap_burst", testCapBurst);

  log("Simulation completed", {
    runId,
    passed,
    failed,
    total: passed + failed,
    logFile: LOG_FILE,
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    log("Simulation stopped unexpectedly", {
      error: error.message,
      stack: error.stack,
    });

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
