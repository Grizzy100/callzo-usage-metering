import prisma from "../config/db.js";

async function getAccountUsage(req, res) {
  const { accountId } = req.params;

  const month =
    req.query.month || new Date().toISOString().slice(0, 7);

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({
      success: false,
      message: "Month must use YYYY-MM format",
    });
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(
    Date.UTC(year, monthNumber - 1, 1)
  );

  // Single query fetch avoiding sequential roundtrips
  const account = await prisma.account.findUnique({
    where: { accountId },
    select: {
      id: true,
      accountId: true,
      monthlyCapSeconds: true,
      monthlyUsage: {
        where: { month: monthDate },
        take: 1,
      },
    },
  });

  if (!account) {
    return res.status(404).json({
      success: false,
      message: "Account not found",
    });
  }

  const usage = account.monthlyUsage?.[0] ?? null;

  const totalDurationSeconds =
    usage?.totalDurationSeconds ?? 0;

  return res.status(200).json({
    success: true,
    data: {
      accountId: account.accountId,
      month,
      monthlyCapSeconds: account.monthlyCapSeconds,
      totalDurationSeconds,
      totalCostCents: usage?.totalCostCents ?? 0,
      actualDurationSeconds: usage?.actualDurationSeconds ?? 0,
      excessDurationSeconds: usage?.excessDurationSeconds ?? 0,
      excessCostCents: usage?.excessCostCents ?? 0,
      completedCalls: usage?.completedCalls ?? 0,
      remainingSeconds: Math.max(
        account.monthlyCapSeconds - totalDurationSeconds,
        0
      ),
      capExceeded: Boolean(usage?.capExceededAt),
      capExceededAt: usage?.capExceededAt ?? null,
    },
  });
}

export default getAccountUsage;