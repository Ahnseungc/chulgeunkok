import type { PrismaClient } from '@chulgeunkok/db';
import { createTestDb } from '@chulgeunkok/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PushMessage, PushSender } from '@/server/integrations/push';

import { addPayslipLine, deletePayslipLine, updatePayslip, upsertPayslipLine } from './payslip-edit-service';
import { getPayslip, listStorePayslips } from './payslip-query-service';
import { sendPayslip, sendPayslips } from './payslip-send-service';

const kst = (local: string) => new Date(`${local}+09:00`);
const NOW = kst('2026-12-03T12:00:00');
const NOVEMBER = '2026-11-01';
const WAGE = 10320;
const NOVEMBER_MONDAYS = ['02', '09', '16', '23', '30'];
const GROSS = NOVEMBER_MONDAYS.length * 5 * WAGE;

let db: PrismaClient;
let close: () => Promise<void>;

interface FakePush extends PushSender {
  sent: [string, PushMessage][];
}

const fakePush = (result: 'SENT' | 'TOKEN_INVALID' = 'SENT'): FakePush => {
  const sent: [string, PushMessage][] = [];
  return {
    sent,
    send: async (token, message) => {
      sent.push([token, message]);
      return result;
    },
  };
};

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.user.createMany({
    data: [
      { id: 'owner', name: '김사장' },
      { id: 'staff', name: '이알바' },
      { id: 'reader', name: '박매니저' },
      { id: 'manager', name: '최매니저' },
    ],
  });
  await db.store.create({ data: { id: 'store', name: '골목카페', payDay: 10 } });
  await db.membership.createMany({
    data: [
      { id: 'm-owner', storeId: 'store', userId: 'owner', role: 'OWNER', joinedAt: kst('2026-06-01T00:00:00') },
      { id: 'm-staff', storeId: 'store', userId: 'staff', role: 'EMPLOYEE', joinedAt: kst('2026-06-02T00:00:00') },
      {
        id: 'm-reader',
        storeId: 'store',
        userId: 'reader',
        role: 'MANAGER',
        permissions: ['PAYROLL_READ'],
        joinedAt: kst('2026-06-03T00:00:00'),
      },
      { id: 'm-manager', storeId: 'store', userId: 'manager', role: 'MANAGER', joinedAt: kst('2026-06-04T00:00:00') },
    ],
  });
  await db.employmentTerms.create({
    data: {
      id: 't-staff',
      membershipId: 'm-staff',
      version: 1,
      effectiveFrom: kst('2026-06-01T00:00:00'),
      hourlyWage: WAGE,
      contractStartDate: new Date('2026-06-01'),
      createdById: 'owner',
      schedules: { create: [{ weekday: 1, startMinute: 18 * 60, workMinutes: 5 * 60 }] },
    },
  });
  // 11월 월요일 18:00–23:00
  await db.attendance.createMany({
    data: NOVEMBER_MONDAYS.map((day) => ({
      storeId: 'store',
      membershipId: 'm-staff',
      termsId: 't-staff',
      clockInAt: kst(`2026-11-${day}T18:00:00`),
      clockOutAt: kst(`2026-11-${day}T23:00:00`),
      status: 'CLOSED' as const,
    })),
  });
});

afterEach(async () => {
  await close();
});

const list = (actorUserId = 'owner') => listStorePayslips(db, { storeId: 'store', actorUserId, periodStart: NOVEMBER, now: NOW });

/** 목록을 열어 직원 DRAFT를 만들고 상세를 돌려준다 */
const openDraft = async () => {
  const { items } = await list();
  return getPayslip(db, { payslipId: items[0]?.payslipId ?? '', actorUserId: 'owner' });
};

const lineOf = (detail: { lines: { id: string; code: string; amount: number }[] }, code: string) =>
  detail.lines.find((l) => l.code === code);

const send = (payslipIds: string[], push: PushSender = fakePush(), actorUserId = 'owner') =>
  sendPayslips(db, { storeId: 'store', payslipIds, actorUserId, now: NOW, push });

const registerStaffToken = (token = 'fcm-staff') =>
  db.deviceCredential.create({
    data: { id: `dc-${token}`, userId: 'staff', tokenHash: `hash-${token}`, pushToken: { create: { userId: 'staff', token, platform: 'ios' } } },
  });

/** 11/2 퇴근을 1시간 늘려 보낸 명세서의 정정본을 만든다 */
const extendFirstShift = () =>
  db.attendance.updateMany({
    where: { membershipId: 'm-staff', clockInAt: kst('2026-11-02T18:00:00') },
    data: { clockOutAt: kst('2026-11-03T00:00:00') },
  });

describe('listStorePayslips', () => {
  it('목록을 열면 끝난 기간 DRAFT가 생겨 있다', async () => {
    const result = await list();
    expect(result.period.start).toBe(NOVEMBER);
    expect(result.counts).toEqual({ draft: 1, sent: 0, correction: 0 });
    expect(result.items).toEqual([
      expect.objectContaining({
        memberId: 'm-staff',
        name: '이알바',
        version: 1,
        status: 'DRAFT',
        netPay: GROSS,
        viewed: false,
        pushEnabled: false,
        isCorrection: false,
      }),
    ]);
  });

  it('푸시 토큰이 있으면 pushEnabled', async () => {
    await registerStaffToken();
    expect((await list()).items[0]?.pushEnabled).toBe(true);
  });
});

describe('명세서 수정', () => {
  it('계산 줄을 사유 없이 바꾸면 PAYSLIP_ADJUST_REASON_REQUIRED', async () => {
    const draft = await openDraft();
    const lineId = lineOf(draft, 'BASE_PAY')?.id ?? '';
    const edit = (body: { amount: number; adjustReason?: string }) =>
      upsertPayslipLine(db, { payslipId: draft.id, lineId, actorUserId: 'owner', body });
    await expect(edit({ amount: 250_000 })).rejects.toMatchObject({ code: 'PAYSLIP_ADJUST_REASON_REQUIRED' });

    const adjusted = await edit({ amount: 250_000, adjustReason: '합의' });
    expect([lineOf(adjusted, 'BASE_PAY')?.amount, adjusted.grossPay, adjusted.netPay]).toEqual([250_000, 250_000, 250_000]);

    const reverted = await edit({ amount: GROSS });
    expect(reverted.lines.find((l) => l.id === lineId)?.adjustReason).toBeNull();
  });

  it('지급이 바뀌면 3.3% 공제를 다시 계산한다', async () => {
    const draft = await openDraft();
    const switched = await updatePayslip(db, { payslipId: draft.id, actorUserId: 'owner', body: { deductionType: 'WITHHOLDING_3_3' } });
    expect([lineOf(switched, 'INCOME_TAX')?.amount, lineOf(switched, 'LOCAL_INCOME_TAX')?.amount]).toEqual([7_740, 770]);

    const added = await addPayslipLine(db, {
      payslipId: draft.id,
      actorUserId: 'owner',
      body: { kind: 'EARNING', label: '식대', basis: '', amount: 50_000 },
    });
    expect([lineOf(added, 'INCOME_TAX')?.amount, lineOf(added, 'LOCAL_INCOME_TAX')?.amount]).toEqual([9_240, 920]);
    expect([added.grossPay, added.totalDeduction, added.netPay]).toEqual([GROSS + 50_000, 10_160, GROSS + 50_000 - 10_160]);
  });

  it('CUSTOM이 아닌 줄은 지울 수 없다', async () => {
    const draft = await openDraft();
    const remove = (lineId: string) => deletePayslipLine(db, { payslipId: draft.id, lineId, actorUserId: 'owner' });
    await expect(remove(lineOf(draft, 'BASE_PAY')?.id ?? '')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const added = await addPayslipLine(db, {
      payslipId: draft.id,
      actorUserId: 'owner',
      body: { kind: 'EARNING', label: '식대', basis: '', amount: 50_000 },
    });
    const removed = await remove(lineOf(added, 'CUSTOM')?.id ?? '');
    expect([lineOf(removed, 'CUSTOM'), removed.grossPay]).toEqual([undefined, GROSS]);
  });

  it('SENT 명세서 수정은 PAYSLIP_NOT_EDITABLE', async () => {
    const draft = await openDraft();
    await send([draft.id]);
    await expect(
      updatePayslip(db, { payslipId: draft.id, actorUserId: 'owner', body: { payDate: '2026-12-11' } }),
    ).rejects.toMatchObject({ code: 'PAYSLIP_NOT_EDITABLE' });
    await expect(send([draft.id])).rejects.toMatchObject({ code: 'PAYSLIP_NOT_EDITABLE' });
  });
});

describe('sendPayslips', () => {
  it('지급일 없으면 보내기 실패', async () => {
    const draft = await openDraft();
    await db.payslip.update({ where: { id: draft.id }, data: { payDate: null } });
    await expect(send([draft.id])).rejects.toMatchObject({ code: 'PAYSLIP_PAY_DATE_REQUIRED' });
    expect((await db.payslip.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
  });

  it('공제가 지급보다 크면 PAYSLIP_NET_NEGATIVE', async () => {
    const draft = await openDraft();
    await addPayslipLine(db, {
      payslipId: draft.id,
      actorUserId: 'owner',
      body: { kind: 'DEDUCTION', label: '가불', basis: '', amount: GROSS + 1 },
    });
    await expect(send([draft.id])).rejects.toMatchObject({ code: 'PAYSLIP_NET_NEGATIVE' });
  });

  it('보내면 SENT, 이전 SENT는 SUPERSEDED, 토큰 있는 직원에게 푸시 1건', async () => {
    await registerStaffToken();
    const draft = await openDraft();
    const push = fakePush();
    expect(await sendPayslip(db, { payslipId: draft.id, actorUserId: 'owner', now: NOW, push })).toEqual({ sent: 1 });

    const sent = await db.payslip.findUniqueOrThrow({ where: { id: draft.id } });
    expect([sent.status, sent.sentById, sent.sentAt?.toISOString(), sent.employeeNumber]).toEqual([
      'SENT',
      'owner',
      NOW.toISOString(),
      2,
    ]);
    expect(push.sent).toEqual([
      ['fcm-staff', { title: '11월 임금명세서가 도착했어요', body: '골목카페 · 실지급 258,000원', path: `/me/payslips/${draft.id}` }],
    ]);

    await extendFirstShift();
    const { items, counts } = await list();
    expect([items[0]?.version, items[0]?.isCorrection, counts]).toEqual([2, true, { draft: 0, sent: 0, correction: 1 }]);
    await updatePayslip(db, { payslipId: items[0]?.payslipId ?? '', actorUserId: 'owner', body: { correctionNote: '11/2 퇴근 정정' } });
    await send([items[0]?.payslipId ?? '']);
    const statuses = await db.payslip.findMany({ where: { membershipId: 'm-staff' }, orderBy: { version: 'asc' } });
    expect(statuses.map((p) => p.status)).toEqual(['SUPERSEDED', 'SENT']);
  });

  it('정정본은 사유가 있어야 보내지고 알림 본문에 금액이 없다', async () => {
    await registerStaffToken();
    const first = await openDraft();
    await send([first.id]);
    await extendFirstShift();
    const correctionId = (await list()).items[0]?.payslipId ?? '';
    await expect(send([correctionId])).rejects.toMatchObject({ code: 'PAYSLIP_CORRECTION_NOTE_REQUIRED' });

    await updatePayslip(db, { payslipId: correctionId, actorUserId: 'owner', body: { correctionNote: '11/2 퇴근 정정' } });
    const push = fakePush();
    await send([correctionId], push);
    expect(push.sent).toEqual([
      ['fcm-staff', { title: '임금명세서가 정정됐어요', body: '골목카페 · 11/1~11/30', path: `/me/payslips/${correctionId}` }],
    ]);

    const detail = await getPayslip(db, { payslipId: correctionId, actorUserId: 'staff' });
    expect([detail.correctionNote, detail.previousSent?.id, detail.previousSent?.status]).toEqual([
      '11/2 퇴근 정정',
      first.id,
      'SUPERSEDED',
    ]);
  });

  it('TOKEN_INVALID면 PushToken이 지워지고 보내기는 성공', async () => {
    await registerStaffToken();
    const draft = await openDraft();
    expect(await send([draft.id], fakePush('TOKEN_INVALID'))).toEqual({ sent: 1 });
    expect(await db.pushToken.count()).toBe(0);
    expect((await db.payslip.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('SENT');
  });

  it('푸시 발송이 던져도 보내기는 성공', async () => {
    await registerStaffToken();
    const draft = await openDraft();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: PushSender = { send: async () => Promise.reject(new Error('fcm down')) };
    expect(await send([draft.id], failing)).toEqual({ sent: 1 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('권한', () => {
  it('PAYROLL_READ Manager는 조회만, 수정·보내기 FORBIDDEN', async () => {
    const draft = await openDraft();
    expect((await list('reader')).items).toHaveLength(1);
    expect((await getPayslip(db, { payslipId: draft.id, actorUserId: 'reader' })).id).toBe(draft.id);
    await expect(
      updatePayslip(db, { payslipId: draft.id, actorUserId: 'reader', body: { payDate: '2026-12-11' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(send([draft.id], fakePush(), 'reader')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('권한 없는 Manager는 조회도 FORBIDDEN', async () => {
    const draft = await openDraft();
    await expect(list('manager')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(getPayslip(db, { payslipId: draft.id, actorUserId: 'manager' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('본인은 DRAFT를 볼 수 없고 보낸 뒤에는 볼 수 있다', async () => {
    const draft = await openDraft();
    await expect(getPayslip(db, { payslipId: draft.id, actorUserId: 'staff' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await send([draft.id]);
    const mine = await getPayslip(db, { payslipId: draft.id, actorUserId: 'staff' });
    expect([mine.status, mine.netPay, mine.previousSent]).toEqual(['SENT', GROSS, null]);
  });
});
