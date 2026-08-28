-- CreateTable
CREATE TABLE "LendingListing" (
    "listingId" BIGINT NOT NULL,
    "lender" TEXT NOT NULL,
    "nftContract" TEXT NOT NULL,
    "tokenId" BIGINT NOT NULL,
    "declaredPriceUsd" DECIMAL(32,7) NOT NULL,
    "interestScheduleBps" JSONB NOT NULL,
    "maxDurationDays" INTEGER NOT NULL,
    "minCollateralBufferBps" INTEGER NOT NULL,
    "liquidationThresholdBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAtLedger" INTEGER NOT NULL,
    "updatedAtLedger" INTEGER NOT NULL,

    CONSTRAINT "LendingListing_pkey" PRIMARY KEY ("listingId")
);

-- CreateIndex
CREATE INDEX "LendingListing_lender_idx" ON "LendingListing"("lender");

-- CreateIndex
CREATE INDEX "LendingListing_status_idx" ON "LendingListing"("status");

-- CreateIndex
CREATE INDEX "LendingListing_updatedAtLedger_idx" ON "LendingListing"("updatedAtLedger");
