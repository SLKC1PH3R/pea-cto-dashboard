-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'CRYPTO';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "isSavingsPlan" BOOLEAN NOT NULL DEFAULT false;
