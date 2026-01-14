import pLimit from "p-limit";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { fetchMasterdataEmail } from "./masterdata.js";

const CONCURRENCY = 5;
const PROGRESS_BAR_WIDTH = 24;

function parseLimit() {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (!arg) return null;
  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function renderProgress(state: {
  processed: number;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
}) {
  const percent = state.total === 0 ? 100 : Math.round((state.processed / state.total) * 100);
  const filled = state.total === 0 ? PROGRESS_BAR_WIDTH : Math.round(
    (state.processed / state.total) * PROGRESS_BAR_WIDTH
  );
  const bar =
    "#".repeat(Math.min(filled, PROGRESS_BAR_WIDTH)) +
    "-".repeat(Math.max(PROGRESS_BAR_WIDTH - filled, 0));
  const line = `[${bar}] ${percent}% (${state.processed}/${state.total}) updated:${state.updated} skipped:${state.skipped} failed:${state.failed}`;
  process.stdout.write(`\r${line}`);
  if (state.processed === state.total) {
    process.stdout.write("\n");
  }
}

async function main() {
  const limit = parseLimit();
  const customers = await prisma.customer.findMany({
    where: {
      vtexCustomerId: { not: null },
      email: { not: null, endsWith: ".ct.vtex.com.br" }
    },
    select: {
      id: true,
      vtexCustomerId: true,
      email: true
    },
    orderBy: { updatedAt: "desc" }
  });

  const batch = limit ? customers.slice(0, limit) : customers;
  const state = {
    processed: 0,
    total: batch.length,
    updated: 0,
    skipped: 0,
    failed: 0
  };

  if (batch.length === 0) {
    console.log("Nenhum cliente com email e userId encontrado.");
    return;
  }

  renderProgress(state);
  const limiter = pLimit(CONCURRENCY);
  const tasks = batch.map((customer) =>
    limiter(async () => {
      try {
        const masterdataEmail = await fetchMasterdataEmail({
          userId: customer.vtexCustomerId ?? undefined
        });
        if (!masterdataEmail) {
          state.skipped += 1;
          return;
        }
        const current = customer.email?.toLowerCase() || "";
        const incoming = masterdataEmail.toLowerCase();
        if (current === incoming) {
          state.skipped += 1;
          return;
        }

        await prisma.customer.update({
          where: { id: customer.id },
          data: { email: masterdataEmail }
        });
        state.updated += 1;
      } catch (error) {
        state.failed += 1;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          console.warn(`Email duplicado ignorado para customer ${customer.id}`);
        } else {
          console.warn(`Falha ao atualizar customer ${customer.id}`, error);
        }
      } finally {
        state.processed += 1;
        renderProgress(state);
      }
    })
  );

  await Promise.all(tasks);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
