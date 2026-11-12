/**
 * 임금명세서 도착·정정 푸시. 정본: docs/specs/payslip §6
 * 교부는 앱 안에서 열람 가능해진 시점이므로 발송 실패는 로그만 남기고 던지지 않는다.
 */

import type { DbClient, Payslip } from '@chulgeunkok/db';

import { formatWon } from '@/features/payroll/model/payroll-types';
import type { PushMessage, PushSender } from '@/server/integrations/push';
import { notifyDevices } from '@/server/integrations/push-devices';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-11-01` → `11/1` */
const monthDay = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;

/** §6 알림 표. 정정 알림엔 금액을 넣지 않는다. `<N>월`은 기간 시작 달 */
export function payslipPushMessage(payslip: Payslip, storeName: string): PushMessage {
  const path = `/me/payslips/${payslip.id}`;
  if (payslip.version > 1) {
    const lastDay = new Date(payslip.periodEnd.getTime() - DAY_MS);
    return { title: '임금명세서가 정정됐어요', body: `${storeName} · ${monthDay(payslip.periodStart)}~${monthDay(lastDay)}`, path };
  }
  return {
    title: `${payslip.periodStart.getUTCMonth() + 1}월 임금명세서가 도착했어요`,
    body: `${storeName} · 실지급 ${formatWon(payslip.netPay)}`,
    path,
  };
}

/** 보낸 명세서마다 직원의 모든 기기에 알림. 더 못 쓰는 토큰은 지운다 (§6) */
export async function notifyPayslipsSent(db: DbClient, input: { payslipIds: string[]; push: PushSender }): Promise<void> {
  try {
    const payslips = await db.payslip.findMany({
      where: { id: { in: input.payslipIds } },
      include: { store: { select: { name: true } }, membership: { select: { user: { select: { pushTokens: true } } } } },
    });
    for (const payslip of payslips) {
      const tokens = payslip.membership.user.pushTokens.map((pushToken) => pushToken.token);
      await notifyDevices(db, { push: input.push, tokens, message: payslipPushMessage(payslip, payslip.store.name), logTag: 'payslip' });
    }
  } catch (error) {
    console.error('[payslip] 푸시 대상 조회·토큰 정리 실패', input.payslipIds, error);
  }
}
