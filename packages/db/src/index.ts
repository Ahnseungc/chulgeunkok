import type { Prisma, PrismaClient } from '@prisma/client';

// 앱은 @prisma/client를 직접 의존하지 않고 이 패키지로 타입·클라이언트를 받는다 (인스턴스 1개 보장)
export * from '@prisma/client';
export { createDbClient } from './client';

/** 서비스 함수가 받는 DB. 트랜잭션 안팎 모두 */
export type DbClient = PrismaClient | Prisma.TransactionClient;
