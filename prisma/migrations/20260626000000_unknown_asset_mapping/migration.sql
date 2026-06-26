-- CreateTable
CREATE TABLE "UnknownAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "isin" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnknownAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAssetMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL DEFAULT 'ACTION',
    "sector" TEXT,
    "region" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomAssetMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnknownAsset_userId_rawName_key" ON "UnknownAsset"("userId", "rawName");

-- CreateIndex
CREATE UNIQUE INDEX "CustomAssetMapping_userId_rawName_key" ON "CustomAssetMapping"("userId", "rawName");

-- AddForeignKey
ALTER TABLE "UnknownAsset" ADD CONSTRAINT "UnknownAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAssetMapping" ADD CONSTRAINT "CustomAssetMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
