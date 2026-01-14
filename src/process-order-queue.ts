import pLimit from "p-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { fetchOrderDetail, upsertOrder } from "./order-processor.js";

const DEFAULT_BATCH = 50;
const MAX_ATTEMPTS = 3;

function parseLimit() {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (!arg) return DEFAULT_BATCH;
  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH;
}

function includeFailed() {
  return process.argv.includes("--include-failed");
}

async function fetchBatch(limit: number, includeFailedRows: boolean) {
  return prisma.orderQueue.findMany({
    where: {
      processingStatus: includeFailedRows ? { in: ["pending", "failed"] } : "pending",
    },
    select: {
      id: true,
      vtexOrderId: true,
      attempts: true,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

async function processItem(item: { id: string; vtexOrderId: string; attempts: number }) {
  await prisma.orderQueue.update({
    where: { id: item.id },
    data: {
      processingStatus: "processing",
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  const detail = await fetchOrderDetail(item.vtexOrderId);
  await upsertOrder(detail);
  await prisma.orderQueue.delete({ where: { id: item.id } });
}

async function markFailed(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.orderQueue.update({
    where: { id },
    data: {
      processingStatus: "failed",
      lastError: message.slice(0, 2000),
    },
  });
}

async function main() {
  const limit = parseLimit();
  const includeFailedRows = includeFailed();
  const limiter = pLimit(config.vtexConcurrency);
  let processed = 0;
  let failed = 0;

  while (true) {
    const batch = await fetchBatch(limit, includeFailedRows);
    if (batch.length === 0) break;
    console.log(`Processing batch ${batch.length} orders...`);

    await Promise.all(
      batch.map((item) =>
        limiter(async () => {
          try {
            if (item.attempts >= MAX_ATTEMPTS) {
              console.log(`Skipping ${item.vtexOrderId} (attempts ${item.attempts})`);
              return;
            }
            await processItem(item);
            processed += 1;
            console.log(`Processed ${item.vtexOrderId} (${processed})`);
          } catch (error) {
            failed += 1;
            await markFailed(item.id, error);
            const message = error instanceof Error ? error.message : String(error);
            console.log(`Failed ${item.vtexOrderId}: ${message}`);
          }
        })
      )
    );
  }

  console.log(`Done. Processed ${processed} orders. Failed ${failed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
