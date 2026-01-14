import pLimit from "p-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { fetchOrderDetail, upsertOrder } from "./order-processor.js";
import { vtexFetch } from "./vtex.js";

type ListOrdersResponse = {
  list: Array<{
    orderId: string;
    sequence: string;
    status: string;
    creationDate: string;
    lastChange: string;
  }>;
  paging: {
    total: number;
    pages: number;
    currentPage: number;
    perPage: number;
  };
};

function rangeLastDays(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { start, end };
}

function formatDate(date: Date) {
  return date.toISOString();
}

function resolveIngestDays() {
  const arg = process.argv.find((value) => value.startsWith("--days="));
  if (arg) {
    const parsed = Number(arg.split("=")[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const positional = process.argv.find((value) => /^\d+$/.test(value));
  if (positional) {
    const parsed = Number(positional);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return config.ingestDays;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function buildDailyRanges(start: Date, end: Date) {
  const ranges: Array<{ start: Date; end: Date }> = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    ranges.push({ start: new Date(cursor), end: next });
    cursor.setDate(cursor.getDate() + 1);
  }
  return ranges;
}

async function listOrders(page: number, days: number) {
  const { start, end } = rangeLastDays(days);
  const dateRange = `${formatDate(start)} TO ${formatDate(end)}`;
  return vtexFetch<ListOrdersResponse>({
    path: "/api/oms/pvt/orders",
    query: {
      page,
      per_page: Math.min(config.vtexPerPage, 100),
      f_creationDate: `creationDate:[${dateRange}]`,
    },
  });
}

async function main() {
  const ingestDays = resolveIngestDays();
  const rescanMode = hasFlag("--rescan");
  const backfillMode = hasFlag("--backfill");
  const skipExisting = rescanMode || backfillMode;
  const oldestOrder = await prisma.order.findFirst({
    where: { creationDate: { not: null } },
    orderBy: { creationDate: "asc" },
    select: { creationDate: true },
  });
  const now = new Date();
  let startDate = new Date(now);
  let endDate = new Date(now);
  if (rescanMode) {
    if (oldestOrder?.creationDate) {
      startDate = new Date(oldestOrder.creationDate);
    } else {
      console.warn("No oldest order found, falling back to last days.");
      startDate.setDate(startDate.getDate() - ingestDays);
    }
  } else if (backfillMode) {
    if (oldestOrder?.creationDate) {
      endDate = new Date(oldestOrder.creationDate);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - ingestDays);
    } else {
      console.warn("No oldest order found, falling back to last days.");
      startDate.setDate(startDate.getDate() - ingestDays);
    }
  } else {
    startDate.setDate(startDate.getDate() - ingestDays);
  }

  console.log(
    `Ingest mode=${rescanMode ? "rescan" : backfillMode ? "backfill" : "recent"} range=${formatDate(
      startDate
    )}..${formatDate(endDate)} skipExisting=${skipExisting}`
  );

  const endDateInclusive = new Date(endDate);
  endDateInclusive.setDate(endDateInclusive.getDate() + 1);
  const dayRanges = buildDailyRanges(startDate, endDateInclusive);
  const limit = pLimit(config.vtexConcurrency);
  let processed = 0;

  for (const { start: dayStart, end: dayEnd } of dayRanges) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const dayLabel = formatDate(dayStart).slice(0, 10);
      console.log(`Fetching day ${dayLabel} page ${page}`);
      const response = await vtexFetch<ListOrdersResponse>({
        path: "/api/oms/pvt/orders",
        query: {
          page,
          per_page: Math.min(config.vtexPerPage, 100),
          f_creationDate: `creationDate:[${formatDate(dayStart)} TO ${formatDate(dayEnd)}]`,
        },
      });
      totalPages = Math.min(response.paging.pages, 30);
      console.log(
        `Day ${dayLabel} page ${page} -> ${response.list.length} orders (total ${response.paging.total})`
      );

      const tasks = response.list.map((order) =>
        limit(async () => {
          if (skipExisting) {
            const exists = await prisma.order.findUnique({
              where: { vtexOrderId: order.orderId },
              select: { id: true },
            });
            if (exists) {
              processed += 1;
              return;
            }
          }
          const detail = await fetchOrderDetail(order.orderId);
          await upsertOrder(detail);
          processed += 1;
          if (processed % 10 === 0) {
            console.log(`Processed ${processed} orders`);
          }
        })
      );

      await Promise.all(tasks);
      page += 1;
    }
  }

  console.log(`Done. Total orders processed: ${processed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
