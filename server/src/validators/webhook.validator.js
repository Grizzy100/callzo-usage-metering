import { z } from "zod";

const webhookSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum([
    "call.started",
    "call.ended",
    "call.failed",
  ]),
  account_id: z.string().regex(/^acct_00[1-9]$|^acct_010$/),
  call_id: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),

  duration_seconds: z.number().int().nonnegative(),
  cost_cents: z.number().int().nonnegative(),

  destination_country: z.string().optional(),
}).strict();

export default webhookSchema;
