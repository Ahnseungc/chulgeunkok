import { createHandoffCode } from '@/features/auth/server/handoff-service';
import { db } from '@/server/db';
import { defineRoute } from '@/server/http/define-route';

/** POST /api/v1/auth/handoff — 로그인된 기기에서 1회용 교환 코드 발급 (docs/specs/auth/README.md §6.2) */
export const POST = defineRoute({}, async ({ userId }) => createHandoffCode(db, { userId, now: new Date() }));
