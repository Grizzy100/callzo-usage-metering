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

  const account = await prisma.account.findUnique({
    where: { accountId },
    select: {
      id: true,
      accountId: true,
      monthlyCapSeconds: true,
    },
  });

  if (!account) {
    return res.status(404).json({
      success: false,
      message: "Account not found",
    });
  }

  const [year, monthNumber] = month.split("-").map(Number);

  const monthDate = new Date(
    Date.UTC(year, monthNumber - 1, 1)
  );

  const usage = await prisma.monthlyUsage.findUnique({
    where: {
      accountId_month: {
        accountId: account.id,
        month: monthDate,
      },
    },
  });

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