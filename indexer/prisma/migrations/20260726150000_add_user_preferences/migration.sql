-- CreateTable
CREATE TABLE "UserPreferences" (
    "walletAddress" TEXT NOT NULL,
    "priceAlerts" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "currency" TEXT NOT NULL DEFAULT 'XLM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("walletAddress")
);
