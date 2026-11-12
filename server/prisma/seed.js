import prisma from "../src/config/db.js";

const accountIds = Array.from(
  { length: 10 },
  (_, index) => `acct_${String(index + 1).padStart(3, "0")}`
);

const monthlyCapSeconds = Number(
  process.env.DEFAULT_MONTHLY_CAP_SECONDS || 600
);

if (!Number.isInteger(monthlyCapSeconds) || monthlyCapSeconds <= 0) {
  throw new Error("Monthly cap must be a positive integer");
}

async function seedAccounts() {
  try {
    for (const accountId of accountIds) {
      await prisma.account.upsert({
        where: { accountId },
        update: {},
        create: {
          accountId,
          monthlyCapSeconds,
        },
      });

      console.log(`Account ready: ${accountId}`);
    }

    console.log("Account seeding completed.");
  } finally {
    await prisma.$disconnect();
  }
}

seedAccounts().catch((error) => {
  console.error("Account seeding failed:", error);
  process.exitCode = 1;
});