/**
 * 임금명세서 보내기(교부). 정본: docs/specs/payslip §4.2·§6·§7
 * 한 요청의 명세서는 한 트랜잭션에서 모두 보내거나 모두 실패한다. 푸시는 트랜잭션 뒤, 실패해도 되돌리지 않는다.
 */

import type { Payslip, Prisma, PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';
import { getPushSender, type PushSender } from '@/server/integrations/push';

import { totalsOf } from '../model/payslip-calc';

import { notifyPayslipsSent } from './payslip-push';
import { employeeNumberOf, lockPayslip, toLineDraft } from './payslip-sync-service';

interface SendContext {
  storeId: string;
  actorUserId: string;
  now: Date;
}

/** POST /stores/:storeId/payslips/send — §7 */
export async function sendPayslips(
  db: PrismaClient,
  input: { storeId: string; payslipIds: string[]; actorUserId: string; now: Date; push?: PushSender },
): Promise<{ sent: number }> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'PAYSLIP_WRITE' }, db);
  const payslipIds = [...new Set(input.payslipIds)];
  // 정렬된 순서로 잠가 동시 일괄 보내기끼리 교착하지 않게 한다
  const ordered = [...payslipIds].sort();
  await db.$transaction(async (tx) => {
    for (const payslipId of ordered) await sendOne(tx, input, payslipId);
  });
  await notifyPayslipsSent(db, { payslipIds, push: input.push ?? getPushSender() });
  return { sent: payslipIds.length };
}

/** POST /payslips/:id/send — §7. 매장을 찾아 sendPayslips에 1건으로 넘긴다 */
export async function sendPayslip(
  db: PrismaClient,
  input: { payslipId: string; actorUserId: string; now: Date; push?: PushSender },
): Promise<{ sent: number }> {
  const target = await db.payslip.findUnique({ where: { id: input.payslipId }, select: { storeId: true } });
  if (!target) throw new ApiError('NOT_FOUND');
  return sendPayslips(db, { ...input, storeId: target.storeId, payslipIds: [input.payslipId] });
}

/** 보내기 전 확인 (§3.3·§3.4·§4.2·§8). 실패하면 어느 명세서인지 details로 알려 준다 */
function assertSendable(payslip: Payslip): void {
  const details = { payslipId: payslip.id };
  if (payslip.status !== 'DRAFT') throw new ApiError('PAYSLIP_NOT_EDITABLE', { details });
  if (!payslip.payDate) throw new ApiError('PAYSLIP_PAY_DATE_REQUIRED', { details });
  if (payslip.netPay < 0) throw new ApiError('PAYSLIP_NET_NEGATIVE', { details });
  if (payslip.version > 1 && !payslip.correctionNote) throw new ApiError('PAYSLIP_CORRECTION_NOTE_REQUIRED', { details });
}

/** 잠그고 다시 읽은 DRAFT를 SENT로. 같은 기간 이전 SENT는 SUPERSEDED (§4.2) */
async function sendOne(tx: Prisma.TransactionClient, context: SendContext, payslipId: string): Promise<void> {
  await lockPayslip(tx, payslipId);
  const payslip = await tx.payslip.findUnique({
    where: { id: payslipId },
    include: { lines: true, membership: { include: { user: { select: { name: true } } } } },
  });
  if (!payslip || payslip.storeId !== context.storeId) throw new ApiError('NOT_FOUND', { details: { payslipId } });
  const totals = totalsOf(payslip.lines.map(toLineDraft));
  assertSendable({ ...payslip, ...totals });

  await tx.payslip.updateMany({
    where: { membershipId: payslip.membershipId, periodStart: payslip.periodStart, status: 'SENT' },
    data: { status: 'SUPERSEDED' },
  });
  await tx.payslip.update({
    where: { id: payslip.id },
    data: {
      status: 'SENT',
      sentAt: context.now,
      sentById: context.actorUserId,
      // 스냅숏 확정 (§3.1): 성명·사원번호는 보낸 시점 값, 합계는 저장된 줄에서 다시 센다
      employeeName: payslip.membership.user.name,
      employeeNumber: await employeeNumberOf(tx, payslip.membership),
      ...totals,
    },
  });
}
