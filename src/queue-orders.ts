import pLimit from "p-limit";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { vtexFetch } from "./vtex.js";

type ListOrdersResponse = {
  list: Array<{
    orderId: string;
    sequence: string;
    status: string;
    creationDate: string;
    lastChange: string;
    salesChannel?: string;
  }>;
  paging: {
    total: number;
    pages: number;
    currentPage: number;
    perPage: number;
  };
};

function parseDays() {
  const arg = process.argv.find((value) => value.startsWith("--days="));
  if (!arg) return config.ingestDays;
  const parsed = Number(arg.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : config.ingestDays;
}

function parseDateArg(flag: string) {
  const arg = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (!arg) return null;
  const value = arg.split("=")[1];
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function formatDate(date: Date) {
  return date.toISOString();
}

const salesChannelFilter = process.env.SALES_CHANNEL || "1";

async function queueOrdersForRange(dayStart: Date, dayEnd: Date) {
  let page = 1;
  let totalPages = 1;
  let queued = 0;
  const perPage = 100;

  while (page <= totalPages) {
    const response = await vtexFetch<ListOrdersResponse>({
      path: "/api/oms/pvt/orders",
      query: {
        page,
        per_page: perPage,
        f_creationDate: `creationDate:[${formatDate(dayStart)} TO ${formatDate(dayEnd)}]`,
        salesChannelId: salesChannelFilter,
      },
    });

    totalPages = Math.min(response.paging.pages, 30);
    if (response.list.length > 0) {
      const data = response.list.map((order) => ({
        vtexOrderId: order.orderId,
        vtexSequence: order.sequence || null,
        status: order.status || null,
        creationDate: order.creationDate ? new Date(order.creationDate) : null,
        lastChange: order.lastChange ? new Date(order.lastChange) : null,
      }));
      const result = await prisma.orderQueue.createMany({
        data,
        skipDuplicates: true,
      });
      queued += result.count;
    }
    page += 1;
  }

  return queued;
}

async function purgeNonSalesChannelOrders() {
  let totalDeleted = 0;
  while (true) {
    const ids = await prisma.order.findMany({
      where: {
        OR: [
          { salesChannel: { not: salesChannelFilter } },
          { salesChannel: null },
        ],
      },
      select: { id: true },
      take: 500,
    });
    if (ids.length === 0) break;
    const orderIds = ids.map((row) => row.id);

    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderPayment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderShipping.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderPromotion.deleteMany({ where: { orderId: { in: orderIds } } });
    const result = await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    totalDeleted += result.count;
  }

  if (totalDeleted > 0) {
    console.log(`Removed ${totalDeleted} orders not in salesChannel ${salesChannelFilter}.`);
  }
}

async function main() {
  await purgeNonSalesChannelOrders();
  const now = new Date();
  const from = parseDateArg("--from");
  const to = parseDateArg("--to");
  const days = parseDays();

  let startDate = from ? new Date(from) : new Date(now);
  let endDate = to ? new Date(to) : new Date(now);

  if (!from || !to) {
    startDate.setDate(endDate.getDate() - days);
  }

  const endDateInclusive = new Date(endDate);
  endDateInclusive.setDate(endDateInclusive.getDate() + 1);
  const ranges = buildDailyRanges(startDate, endDateInclusive);

  console.log(
    `Queueing orders range=${formatDate(startDate)}..${formatDate(endDate)} days=${days}`
  );

  const limiter = pLimit(config.vtexConcurrency);
  const results = await Promise.all(
    ranges.map((range) =>
      limiter(async () => {
        const dayLabel = formatDate(range.start).slice(0, 10);
        const startTime = Date.now();
        console.log(`Fetching ${dayLabel}`);
        const queued = await queueOrdersForRange(range.start, range.end);
        const elapsed = Date.now() - startTime;
        console.log(`Done ${dayLabel} queued=${queued} (${elapsed}ms)`);
        return queued;
      })
    )
  );
  const totalQueued = results.reduce((sum, value) => sum + value, 0);

  console.log(`Done. Queued ${totalQueued} orders.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
