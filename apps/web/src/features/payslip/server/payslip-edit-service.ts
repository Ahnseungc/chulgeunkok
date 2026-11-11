/**
 * 사장님 임금명세서 DRAFT 수정. 정본: docs/specs/payslip §3.3·§4.2·§7
 * 모든 수정은 명세서 행을 잠그고 다시 읽은 뒤 쓴다. 동기화(§4.3)와 같은 명세서를 동시에 고치지 않는다.
 */

import type { DeductionType, Payslip, PayslipLine, Prisma, PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import { mergeLines, totalsOf } from '../model/payslip-calc';
import { CUSTOM_CODE, type LineDraft } from '../model/payslip-types';
import type { AddPayslipLineBody, UpdatePayslipBody, UpdatePayslipLineBody } from '../schema';

import { getPayslip, type PayslipDetailDto } from './payslip-query-service';
import {
  applyLineWrites,
  lockPayslip,
  planLineWrites,
  previousSentLines,
  toDateColumn,
  toLineDraft,
  type StoredLineDraft,
} from './payslip-sync-service';

/** 새 CUSTOM 줄은 같은 종류 맨 뒤로 간다. resequence가 0부터 다시 매긴다 */
const APPEND_SORT_ORDER = Number.MAX_SAFE_INTEGER;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

type DraftWithLines = Payslip & { lines: PayslipLine[] };
type DraftEdit = (tx: Prisma.TransactionClient, draft: DraftWithLines) => Promise<void>;

interface PayslipActor {
  payslipId: string;
  actorUserId: string;
}

/** Owner 확인 → 잠금 → 다시 읽어 DRAFT 확인 → edit. 끝나면 상세를 돌려준다 */
async function editDraft(db: PrismaClient, input: PayslipActor, edit: DraftEdit): Promise<PayslipDetailDto> {
  const target = await db.payslip.findUnique({ where: { id: input.payslipId }, select: { storeId: true } });
  if (!target) throw new ApiError('NOT_FOUND');
  await requireMembership({ storeId: target.storeId, userId: input.actorUserId, action: 'PAYSLIP_WRITE' }, db);
  await db.$transaction(async (tx) => {
    await lockPayslip(tx, input.payslipId);
    const draft = await tx.payslip.findUniqueOrThrow({ where: { id: input.payslipId }, include: { lines: true } });
    if (draft.status !== 'DRAFT') throw new ApiError('PAYSLIP_NOT_EDITABLE');
    await edit(tx, draft);
  });
  return getPayslip(db, input);
}

/**
 * 고친 줄로 3.3% 공제를 다시 계산하고(§3.3) 저장된 줄과의 차이만 쓴 뒤 합계 스냅숏을 맞춘다.
 * 지급 계산 줄은 자기 자신을 fresh로 넘겨 그대로 둔다 (동기화 때만 새 계산값이 들어온다).
 */
async function saveLines(
  tx: Prisma.TransactionClient,
  draft: DraftWithLines,
  next: { lines: readonly LineDraft[]; deductionType?: DeductionType; previousSent?: readonly LineDraft[] },
): Promise<void> {
  const merged = mergeLines({
    current: next.lines,
    fresh: next.lines.filter((line) => line.kind === 'EARNING' && line.code !== CUSTOM_CODE),
    currentDeductionType: draft.deductionType,
    deductionType: next.deductionType ?? draft.deductionType,
    previousSent: next.previousSent ?? [],
  });
  await applyLineWrites(tx, draft.id, planLineWrites(draft.lines.map(toLineDraft), merged));
  await tx.payslip.update({ where: { id: draft.id }, data: { ...totalsOf(merged), deductionType: next.deductionType } });
}

const findLine = (draft: DraftWithLines, lineId: string): StoredLineDraft => {
  const line = draft.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw new ApiError('NOT_FOUND');
  return toLineDraft(line);
};

/**
 * 줄 금액 수정 (§4.2). 계산값으로 되돌리면 사유를 지우고, 계산값과 다르면 사유가 있어야 한다.
 * 계산값이 없는 줄(CUSTOM·수기 공제)은 사유 없이 바꾼다.
 */
function applyAmountEdit(line: StoredLineDraft, body: UpdatePayslipLineBody): StoredLineDraft {
  if (line.calculatedAmount === null) return { ...line, amount: body.amount, adjustReason: body.adjustReason ?? null };
  if (body.amount === line.calculatedAmount) return { ...line, amount: body.amount, adjustReason: null };
  if (!body.adjustReason) throw new ApiError('PAYSLIP_ADJUST_REASON_REQUIRED');
  return { ...line, amount: body.amount, adjustReason: body.adjustReason };
}

/** PUT /payslips/:id/lines/:lineId — §7 */
export async function upsertPayslipLine(
  db: PrismaClient,
  input: PayslipActor & { lineId: string; body: UpdatePayslipLineBody },
): Promise<PayslipDetailDto> {
  return editDraft(db, input, async (tx, draft) => {
    const edited = applyAmountEdit(findLine(draft, input.lineId), input.body);
    const lines = draft.lines.map((line) => (line.id === edited.id ? edited : toLineDraft(line)));
    await saveLines(tx, draft, { lines });
  });
}

/** POST /payslips/:id/lines — §7. 사장님이 넣는 줄은 CUSTOM, 계산값 없음 */
export async function addPayslipLine(
  db: PrismaClient,
  input: PayslipActor & { body: AddPayslipLineBody },
): Promise<PayslipDetailDto> {
  return editDraft(db, input, async (tx, draft) => {
    const { kind, label, basis, amount } = input.body;
    const added: LineDraft = {
      kind,
      code: CUSTOM_CODE,
      label,
      basis,
      amount,
      calculatedAmount: null,
      adjustReason: null,
      sortOrder: APPEND_SORT_ORDER,
    };
    await saveLines(tx, draft, { lines: [...draft.lines.map(toLineDraft), added] });
  });
}

/** DELETE /payslips/:id/lines/:lineId — §7. 계산 줄은 지우지 않고 0원으로 둔다 (§4.2) */
export async function deletePayslipLine(db: PrismaClient, input: PayslipActor & { lineId: string }): Promise<PayslipDetailDto> {
  return editDraft(db, input, async (tx, draft) => {
    const target = findLine(draft, input.lineId);
    if (target.code !== CUSTOM_CODE) {
      throw new ApiError('VALIDATION_FAILED', { message: '직접 추가한 항목만 지울 수 있어요. 금액을 0원으로 바꿔 주세요.' });
    }
    await saveLines(tx, draft, { lines: draft.lines.filter((line) => line.id !== target.id).map(toLineDraft) });
  });
}

/** PATCH /payslips/:id — §7. 지급일·정정 사유·공제 방식 (§3.3 공제 방식이 바뀌면 공제 줄 묶음을 새로 만든다) */
export async function updatePayslip(
  db: PrismaClient,
  input: PayslipActor & { body: UpdatePayslipBody },
): Promise<PayslipDetailDto> {
  return editDraft(db, input, async (tx, draft) => {
    const { payDate, correctionNote, deductionType } = input.body;
    if (correctionNote !== undefined && draft.version === 1) {
      throw new ApiError('VALIDATION_FAILED', { message: '정정 사유는 정정본에만 적을 수 있어요.' });
    }
    await tx.payslip.update({
      where: { id: draft.id },
      data: { payDate: payDate ? toDateColumn(payDate) : undefined, correctionNote },
    });
    if (!deductionType || deductionType === draft.deductionType) return;
    const previousSent =
      deductionType === 'SOCIAL_INSURANCE' ? await previousSentLines(tx, draft.membershipId, toIsoDate(draft.periodStart)) : [];
    await saveLines(tx, draft, { lines: draft.lines.map(toLineDraft), deductionType, previousSent });
  });
}
