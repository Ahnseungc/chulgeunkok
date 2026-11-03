import { z } from 'zod';

/** 국내 휴대폰 번호 → E.164 (`010-1234-5678` → `+821012345678`) */
export const KoreanMobilePhone = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^01[016789]\d{7,8}$/, '휴대폰 번호를 확인해 주세요.'))
  .transform((digits) => `+82${digits.slice(1)}`);

/** 매장 시간대 기준 날짜 `YYYY-MM-DD` */
export const LocalDate = z.string().date();

export const IsoDateTime = z.string().datetime({ offset: true });

export const Weekday = z.number().int().min(0).max(6);

export const Reason = z.string().trim().min(1).max(200);

export const IdempotencyKey = z.string().uuid();

export const HeadcountBand = z.enum(['UNDER_5', 'FIVE_OR_MORE', 'UNKNOWN']);

export const StoreIdQuery = z.object({ storeId: z.string().min(1) });
