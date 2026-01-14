-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "vtexCustomerId" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "document" TEXT,
    "documentType" TEXT,
    "isCorporate" BOOLEAN NOT NULL DEFAULT false,
    "corporateName" TEXT,
    "tradeName" TEXT,
    "stateInscr" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "type" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "vtexProductId" TEXT NOT NULL,
    "name" TEXT,
    "brand" TEXT,
    "categoryId" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "vtexSkuId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT,
    "refId" TEXT,
    "ean" TEXT,
    "manufacturerCode" TEXT,
    "height" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "vtexOrderId" TEXT NOT NULL,
    "vtexSequence" TEXT,
    "marketplaceOrderId" TEXT,
    "status" TEXT,
    "statusDescription" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "creationDate" TIMESTAMP(3),
    "lastChange" TIMESTAMP(3),
    "totalValue" INTEGER,
    "itemsValue" INTEGER,
    "shippingValue" INTEGER,
    "discountsValue" INTEGER,
    "taxValue" INTEGER,
    "roundingValue" INTEGER,
    "salesChannel" TEXT,
    "seller" TEXT,
    "affiliateId" TEXT,
    "affiliateName" TEXT,
    "origin" TEXT,
    "source" TEXT,
    "device" TEXT,
    "userAgent" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "utmiCp" TEXT,
    "utmiPart" TEXT,
    "currency" TEXT,
    "locale" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "billingAddressId" TEXT,
    "shippingAddressId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "uniqueItemId" TEXT NOT NULL,
    "productId" TEXT,
    "skuId" TEXT,
    "seller" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER,
    "listPrice" INTEGER,
    "sellingPrice" INTEGER,
    "manualPrice" INTEGER,
    "totalPrice" INTEGER,
    "totalDiscount" INTEGER,
    "tax" INTEGER,
    "measurementUnit" TEXT,
    "unitMultiplier" DOUBLE PRECISION,
    "isGift" BOOLEAN NOT NULL DEFAULT false,
    "isCustomized" BOOLEAN NOT NULL DEFAULT false,
    "refId" TEXT,
    "skuRefId" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "transactionId" TEXT,
    "paymentId" TEXT,
    "paymentSystem" TEXT,
    "paymentGroup" TEXT,
    "paymentName" TEXT,
    "installments" INTEGER,
    "value" INTEGER,
    "status" TEXT,
    "authorizationId" TEXT,
    "tid" TEXT,
    "nsu" TEXT,
    "gateway" TEXT,
    "cardBin" TEXT,
    "cardLast4" TEXT,
    "cardHolder" TEXT,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShipping" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "addressId" TEXT,
    "deliveryChannel" TEXT,
    "shippingSla" TEXT,
    "carrier" TEXT,
    "shippingEstimate" TEXT,
    "shippingEstimateDate" TIMESTAMP(3),
    "shippingValue" INTEGER,
    "deliveryWindow" JSONB,
    "pickupPointId" TEXT,
    "pickupFriendlyName" TEXT,
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredDate" TIMESTAMP(3),

    CONSTRAINT "OrderShipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPromotion" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "promotionId" TEXT,
    "name" TEXT,
    "description" TEXT,
    "value" INTEGER,
    "isCumulative" BOOLEAN,
    "type" TEXT,
    "raw" JSONB,

    CONSTRAINT "OrderPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cursor" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_vtexCustomerId_key" ON "Customer"("vtexCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_vtexProductId_key" ON "Product"("vtexProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_vtexSkuId_key" ON "Sku"("vtexSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_vtexOrderId_key" ON "Order"("vtexOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_uniqueItemId_key" ON "OrderItem"("orderId", "uniqueItemId");

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipping" ADD CONSTRAINT "OrderShipping_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipping" ADD CONSTRAINT "OrderShipping_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPromotion" ADD CONSTRAINT "OrderPromotion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
