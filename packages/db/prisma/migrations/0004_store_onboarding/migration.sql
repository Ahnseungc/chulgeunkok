-- CreateEnum
CREATE TYPE "PlaceProvider" AS ENUM ('KAKAO');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "businessNumber" TEXT,
ADD COLUMN     "businessVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "placeId" TEXT,
ADD COLUMN     "placeProvider" "PlaceProvider";


-- ─── 수기 추가 ────────────────────────────────────────────

-- 같은 가게를 운영 중인 매장 두 곳으로 등록하지 못한다 (폐업 매장은 제외)
CREATE UNIQUE INDEX "Store_place_active_key"
  ON "Store" ("placeProvider", "placeId")
  WHERE "placeId" IS NOT NULL AND "status" <> 'CLOSED';

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_place_pair_check"
  CHECK (("placeProvider" IS NULL) = ("placeId" IS NULL));

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_businessNumber_check"
  CHECK ("businessNumber" IS NULL OR "businessNumber" ~ '^[0-9]{10}$');
