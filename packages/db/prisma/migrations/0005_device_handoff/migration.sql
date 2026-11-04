-- CreateTable
CREATE TABLE "DeviceHandoffCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceHandoffCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceHandoffCode_codeHash_key" ON "DeviceHandoffCode"("codeHash");

-- CreateIndex
CREATE INDEX "DeviceHandoffCode_expiresAt_idx" ON "DeviceHandoffCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "DeviceHandoffCode" ADD CONSTRAINT "DeviceHandoffCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

