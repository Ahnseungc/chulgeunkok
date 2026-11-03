import { createDbClient, type PrismaClient } from '@chulgeunkok/db';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** 개발 중 HMR로 클라이언트가 여러 개 생기지 않도록 전역에 1개만 둔다. */
export const db = globalForPrisma.prisma ?? createDbClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
