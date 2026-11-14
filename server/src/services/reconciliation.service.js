
import prisma from "../config/db.js";

function getMonthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must use YYYY-MM format");
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Invalid month");
  }

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));

  return { start, end };
}

async function reconcileMonthlyUsage(month) {
  const { start, end } = getMonthRange(month);

  return prisma.$transaction(async (tx) => {

    // Prevent two reconciliations of the same month
    // from running simultaneously.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`reconcile:${month}`}, 0)
      )::text AS lock_result
    `;

    // Step 1: Delete existing monthly aggregates.
    await tx.$executeRaw`
      DELETE FROM monthly_usage
      WHERE month = ${start}::date
    `;

    // Step 2: Recalculate usage from raw events.
    const updatedAccounts = await tx.$queryRaw`
      WITH first_terminal AS (
        SELECT DISTINCT ON (account_id, call_id)
          account_id,
          call_id,
          event_type,
          event_timestamp,
          duration_seconds,
          cost_cents
        FROM call_events
        WHERE event_type::text IN ('CALL_ENDED', 'CALL_FAILED')
        ORDER BY
          account_id,
          call_id,
          received_at ASC,
          id ASC
      ),

      terminal_events AS (
        SELECT
          events.account_id,
          events.call_id,
          date_trunc('month', event_timestamp)::date AS usage_month,
          events.event_timestamp,
          events.duration_seconds,
          events.cost_cents,
          account.monthly_cap_seconds
        FROM first_terminal AS events
        JOIN accounts AS account
          ON account.id = events.account_id
        WHERE
          event_type::text = 'CALL_ENDED'
          AND event_timestamp >= ${start}
          AND event_timestamp < ${end}
      ),

      ordered_events AS (
        SELECT
          terminal_events.*,
          COALESCE(
            SUM(duration_seconds) OVER (
              PARTITION BY account_id, usage_month
              ORDER BY event_timestamp, call_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::integer AS prior_duration
        FROM terminal_events
      ),

      allocated_events AS (
        SELECT
          *,
          LEAST(
            duration_seconds,
            GREATEST(monthly_cap_seconds - prior_duration, 0)
          )::integer AS billable_duration,
          GREATEST(
            duration_seconds - LEAST(
              duration_seconds,
              GREATEST(monthly_cap_seconds - prior_duration, 0)
            ),
            0
          )::integer AS excess_duration
        FROM ordered_events
      ),

      usage_totals AS (
        SELECT
          account_id,
          usage_month,
          SUM(billable_duration)::integer AS total_duration,
          SUM(
            CASE
              WHEN duration_seconds = 0 THEN cost_cents
              ELSE ROUND(
                cost_cents::numeric * billable_duration /
                duration_seconds
              )::integer
            END
          )::integer AS total_cost,
          SUM(duration_seconds)::integer AS actual_duration,
          SUM(excess_duration)::integer AS excess_duration,
          SUM(
            cost_cents -
            CASE
              WHEN duration_seconds = 0 THEN cost_cents
              ELSE ROUND(
                cost_cents::numeric * billable_duration /
                duration_seconds
              )::integer
            END
          )::integer AS excess_cost,
          COUNT(*)::integer AS completed_calls,
          MAX(monthly_cap_seconds) AS cap_seconds
        FROM allocated_events
        GROUP BY account_id, usage_month
      )

      INSERT INTO monthly_usage (
        id,
        account_id,
        month,
        total_duration_seconds,
        total_cost_cents,
        actual_duration_seconds,
        excess_duration_seconds,
        excess_cost_cents,
        completed_calls,
        cap_seconds,
        cap_exceeded_at,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        usage.account_id,
        usage.usage_month,
        usage.total_duration,
        usage.total_cost,
        usage.actual_duration,
        usage.excess_duration,
        usage.excess_cost,
        usage.completed_calls,
        usage.cap_seconds,
        CASE
          WHEN usage.excess_duration > 0
          THEN NOW()
          ELSE NULL
        END,
        NOW(),
        NOW()
      FROM usage_totals AS usage
      RETURNING account_id
    `;

    return {
      month,
      accountsReconciled: updatedAccounts.length,
    };
  });
}

export default reconcileMonthlyUsage;
