-- CreateEnum
CREATE TYPE "QrCardLayout" AS ENUM ('STAND', 'STICKER');

-- AlterTable
ALTER TABLE "StoreQrToken" ADD COLUMN     "tokenCiphertext" TEXT;

-- CreateTable
CREATE TABLE "StoreQrDesign" (
    "storeId" TEXT NOT NULL,
    "layout" "QrCardLayout" NOT NULL DEFAULT 'STAND',
    "color" TEXT NOT NULL DEFAULT 'kok',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "logo" BYTEA,
    "logoMime" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreQrDesign_pkey" PRIMARY KEY ("storeId")
);

-- AddForeignKey
ALTER TABLE "StoreQrDesign" ADD CONSTRAINT "StoreQrDesign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

