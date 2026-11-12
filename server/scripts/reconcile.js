import prisma from "../src/config/db.js";
import reconcileMonthlyUsage from "../src/services/reconciliation.service.js";

const currentMonth = new Date().toISOString().slice(0, 7);
const month = process.argv[2] || currentMonth;

async function main() {
  try {
    const result = await reconcileMonthlyUsage(month);

    console.log("Reconciliation completed:");
    console.log(result);
  } catch (error) {
    console.error("Reconciliation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();