-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PEA', 'CTO');

-- CreateEnum
CREATE TYPE "Broker" AS ENUM ('BOURSORAMA', 'TRADE_REPUBLIC');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('COURTAGE', 'GESTION', 'CHANGE', 'GARDE', 'AUTRE');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('ACTION', 'ETF_DISTRIBUANT', 'ETF_CAPITALISANT');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('CONFIRMED', 'PROJECTED');

-- CreateEnum
CREATE TYPE "DcaFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "WidgetType" AS ENUM ('TOTAL_VALUE', 'PNL_CHART', 'ALLOCATION_SECTOR', 'ALLOCATION_GEO', 'ALLOCATION_CURRENCY', 'BENCHMARK_COMPARISON', 'FEES_SUMMARY', 'DIVIDEND_CALENDAR', 'POSITIONS_TABLE', 'DEPOSITS_HISTORY', 'STOCK_VS_ETF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "broker" "Broker" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "openedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fee" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "FeeType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "region" TEXT,
    "currency" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "benchmarkTicker" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "status" "TxStatus" NOT NULL DEFAULT 'CONFIRMED',
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "dcaRuleId" TEXT,
    "sourceDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "withholding" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DcaRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "frequency" "DcaFrequency" NOT NULL,
    "firstExecution" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DcaRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "close" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mon dashboard',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "type" "WidgetType" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "config" JSONB,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Deposit_accountId_date_idx" ON "Deposit"("accountId", "date");

-- CreateIndex
CREATE INDEX "Fee_accountId_date_idx" ON "Fee"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ticker_key" ON "Asset"("ticker");

-- CreateIndex
CREATE INDEX "Asset_assetType_idx" ON "Asset"("assetType");

-- CreateIndex
CREATE UNIQUE INDEX "Position_accountId_assetId_key" ON "Position"("accountId", "assetId");

-- CreateIndex
CREATE INDEX "Transaction_positionId_date_idx" ON "Transaction"("positionId", "date");

-- CreateIndex
CREATE INDEX "Transaction_dcaRuleId_idx" ON "Transaction"("dcaRuleId");

-- CreateIndex
CREATE INDEX "Dividend_positionId_date_idx" ON "Dividend"("positionId", "date");

-- CreateIndex
CREATE INDEX "DcaRule_userId_idx" ON "DcaRule"("userId");

-- CreateIndex
CREATE INDEX "DcaRule_accountId_idx" ON "DcaRule"("accountId");

-- CreateIndex
CREATE INDEX "PriceHistory_ticker_idx" ON "PriceHistory"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "PriceHistory_ticker_date_key" ON "PriceHistory"("ticker", "date");

-- CreateIndex
CREATE INDEX "DashboardLayout_userId_idx" ON "DashboardLayout"("userId");

-- CreateIndex
CREATE INDEX "Widget_layoutId_idx" ON "Widget"("layoutId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_dcaRuleId_fkey" FOREIGN KEY ("dcaRuleId") REFERENCES "DcaRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DcaRule" ADD CONSTRAINT "DcaRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DcaRule" ADD CONSTRAINT "DcaRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DcaRule" ADD CONSTRAINT "DcaRule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "DashboardLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

