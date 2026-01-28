import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { fetchMasterdataEmail } from "./masterdata.js";
import { vtexFetch } from "./vtex.js";

type AddressPayload = {
  addressType?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  geoCoordinates?: [number, number];
};

export type OrderDetail = {
  orderId: string;
  sequence: string;
  status: string;
  statusDescription?: string;
  creationDate: string;
  lastChange: string;
  totalValue?: number;
  itemsValue?: number;
  shippingValue?: number;
  discountsValue?: number;
  taxValue?: number;
  roundingValue?: number;
  value?: number;
  salesChannel?: string;
  seller?: string;
  affiliateId?: string;
  affiliateName?: string;
  origin?: string;
  source?: string;
  device?: string;
  userAgent?: string;
  currencyCode?: string;
  marketplaceOrderId?: string;
  marketingData?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    utmiCp?: string;
    utmiPart?: string;
    coupon?: string;
  };
  clientProfileData?: {
    userProfileId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    document?: string;
    documentType?: string;
    isCorporate?: boolean;
    corporateName?: string;
    tradeName?: string;
    stateInscription?: string;
    gender?: string;
    birthDate?: string;
  };
  items?: Array<{
    uniqueId?: string;
    id?: string;
    productId?: string;
    name?: string;
    refId?: string;
    quantity?: number;
    price?: number;
    listPrice?: number;
    sellingPrice?: number;
    manualPrice?: number;
    tax?: number;
    priceTags?: Array<{ name: string; value: number }>;
    seller?: string;
    measurementUnit?: string;
    unitMultiplier?: number;
    isGift?: boolean;
    skuName?: string;
    skuId?: string;
    ean?: string;
    brandName?: string;
  }>;
  shippingData?: {
    address?: AddressPayload;
    logisticsInfo?: Array<{
      deliveryChannel?: string;
      shippingEstimate?: string;
      shippingEstimateDate?: string;
      carrier?: string;
      shippingPrice?: number;
      deliveryWindow?: unknown;
      pickupPointId?: string;
      pickupFriendlyName?: string;
      slas?: Array<{ name: string }>;
    }>;
  };
  paymentData?: {
    transactions?: Array<{
      transactionId?: string;
      payments?: Array<{
        id?: string;
        paymentSystem?: string;
        group?: string;
        paymentSystemName?: string;
        installments?: number;
        value?: number;
        status?: string;
        authorizationId?: string;
        tid?: string;
        nsu?: string;
        acquirer?: string;
        firstDigits?: string;
        lastDigits?: string;
        cardHolder?: string;
        billingAddress?: AddressPayload;
      }>;
    }>;
  };
  ratesAndBenefitsData?: {
    benefits?: Array<{
      id?: string;
      name?: string;
      description?: string;
      discount?: number;
      couponCode?: string;
      isCumulative?: boolean;
      type?: string;
    }>;
    rateAndBenefitsIdentifiers?: Array<{
      id?: string;
      name?: string;
      matchedParameters?: Record<string, string>;
    }>;
  };
  totals?: Array<{
    id?: string;
    name?: string;
    value?: number;
  }>;
};

function toDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toGeoCoords(value?: [number, number]) {
  if (!value || value.length !== 2) return { geoLat: null, geoLng: null };
  const [lng, lat] = value;
  return {
    geoLat: typeof lat === "number" ? lat : null,
    geoLng: typeof lng === "number" ? lng : null,
  };
}

async function resolveCustomerEmail(
  userProfileId?: string,
  fallbackEmail?: string
): Promise<string | null> {
  if (!userProfileId) {
    return fallbackEmail || null;
  }
  const masterdataEmail = await fetchMasterdataEmail({
    userId: userProfileId,
    email: fallbackEmail,
  });
  return masterdataEmail || fallbackEmail || null;
}

async function upsertCustomer(detail: OrderDetail) {
  const data = detail.clientProfileData;
  if (!data) return null;
  const resolvedEmail = await resolveCustomerEmail(data.userProfileId, data.email || undefined);
  const payload = {
    vtexCustomerId: data.userProfileId || null,
    email: resolvedEmail,
    firstName: data.firstName || null,
    lastName: data.lastName || null,
    phone: data.phone || null,
    document: data.document || null,
    documentType: data.documentType || null,
    isCorporate: Boolean(data.isCorporate),
    corporateName: data.corporateName || null,
    tradeName: data.tradeName || null,
    stateInscr: data.stateInscription || null,
    gender: data.gender || null,
    birthDate: toDate(data.birthDate),
  };

  if (data.userProfileId) {
    return prisma.customer.upsert({
      where: { vtexCustomerId: data.userProfileId },
      create: payload,
      update: payload,
    });
  }

  if (data.email) {
    return prisma.customer.upsert({
      where: { email: data.email },
      create: payload,
      update: payload,
    });
  }

  return prisma.customer.create({ data: payload });
}

async function createAddress(address?: AddressPayload, type?: string) {
  if (!address) return null;
  const coords = toGeoCoords(address.geoCoordinates);
  return prisma.address.create({
    data: {
      type: type || address.addressType || null,
      street: address.street || null,
      number: address.number || null,
      complement: address.complement || null,
      neighborhood: address.neighborhood || null,
      city: address.city || null,
      state: address.state || null,
      postalCode: address.postalCode || null,
      country: address.country || null,
      geoLat: coords.geoLat,
      geoLng: coords.geoLng,
    },
  });
}

async function upsertProductAndSku(item: NonNullable<OrderDetail["items"]>[number]) {
  let product = null;
  if (item.productId) {
    product = await prisma.product.upsert({
      where: { vtexProductId: item.productId },
      create: {
        vtexProductId: item.productId,
        name: item.name || null,
        brand: item.brandName || null,
      },
      update: {
        name: item.name || null,
        brand: item.brandName || null,
      },
    });
  }

  let sku = null;
  if (item.skuId) {
    sku = await prisma.sku.upsert({
      where: { vtexSkuId: item.skuId },
      create: {
        vtexSkuId: item.skuId,
        productId: product?.id,
        name: item.skuName || item.name || null,
        refId: item.refId || null,
        ean: item.ean || null,
      },
      update: {
        productId: product?.id,
        name: item.skuName || item.name || null,
        refId: item.refId || null,
        ean: item.ean || null,
      },
    });
  }

  return { product, sku };
}

function buildTotals(detail: OrderDetail) {
  const totalsById = new Map<string, number>();
  for (const total of detail.totals ?? []) {
    if (total.id && typeof total.value === "number") {
      totalsById.set(total.id, total.value);
    }
  }

  const itemsValue = detail.itemsValue ?? totalsById.get("Items") ?? null;
  const shippingValue = detail.shippingValue ?? totalsById.get("Shipping") ?? null;
  const discountsValue = detail.discountsValue ?? totalsById.get("Discounts") ?? null;
  const taxValue = detail.taxValue ?? totalsById.get("Tax") ?? null;
  const totalValue =
    detail.totalValue ??
    detail.value ??
    (itemsValue !== null || shippingValue !== null || discountsValue !== null || taxValue !== null
      ? (itemsValue ?? 0) + (shippingValue ?? 0) - (discountsValue ?? 0) + (taxValue ?? 0)
      : null);

  return {
    totalValue,
    itemsValue,
    shippingValue,
    discountsValue,
    taxValue,
  };
}

export async function upsertOrder(detail: OrderDetail) {
  const totals = buildTotals(detail);
  const customer = await upsertCustomer(detail);
  const shippingAddress = await createAddress(detail.shippingData?.address, "shipping");
  const billingAddress = detail.paymentData?.transactions?.[0]?.payments?.[0]?.billingAddress
    ? await createAddress(detail.paymentData?.transactions?.[0]?.payments?.[0]?.billingAddress, "billing")
    : null;

  const order = await prisma.order.upsert({
    where: { vtexOrderId: detail.orderId },
    create: {
      vtexOrderId: detail.orderId,
      vtexSequence: detail.sequence || null,
      marketplaceOrderId: detail.marketplaceOrderId || null,
      status: detail.status || null,
      statusDescription: detail.statusDescription || null,
      isCompleted: detail.status === "invoiced" || detail.status === "delivered",
      creationDate: toDate(detail.creationDate),
      lastChange: toDate(detail.lastChange),
      totalValue: totals.totalValue,
      itemsValue: totals.itemsValue,
      shippingValue: totals.shippingValue,
      discountsValue: totals.discountsValue,
      taxValue: totals.taxValue,
      roundingValue: detail.roundingValue ?? null,
      salesChannel: detail.salesChannel || null,
      seller: detail.seller || null,
      affiliateId: detail.affiliateId || null,
      affiliateName: detail.affiliateName || null,
      origin: detail.origin || null,
      source: detail.source || null,
      device: detail.device || null,
      userAgent: detail.userAgent || null,
      utmSource: detail.marketingData?.utmSource || null,
      utmMedium: detail.marketingData?.utmMedium || null,
      utmCampaign: detail.marketingData?.utmCampaign || null,
      utmTerm: detail.marketingData?.utmTerm || null,
      utmContent: detail.marketingData?.utmContent || null,
      utmiCp: detail.marketingData?.utmiCp || null,
      utmiPart: detail.marketingData?.utmiPart || null,
      coupon: detail.marketingData?.coupon || null,
      currency: detail.currencyCode || null,
      raw: detail as unknown as object,
      customerId: customer?.id,
      billingAddressId: billingAddress?.id,
      shippingAddressId: shippingAddress?.id,
    },
    update: {
      vtexSequence: detail.sequence || null,
      marketplaceOrderId: detail.marketplaceOrderId || null,
      status: detail.status || null,
      statusDescription: detail.statusDescription || null,
      isCompleted: detail.status === "invoiced" || detail.status === "delivered",
      creationDate: toDate(detail.creationDate),
      lastChange: toDate(detail.lastChange),
      totalValue: totals.totalValue,
      itemsValue: totals.itemsValue,
      shippingValue: totals.shippingValue,
      discountsValue: totals.discountsValue,
      taxValue: totals.taxValue,
      roundingValue: detail.roundingValue ?? null,
      salesChannel: detail.salesChannel || null,
      seller: detail.seller || null,
      affiliateId: detail.affiliateId || null,
      affiliateName: detail.affiliateName || null,
      origin: detail.origin || null,
      source: detail.source || null,
      device: detail.device || null,
      userAgent: detail.userAgent || null,
      utmSource: detail.marketingData?.utmSource || null,
      utmMedium: detail.marketingData?.utmMedium || null,
      utmCampaign: detail.marketingData?.utmCampaign || null,
      utmTerm: detail.marketingData?.utmTerm || null,
      utmContent: detail.marketingData?.utmContent || null,
      utmiCp: detail.marketingData?.utmiCp || null,
      utmiPart: detail.marketingData?.utmiPart || null,
      coupon: detail.marketingData?.coupon || null,
      currency: detail.currencyCode || null,
      raw: detail as unknown as object,
      customerId: customer?.id,
      billingAddressId: billingAddress?.id,
      shippingAddressId: shippingAddress?.id,
    },
  });

  const items = detail.items ?? [];
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });

  for (const item of items) {
    const { product, sku } = await upsertProductAndSku(item);
    const discounts = item.priceTags?.reduce((sum, tag) => sum + (tag.value || 0), 0) ?? 0;
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        uniqueItemId: item.uniqueId || item.id || `${order.id}-${Math.random()}`,
        productId: product?.id,
        skuId: sku?.id,
        seller: item.seller || null,
        quantity: item.quantity || 0,
        price: item.price ?? null,
        listPrice: item.listPrice ?? null,
        sellingPrice: item.sellingPrice ?? null,
        manualPrice: item.manualPrice ?? null,
        totalPrice: item.sellingPrice ?? item.price ?? null,
        totalDiscount: discounts || null,
        tax: item.tax ?? null,
        measurementUnit: item.measurementUnit || null,
        unitMultiplier: item.unitMultiplier || null,
        isGift: Boolean(item.isGift),
        isCustomized: false,
        refId: item.refId || null,
        skuRefId: item.skuId || null,
      },
    });
  }

  await prisma.orderPayment.deleteMany({ where: { orderId: order.id } });
  for (const transaction of detail.paymentData?.transactions ?? []) {
    for (const payment of transaction.payments ?? []) {
      await prisma.orderPayment.create({
        data: {
          orderId: order.id,
          transactionId: transaction.transactionId || null,
          paymentId: payment.id || null,
          paymentSystem: payment.paymentSystem || null,
          paymentGroup: payment.group || null,
          paymentName: payment.paymentSystemName || null,
          installments: payment.installments ?? null,
          value: payment.value ?? null,
          status: payment.status || null,
          authorizationId: payment.authorizationId || null,
          tid: payment.tid || null,
          nsu: payment.nsu || null,
          gateway: payment.acquirer || null,
          cardBin: payment.firstDigits || null,
          cardLast4: payment.lastDigits || null,
          cardHolder: payment.cardHolder || null,
        },
      });
    }
  }

  await prisma.orderShipping.deleteMany({ where: { orderId: order.id } });
  for (const logistics of detail.shippingData?.logisticsInfo ?? []) {
    await prisma.orderShipping.create({
      data: {
        orderId: order.id,
        addressId: shippingAddress?.id,
        deliveryChannel: logistics.deliveryChannel || null,
        shippingSla: logistics.slas?.[0]?.name || null,
        carrier: logistics.carrier || null,
        shippingEstimate: logistics.shippingEstimate || null,
        shippingEstimateDate: toDate(logistics.shippingEstimateDate),
        shippingValue: logistics.shippingPrice ?? null,
        deliveryWindow: logistics.deliveryWindow
          ? (logistics.deliveryWindow as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        pickupPointId: logistics.pickupPointId || null,
        pickupFriendlyName: logistics.pickupFriendlyName || null,
        isDelivered: detail.status === "delivered",
      },
    });
  }

  await prisma.orderPromotion.deleteMany({ where: { orderId: order.id } });
  
  // Extrair cupom de rateAndBenefitsIdentifiers se existir
  const couponFromIdentifiers = detail.ratesAndBenefitsData?.rateAndBenefitsIdentifiers
    ?.map(identifier => identifier.matchedParameters?.["couponCode@Marketing"])
    .find(code => code);
  
  for (const benefit of detail.ratesAndBenefitsData?.benefits ?? []) {
    // Cupom pode vir de: benefit.couponCode, rateAndBenefitsIdentifiers, ou marketingData.coupon
    const couponCode = benefit.couponCode || couponFromIdentifiers || detail.marketingData?.coupon || null;
    
    await prisma.orderPromotion.create({
      data: {
        orderId: order.id,
        promotionId: benefit.id || null,
        name: benefit.name || null,
        description: benefit.description || null,
        value: benefit.discount ?? null,
        isCumulative: benefit.isCumulative ?? null,
        type: benefit.type || null,
        couponCode: couponCode,
        raw: benefit as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return order;
}

export async function fetchOrderDetail(orderId: string) {
  return vtexFetch<OrderDetail>({
    path: `/api/oms/pvt/orders/${orderId}`,
  });
}
