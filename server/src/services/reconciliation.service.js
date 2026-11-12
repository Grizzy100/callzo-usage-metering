
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

      usage_totals AS (
        SELECT
          account_id,
          date_trunc('month', event_timestamp)::date AS usage_month,
          SUM(duration_seconds)::integer AS total_duration,
          SUM(cost_cents)::integer AS total_cost,
          COUNT(*)::integer AS completed_calls
        FROM first_terminal
        WHERE
          event_type::text = 'CALL_ENDED'
          AND event_timestamp >= ${start}
          AND event_timestamp < ${end}
        GROUP BY
          account_id,
          date_trunc('month', event_timestamp)::date
      )

      INSERT INTO monthly_usage (
        id,
        account_id,
        month,
        total_duration_seconds,
        total_cost_cents,
        completed_calls,
        cap_seconds,
        cap_exceeded_at,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        account.id,
        usage.usage_month,
        usage.total_duration,
        usage.total_cost,
        usage.completed_calls,
        account.monthly_cap_seconds,
        CASE
          WHEN usage.total_duration > account.monthly_cap_seconds
          THEN NOW()
          ELSE NULL
        END,
        NOW(),
        NOW()
      FROM usage_totals AS usage
      JOIN accounts AS account
        ON account.id = usage.account_id
      RETURNING account_id
    `;

    return {
      month,
      accountsReconciled: updatedAccounts.length,
    };
  });
}

export default reconcileMonthlyUsage;
