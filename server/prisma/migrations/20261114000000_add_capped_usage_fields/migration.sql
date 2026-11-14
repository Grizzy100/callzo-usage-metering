ALTER TABLE "monthly_usage"
ADD COLUMN "actual_duration_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "excess_duration_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "excess_cost_cents" INTEGER NOT NULL DEFAULT 0;

UPDATE "monthly_usage"
SET
  "actual_duration_seconds" = "total_duration_seconds",
  "excess_duration_seconds" = GREATEST(
    "total_duration_seconds" - "cap_seconds",
    0
  ),
  "excess_cost_cents" = CASE
    WHEN "total_duration_seconds" = 0 THEN 0
    ELSE "total_cost_cents" -
      ROUND(
        "total_cost_cents"::numeric *
        LEAST("total_duration_seconds", "cap_seconds") /
        "total_duration_seconds"
      )::integer
  END,
  "total_cost_cents" = CASE
    WHEN "total_duration_seconds" = 0 THEN "total_cost_cents"
    ELSE ROUND(
      "total_cost_cents"::numeric *
      LEAST("total_duration_seconds", "cap_seconds") /
      "total_duration_seconds"
    )::integer
  END,
  "total_duration_seconds" = LEAST(
    "total_duration_seconds",
    "cap_seconds"
  ),
  "cap_exceeded_at" = CASE
    WHEN "total_duration_seconds" > "cap_seconds"
    THEN COALESCE("cap_exceeded_at", CURRENT_TIMESTAMP)
    ELSE "cap_exceeded_at"
  END;
