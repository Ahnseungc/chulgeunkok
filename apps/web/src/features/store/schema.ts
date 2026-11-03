import { z } from 'zod';

import { HeadcountBand, LocalDate } from '@/shared/schema/common';

const PayPeriodStartDay = z.number().int().min(1).max(28);

const StoreFields = z.object({
  name: z.string().trim().min(1).max(30),
  address: z.string().trim().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  payPeriodStartDay: PayPeriodStartDay,
});

const hasBothOrNoCoordinates = (value: { latitude?: number; longitude?: number }) =>
  (value.latitude == null) === (value.longitude == null);

const COORDINATES_MESSAGE = { message: '위도와 경도는 함께 입력해야 해요.' };

/** docs/specs/store §3.1 */
export const CreateStoreBody = StoreFields.extend({
  payPeriodStartDay: PayPeriodStartDay.default(1),
  headcountBand: HeadcountBand,
}).refine(hasBothOrNoCoordinates, COORDINATES_MESSAGE);

/** docs/specs/store §4 */
export const UpdateStoreBody = StoreFields.partial().refine(
  hasBothOrNoCoordinates,
  COORDINATES_MESSAGE,
);

/** docs/specs/store §6.1 */
export const DeclareHeadcountBody = z.object({
  band: HeadcountBand,
  effectiveFrom: LocalDate,
  note: z.string().max(200).optional(),
});
