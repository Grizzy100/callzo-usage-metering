// To fetch multiple accounts

import { z } from "zod";
import prisma from "../config/db.js";
import { accountQuerySchema } from "../validators/account.validator.js";

async function getAccounts(req, res) {
  const validation = accountQuerySchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: z.flattenError(validation.error),
    });
  }

  const page = Number(validation.data.page || 1);  //default is 1
  const limit = Number(validation.data.limit || 10);  //default is 10
  const search = validation.data.search || "";
  const sortBy = validation.data.sort_by || "accountId";
  const sortDir = validation.data.sort_dir || "asc";
  const includeUsage = validation.data.include_usage === "true";

  if (page < 1 || limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message: "Page must be at least 1 and limit must be between 1 and 100",
    });
  }

  const where = search
    ? {
        accountId: {
          contains: search,
          mode: "insensitive",
        },
      }
    : {};

  // Parse target month for usage if requested
  const targetMonthStr = validation.data.month || new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = targetMonthStr.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, monthNumber - 1, 1));

  const selectFields = {
    accountId: true,
    monthlyCapSeconds: true,
    createdAt: true,
    ...(includeUsage && {
      monthlyUsage: {
        where: { month: monthDate },
        take: 1,
        select: {
          totalDurationSeconds: true,
          totalCostCents: true,
          actualDurationSeconds: true,
          excessDurationSeconds: true,
          excessCostCents: true,
          completedCalls: true,
          capExceededAt: true,
        },
      },
    }),
  };

  // Run data fetch and count in a single atomic transaction
  const [accounts, total] = await prisma.$transaction([
    prisma.account.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * limit,
      take: limit,
      select: selectFields,
    }),
    prisma.account.count({ where }),
  ]);

  // Cleanly format response, flattening usage if included (avoids N+1 client queries)
  const formattedAccounts = accounts.map((account) => {
    if (!includeUsage) {
      return account;
    }

    const { monthlyUsage, ...rest } = account;
    return {
      ...rest,
      usage: monthlyUsage?.[0] || null,
    };
  });

  return res.status(200).json({
    success: true,
    data: formattedAccounts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      sortBy,
      sortDir,
    },
  });
}

export default getAccounts;
