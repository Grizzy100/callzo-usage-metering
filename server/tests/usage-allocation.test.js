import test from "node:test";
import assert from "node:assert/strict";

import { allocateUsage } from "../src/services/event-processing.service.js";

test("caps billable duration and prorates excess cost", () => {
  assert.deepEqual(
    allocateUsage(100, 200, 50),
    {
      billableDurationSeconds: 50,
      billableCostCents: 100,
      excessDurationSeconds: 50,
      excessCostCents: 100,
    }
  );
});

test("records a fully excess call without billable usage", () => {
  assert.deepEqual(
    allocateUsage(100, 200, 0),
    {
      billableDurationSeconds: 0,
      billableCostCents: 0,
      excessDurationSeconds: 100,
      excessCostCents: 200,
    }
  );
});

test("keeps a call fully billable when allowance is sufficient", () => {
  assert.deepEqual(
    allocateUsage(100, 200, 150),
    {
      billableDurationSeconds: 100,
      billableCostCents: 200,
      excessDurationSeconds: 0,
      excessCostCents: 0,
    }
  );
});
