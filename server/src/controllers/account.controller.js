import { z } from "zod";
import prisma from "../config/db.js";

const querySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  search: z.string().trim().max(50).optional(),
});

async function getAccounts(req, res) {
  const validation = querySchema.safeParse(req.query);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: validation.error.flatten(),
    });
  }

  const page = Number(validation.data.page || 1);
  const limit = Number(validation.data.limit || 10);
  const search = validation.data.search || "";

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

  const [accounts, total] = await prisma.$transaction([
    prisma.account.findMany({
      where,
      orderBy: { accountId: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        accountId: true,
        monthlyCapSeconds: true,
        createdAt: true,
      },
    }),

    prisma.account.count({ where }),
  ]);

  return res.status(200).json({
    success: true,
    data: accounts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export default getAccounts;