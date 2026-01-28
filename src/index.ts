import Fastify from "fastify";
import cors from "@fastify/cors";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [/^http:\/\/localhost:\d+$/],
});

app.get("/health", async () => ({ status: "ok" }));

type MetricsQuery = {
  start?: string;
  end?: string;
  limit?: string;
  sort?: "quantity" | "revenue";
  status?: string;
  all?: string;
  groupBy?: "day" | "week" | "month";
  utmSource?: string;
};

const reportTimezone = process.env.REPORT_TIMEZONE || "America/Sao_Paulo";
const defaultSalesChannel = process.env.SALES_CHANNEL || "1";

function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function coerceDateInput(value: string | undefined, fallback: Date): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateInTimezone(parsed, reportTimezone);
    }
  }
  return formatDateInTimezone(fallback, reportTimezone);
}

function buildDateRange(query: MetricsQuery) {
  const now = new Date();
  const fallbackStart = new Date(now);
  fallbackStart.setDate(now.getDate() - 30);
  return {
    startDate: coerceDateInput(query.start, fallbackStart),
    endDate: coerceDateInput(query.end, now),
  };
}

function parseStatusList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStatusFilter(query: MetricsQuery, alias: string) {
  const statusList = parseStatusList(query.status);
  if (statusList.length === 0) {
    return { statusList, filter: Prisma.empty };
  }
  return {
    statusList,
    filter: Prisma.sql`AND ${Prisma.raw(`${alias}."status"`)} = ANY(${statusList})`,
  };
}

function buildSalesChannelFilter(alias: string) {
  if (!defaultSalesChannel) {
    return Prisma.empty;
  }
  return Prisma.sql`AND ${Prisma.raw(`${alias}."salesChannel"`)} = ${defaultSalesChannel}`;
}

function buildMonthSeries(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }
  start.setUTCDate(1);
  end.setUTCDate(1);
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endCursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= endCursor) {
    months.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

app.get<{ Querystring: MetricsQuery }>("/metrics/summary", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const [totals] = await prisma.$queryRaw<
    Array<{
      orders: bigint;
      customers: bigint;
      totalValue: bigint | null;
      itemsValue: bigint | null;
      shippingValue: bigint | null;
      discountsValue: bigint | null;
      taxValue: bigint | null;
    }>
  >`
    SELECT
      COUNT(*) AS orders,
      COUNT(DISTINCT "customerId") AS customers,
      COALESCE(SUM("totalValue"), 0) AS "totalValue",
      COALESCE(SUM("itemsValue"), 0) AS "itemsValue",
      COALESCE(SUM("shippingValue"), 0) AS "shippingValue",
      COALESCE(SUM("discountsValue"), 0) AS "discountsValue",
      COALESCE(SUM("taxValue"), 0) AS "taxValue"
    FROM "Order" o
    WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
      BETWEEN ${startDate}::date AND ${endDate}::date
    ${statusFilter}
    ${salesChannelFilter}
  `;

  const orders = Number(totals?.orders ?? 0n);
  const customers = Number(totals?.customers ?? 0n);
  const totalRevenue = Number(totals?.totalValue ?? 0n);
  const avgOrderValue = orders > 0 ? Math.round(totalRevenue / orders) : 0;

  return {
    start: startDate,
    end: endDate,
    orders,
    customers,
    totalRevenue,
    avgOrderValue,
    itemsValue: Number(totals?.itemsValue ?? 0n),
    shippingValue: Number(totals?.shippingValue ?? 0n),
    discountsValue: Number(totals?.discountsValue ?? 0n),
    taxValue: Number(totals?.taxValue ?? 0n),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/orders", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const groupBy = request.query.groupBy || "day";
  
  let utmSourceFilter: Prisma.Sql;
  if (!request.query.utmSource) {
    utmSourceFilter = Prisma.empty;
  } else if (request.query.utmSource === "Direto") {
    // "Direto" means no UTM source (NULL or empty)
    utmSourceFilter = Prisma.sql`AND (o."utmSource" IS NULL OR o."utmSource" = '' OR o."utmSource" = '(none)')`;
  } else {
    utmSourceFilter = Prisma.sql`AND o."utmSource" = ${request.query.utmSource}`;
  }

  let dateGrouping: Prisma.Sql;
  let dateLabel: string;

  if (groupBy === "week") {
    dateGrouping = Prisma.sql`TO_CHAR(
      DATE_TRUNC('week', (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date),
      'YYYY-MM-DD'
    )`;
    dateLabel = "week";
  } else if (groupBy === "month") {
    dateGrouping = Prisma.sql`TO_CHAR(
      DATE_TRUNC('month', (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date),
      'YYYY-MM-DD'
    )`;
    dateLabel = "month";
  } else {
    dateGrouping = Prisma.sql`TO_CHAR(
      (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date,
      'YYYY-MM-DD'
    )`;
    dateLabel = "day";
  }

  const rows = await prisma.$queryRaw<
    Array<{ period: string; orders: bigint; revenue: bigint }>
  >`
    SELECT ${dateGrouping} AS period,
           COUNT(*) AS orders,
           COALESCE(SUM("totalValue"), 0) AS revenue
      FROM "Order" o
     WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
       BETWEEN ${startDate}::date AND ${endDate}::date
     ${statusFilter}
     ${salesChannelFilter}
     ${utmSourceFilter}
  GROUP BY period
  ORDER BY period ASC
  `;

  return {
    start: startDate,
    end: endDate,
    groupBy,
    series: rows.map((row) => ({
      [dateLabel]: row.period,
      orders: Number(row.orders),
      revenue: Number(row.revenue),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/products", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const limit = Math.min(Number(request.query.limit || 20), 100);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const sort = request.query.sort === "quantity" ? "quantity" : "revenue";
  const orderBy =
    sort === "quantity"
      ? Prisma.sql`ORDER BY quantity DESC, revenue DESC`
      : Prisma.sql`ORDER BY revenue DESC, quantity DESC`;
  const rows = await prisma.$queryRaw<
    Array<{
      skuId: string | null;
      productId: string | null;
      skuName: string | null;
      productName: string | null;
      quantity: bigint;
      revenue: bigint;
    }>
  >`
    SELECT oi."skuId" AS "skuId",
           oi."productId" AS "productId",
           s."name" AS "skuName",
           p."name" AS "productName",
           COALESCE(SUM(oi."quantity"), 0) AS quantity,
           COALESCE(SUM(COALESCE(oi."sellingPrice", oi."price", 0) * oi."quantity"), 0) AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
 LEFT JOIN "Sku" s ON s."id" = oi."skuId"
 LEFT JOIN "Product" p ON p."id" = oi."productId"
     WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
       BETWEEN ${startDate}::date AND ${endDate}::date
     ${statusFilter}
     ${salesChannelFilter}
  GROUP BY oi."skuId", oi."productId", s."name", p."name"
  ${orderBy}
     LIMIT ${limit}
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      skuId: row.skuId,
      productId: row.productId,
      skuName: row.skuName,
      productName: row.productName,
      quantity: Number(row.quantity),
      revenue: Number(row.revenue),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/customers", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const limit = Math.min(Number(request.query.limit || 20), 100);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");

  const [cohorts, topCustomers, customerTypeStats] = await Promise.all([
    prisma.$queryRaw<
      Array<{ new_customers: bigint; returning_customers: bigint }>
    >`
      WITH first_orders AS (
        SELECT "customerId", MIN("creationDate") AS first_order
          FROM "Order" o
         WHERE "customerId" IS NOT NULL
         ${statusFilter}
         ${salesChannelFilter}
      GROUP BY "customerId"
      )
      SELECT
        COALESCE(SUM(CASE WHEN (first_order AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
          BETWEEN ${startDate}::date AND ${endDate}::date THEN 1 ELSE 0 END), 0) AS new_customers,
        COALESCE(SUM(CASE WHEN (first_order AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
          < ${startDate}::date THEN 1 ELSE 0 END), 0) AS returning_customers
      FROM first_orders
    `,
    prisma.$queryRaw<
      Array<{
        customerId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        orders: bigint;
        revenue: bigint;
      }>
    >`
      SELECT o."customerId" AS "customerId",
             c."email" AS "email",
             c."firstName" AS "firstName",
             c."lastName" AS "lastName",
             COUNT(*) AS orders,
             COALESCE(SUM(o."totalValue"), 0) AS revenue
       FROM "Order" o
   LEFT JOIN "Customer" c ON c."id" = o."customerId"
       WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
         BETWEEN ${startDate}::date AND ${endDate}::date
       ${statusFilter}
       ${salesChannelFilter}
    GROUP BY o."customerId", c."email", c."firstName", c."lastName"
    ORDER BY revenue DESC
       LIMIT ${limit}
    `,
    prisma.$queryRaw<
      Array<{
        isCorporate: boolean;
        totalCustomers: bigint;
        totalOrders: bigint;
        totalRevenue: bigint;
        avgOrderValue: bigint;
      }>
    >`
      SELECT c."isCorporate" AS "isCorporate",
             COUNT(DISTINCT o."customerId") AS "totalCustomers",
             COUNT(*) AS "totalOrders",
             COALESCE(SUM(o."totalValue"), 0) AS "totalRevenue",
             CASE WHEN COUNT(*) > 0 
               THEN COALESCE(SUM(o."totalValue"), 0) / COUNT(*)
               ELSE 0 
             END AS "avgOrderValue"
       FROM "Order" o
  LEFT JOIN "Customer" c ON c."id" = o."customerId"
      WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
        BETWEEN ${startDate}::date AND ${endDate}::date
        AND o."customerId" IS NOT NULL
      ${statusFilter}
      ${salesChannelFilter}
   GROUP BY c."isCorporate"
    `,
  ]);

  const cohortRow = cohorts[0] || { new_customers: 0n, returning_customers: 0n };

  const pfStats = customerTypeStats.find((row) => row.isCorporate === false) || {
    totalCustomers: 0n,
    totalOrders: 0n,
    totalRevenue: 0n,
    avgOrderValue: 0n,
  };

  const pjStats = customerTypeStats.find((row) => row.isCorporate === true) || {
    totalCustomers: 0n,
    totalOrders: 0n,
    totalRevenue: 0n,
    avgOrderValue: 0n,
  };

  return {
    start: startDate,
    end: endDate,
    cohorts: {
      newCustomers: Number(cohortRow.new_customers),
      returningCustomers: Number(cohortRow.returning_customers),
    },
    byType: {
      pf: {
        totalCustomers: Number(pfStats.totalCustomers),
        totalOrders: Number(pfStats.totalOrders),
        totalRevenue: Number(pfStats.totalRevenue),
        avgOrderValue: Number(pfStats.avgOrderValue),
      },
      pj: {
        totalCustomers: Number(pjStats.totalCustomers),
        totalOrders: Number(pjStats.totalOrders),
        totalRevenue: Number(pjStats.totalRevenue),
        avgOrderValue: Number(pjStats.avgOrderValue),
      },
    },
    topCustomers: topCustomers.map((row) => ({
      customerId: row.customerId,
      email: row.email,
      name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      orders: Number(row.orders),
      revenue: Number(row.revenue),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/retention", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const rows = await prisma.$queryRaw<
    Array<{
      period_start: Date;
      customers: bigint | null;
      previous_customers: bigint | null;
      retained_customers: bigint | null;
    }>
  >`
    WITH periods AS (
      SELECT generate_series(
        date_trunc('month', ${startDate}::date),
        date_trunc('month', ${endDate}::date),
        interval '1 month'
      )::date AS period_start
    ),
    orders_by_period AS (
      SELECT date_trunc(
               'month',
               (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})
             )::date AS period_start,
             o."customerId" AS customer_id
        FROM "Order" o
       WHERE o."customerId" IS NOT NULL
         AND (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
           BETWEEN ${startDate}::date AND ${endDate}::date
       ${statusFilter}
       ${salesChannelFilter}
    GROUP BY period_start, o."customerId"
    ),
    counts AS (
      SELECT p.period_start,
             COUNT(DISTINCT obp.customer_id) AS customers
        FROM periods p
   LEFT JOIN orders_by_period obp
          ON obp.period_start = p.period_start
    GROUP BY p.period_start
    ),
    retained AS (
      SELECT p.period_start,
             COUNT(DISTINCT cur.customer_id) AS retained_customers
        FROM periods p
   LEFT JOIN orders_by_period cur
          ON cur.period_start = p.period_start
   LEFT JOIN orders_by_period prev
          ON prev.period_start = (p.period_start - interval '1 month')
         AND prev.customer_id = cur.customer_id
       WHERE prev.customer_id IS NOT NULL
    GROUP BY p.period_start
    )
    SELECT p.period_start,
           c.customers AS customers,
           prev.customers AS previous_customers,
           COALESCE(r.retained_customers, 0) AS retained_customers
      FROM periods p
 LEFT JOIN counts c
        ON c.period_start = p.period_start
 LEFT JOIN counts prev
        ON prev.period_start = (p.period_start - interval '1 month')
 LEFT JOIN retained r
        ON r.period_start = p.period_start
  ORDER BY p.period_start
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      periodStart: row.period_start,
      customers: Number(row.customers ?? 0n),
      previousCustomers: Number(row.previous_customers ?? 0n),
      retainedCustomers: Number(row.retained_customers ?? 0n),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/cohort", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const months = buildMonthSeries(startDate, endDate);
  const rows = await prisma.$queryRaw<
    Array<{
      cohort_month: Date;
      order_month: Date;
      customers: bigint;
    }>
  >`
    WITH orders AS (
      SELECT o."customerId" AS customer_id,
             date_trunc(
               'month',
               (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})
             )::date AS order_month
        FROM "Order" o
       WHERE o."customerId" IS NOT NULL
         AND (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
           BETWEEN ${startDate}::date AND ${endDate}::date
       ${statusFilter}
       ${salesChannelFilter}
    GROUP BY o."customerId", order_month
    ),
    first_orders AS (
      SELECT customer_id, MIN(order_month) AS cohort_month
        FROM orders
    GROUP BY customer_id
    )
    SELECT f.cohort_month AS cohort_month,
           o.order_month AS order_month,
           COUNT(DISTINCT o.customer_id) AS customers
      FROM first_orders f
      JOIN orders o
        ON o.customer_id = f.customer_id
     WHERE o.order_month >= f.cohort_month
  GROUP BY f.cohort_month, o.order_month
  ORDER BY f.cohort_month, o.order_month
  `;

  return {
    start: startDate,
    end: endDate,
    months,
    items: rows.map((row) => ({
      cohortMonth: row.cohort_month,
      orderMonth: row.order_month,
      customers: Number(row.customers),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/new-vs-returning", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const rows = await prisma.$queryRaw<
    Array<{
      period_start: Date;
      new_customers: bigint | null;
      returning_customers: bigint | null;
    }>
  >`
    WITH periods AS (
      SELECT generate_series(
        date_trunc('month', ${startDate}::date),
        date_trunc('month', ${endDate}::date),
        interval '1 month'
      )::date AS period_start
    ),
    first_orders AS (
      SELECT o."customerId" AS customer_id,
             MIN(date_trunc(
               'month',
               (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})
             ))::date AS first_month
        FROM "Order" o
       WHERE o."customerId" IS NOT NULL
       ${statusFilter}
       ${salesChannelFilter}
    GROUP BY o."customerId"
    ),
    customers_in_period AS (
      SELECT o."customerId" AS customer_id,
             date_trunc(
               'month',
               (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})
             )::date AS order_month
        FROM "Order" o
       WHERE o."customerId" IS NOT NULL
         AND (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
           BETWEEN ${startDate}::date AND ${endDate}::date
       ${statusFilter}
       ${salesChannelFilter}
     GROUP BY o."customerId", order_month
    )
    SELECT p.period_start,
           COALESCE(COUNT(DISTINCT CASE WHEN f.first_month = cp.order_month THEN cp.customer_id END), 0) AS new_customers,
           COALESCE(COUNT(DISTINCT CASE WHEN f.first_month < cp.order_month THEN cp.customer_id END), 0) AS returning_customers
      FROM periods p
 LEFT JOIN customers_in_period cp
        ON cp.order_month = p.period_start
 LEFT JOIN first_orders f
        ON f.customer_id = cp.customer_id
  GROUP BY p.period_start
  ORDER BY p.period_start
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      periodStart: row.period_start,
      newOrders: Number(row.new_customers ?? 0n),
      returningOrders: Number(row.returning_customers ?? 0n),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/utm", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const limit = Math.min(Number(request.query.limit || 200), 500);
  const includeAll = request.query.all === "true";
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const rows = await prisma.$queryRaw<
    Array<{
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      orders: bigint;
      revenue: bigint;
    }>
  >`
    SELECT COALESCE(o."utmSource", '(none)') AS "utmSource",
           COALESCE(o."utmMedium", '(none)') AS "utmMedium",
           COALESCE(o."utmCampaign", '(none)') AS "utmCampaign",
           COUNT(*) AS orders,
           COALESCE(SUM(o."totalValue"), 0) AS revenue
      FROM "Order" o
     WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
       BETWEEN ${startDate}::date AND ${endDate}::date
     ${statusFilter}
     ${salesChannelFilter}
  GROUP BY "utmSource", "utmMedium", "utmCampaign"
  ORDER BY revenue DESC
     ${includeAll ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      orders: Number(row.orders),
      revenue: Number(row.revenue),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/shipping", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const limit = Math.min(Number(request.query.limit || 20), 100);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const rows = await prisma.$queryRaw<
    Array<{
      carrier: string | null;
      deliveryChannel: string | null;
      shippingSla: string | null;
      shipments: bigint;
      revenue: bigint;
      shippingValue: bigint;
    }>
  >`
    SELECT s."carrier" AS "carrier",
           s."deliveryChannel" AS "deliveryChannel",
           s."shippingSla" AS "shippingSla",
           COUNT(*) AS shipments,
           COALESCE(SUM(o."totalValue"), 0) AS revenue,
           COALESCE(SUM(s."shippingValue"), 0) AS "shippingValue"
      FROM "OrderShipping" s
      JOIN "Order" o ON o."id" = s."orderId"
     WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
       BETWEEN ${startDate}::date AND ${endDate}::date
     ${statusFilter}
     ${salesChannelFilter}
  GROUP BY s."carrier", s."deliveryChannel", s."shippingSla"
  ORDER BY shipments DESC
     LIMIT ${limit}
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      carrier: row.carrier,
      deliveryChannel: row.deliveryChannel,
      shippingSla: row.shippingSla,
      shipments: Number(row.shipments),
      revenue: Number(row.revenue),
      shippingValue: Number(row.shippingValue),
    })),
  };
});

app.get<{ Querystring: MetricsQuery }>("/metrics/payments", async (request) => {
  const { startDate, endDate } = buildDateRange(request.query);
  const limit = Math.min(Number(request.query.limit || 20), 100);
  const { filter: statusFilter } = buildStatusFilter(request.query, "o");
  const salesChannelFilter = buildSalesChannelFilter("o");
  const rows = await prisma.$queryRaw<
    Array<{
      paymentGroup: string | null;
      paymentName: string | null;
      payments: bigint;
      revenue: bigint;
    }>
  >`
    SELECT p."paymentGroup" AS "paymentGroup",
           p."paymentName" AS "paymentName",
           COUNT(*) AS payments,
           COALESCE(SUM(p."value"), 0) AS revenue
      FROM "OrderPayment" p
      JOIN "Order" o ON o."id" = p."orderId"
     WHERE (o."creationDate" AT TIME ZONE 'UTC' AT TIME ZONE ${reportTimezone})::date
       BETWEEN ${startDate}::date AND ${endDate}::date
     ${statusFilter}
     ${salesChannelFilter}
  GROUP BY p."paymentGroup", p."paymentName"
  ORDER BY revenue DESC
     LIMIT ${limit}
  `;

  return {
    start: startDate,
    end: endDate,
    items: rows.map((row) => ({
      paymentGroup: row.paymentGroup,
      paymentName: row.paymentName,
      payments: Number(row.payments),
      revenue: Number(row.revenue),
    })),
  };
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: "0.0.0.0" });
