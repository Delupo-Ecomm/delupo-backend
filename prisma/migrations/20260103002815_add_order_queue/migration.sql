-- CreateTable
CREATE TABLE "OrderQueue" (
    "id" TEXT NOT NULL,
    "vtexOrderId" TEXT NOT NULL,
    "vtexSequence" TEXT,
    "status" TEXT,
    "creationDate" TIMESTAMP(3),
    "lastChange" TIMESTAMP(3),
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderQueue_vtexOrderId_key" ON "OrderQueue"("vtexOrderId");
