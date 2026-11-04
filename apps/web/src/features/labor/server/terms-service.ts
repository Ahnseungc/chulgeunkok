import type { EmploymentTerms, Membership, Prisma, PrismaClient } from '@chulgeunkok/db';

import { requireMembership } from '@/server/auth/require-membership';
import { ApiError } from '@/server/http/api-error';

import { evaluateTermsReviews } from '../model/labor-rules';
import type { CreateTermsResultDto, TermsDto } from '../model/labor-types';
import { toWorkMinutes, type CreateTermsInput } from '../schema';

import { dateColumn, findRuleSet, storeMidnight, toReviewDtos, toTermsDto } from './labor-context';

const toStartMinute = (time: string) => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * POST /stores/:storeId/members/:memberId/employment-terms — docs/specs/labor §3.2
 * 근로조건은 불변 버전이다. 새 버전을 만들고 이전 버전을 닫은 뒤 검토 항목을 만든다.
 */
export async function createEmploymentTerms(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string; body: CreateTermsInput; now: Date },
): Promise<CreateTermsResultDto> {
  await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'TERMS_WRITE' }, db);
  const rule = await findRuleSet(db, input.body.effectiveFrom);
  if (input.body.hourlyWage < rule.minimumHourlyWage && !input.body.confirmBelowMinimumWage) {
    throw new ApiError('MINIMUM_WAGE_CONFIRM_REQUIRED', {
      details: { minimumHourlyWage: rule.minimumHourlyWage },
    });
  }

  const created = await db.$transaction(async (tx) => {
    const member = await lockActiveMember(tx, { storeId: input.storeId, memberId: input.memberId });
    const effectiveFrom = storeMidnight(input.body.effectiveFrom);
    const version = await closeCurrentVersion(tx, { member, effectiveFrom, now: input.now });
    const terms = await tx.employmentTerms.create({
      data: {
        membershipId: member.id,
        version,
        effectiveFrom,
        hourlyWage: input.body.hourlyWage,
        scheduleVaries: input.body.scheduleVaries,
        averageWeeklyMinutesOverride: input.body.averageWeeklyMinutesOverride,
        weeklyHolidayWeekday: input.body.weeklyHolidayWeekday,
        contractStartDate: dateColumn(input.body.contractStartDate),
        contractEndDate: input.body.contractEndDate ? dateColumn(input.body.contractEndDate) : null,
        createdById: input.actorUserId,
        schedules: {
          create: input.body.schedules.map((schedule) => ({
            weekday: schedule.weekday,
            startMinute: toStartMinute(schedule.startTime),
            workMinutes: toWorkMinutes(schedule.startTime, schedule.endTime),
            breakMinutes: schedule.breakMinutes,
          })),
        },
      },
      include: { schedules: true },
    });
    const reviews = await createTermsReviews(tx, { terms, ruleVersion: rule.version, minimumHourlyWage: rule.minimumHourlyWage });
    return { terms, reviews };
  });

  return {
    terms: toTermsDto(created.terms),
    reviews: await toReviewDtos(db, { storeId: input.storeId, reviews: created.reviews, now: input.now }),
  };
}

/** GET …/employment-terms — 최신 버전부터. 직원 본인도 볼 수 있다 */
export async function listTermsHistory(
  db: PrismaClient,
  input: { storeId: string; actorUserId: string; memberId: string },
): Promise<TermsDto[]> {
  const actor = await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'MEMBER' }, db);
  const isSelf = actor.id === input.memberId;
  if (!isSelf) {
    await requireMembership({ storeId: input.storeId, userId: input.actorUserId, action: 'TERMS_READ' }, db);
  }
  const history = await db.employmentTerms.findMany({
    where: { membershipId: input.memberId, membership: { storeId: input.storeId } },
    include: { schedules: true },
    orderBy: { version: 'desc' },
  });
  return history.map(toTermsDto);
}

async function lockActiveMember(tx: Prisma.TransactionClient, input: { storeId: string; memberId: string }) {
  const member = await tx.membership.findFirst({ where: { id: input.memberId, storeId: input.storeId } });
  if (!member) throw new ApiError('NOT_FOUND');
  if (member.status !== 'ACTIVE') {
    throw new ApiError('CONFLICT', { message: '퇴사 처리된 직원이에요. 기기 재등록으로 복귀시킨 뒤 등록해 주세요.' });
  }
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${member.id} FOR UPDATE`;
  return member;
}

/**
 * 열린 버전을 새 버전 시작 시각에 닫고, 새 버전 번호를 돌려준다.
 * - 새 시작이 열린 버전 시작보다 이르면 TERMS_EFFECTIVE_BEFORE_CURRENT
 * - 새 시작 이후의 근무 기록이 열린 버전에 이미 있으면 TERMS_HAS_LATER_ATTENDANCE (그 근무의 시급이 바뀌면 안 된다)
 * - 같은 날 시작이고 근무 기록이 없으면 열린 버전을 지우고 대체한다 (등록 직후 오타 수정)
 */
async function closeCurrentVersion(
  tx: Prisma.TransactionClient,
  input: { member: Membership; effectiveFrom: Date; now: Date },
): Promise<number> {
  const latest = await tx.employmentTerms.findFirst({
    where: { membershipId: input.member.id },
    orderBy: { version: 'desc' },
  });
  if (!latest) return 1;
  const open = latest.effectiveTo === null ? latest : null;
  if (open) await assertCanClose(tx, { open, effectiveFrom: input.effectiveFrom });

  if (open && open.effectiveFrom.getTime() === input.effectiveFrom.getTime()) {
    await supersedeTermsReviews(tx, { termsId: open.id });
    await tx.employmentTerms.delete({ where: { id: open.id } });
  } else if (open) {
    await tx.employmentTerms.update({ where: { id: open.id }, data: { effectiveTo: input.effectiveFrom } });
    await supersedeTermsReviews(tx, { termsId: open.id });
  }
  return latest.version + 1;
}

async function assertCanClose(tx: Prisma.TransactionClient, input: { open: EmploymentTerms; effectiveFrom: Date }) {
  if (input.effectiveFrom < input.open.effectiveFrom) throw new ApiError('TERMS_EFFECTIVE_BEFORE_CURRENT');
  const laterAttendance = await tx.attendance.findFirst({
    where: { termsId: input.open.id, clockInAt: { gte: input.effectiveFrom } },
  });
  if (laterAttendance) throw new ApiError('TERMS_HAS_LATER_ATTENDANCE');
}

/** 이전 버전에서 나온, 아직 처리하지 않은 안내는 새 버전으로 대체됐다 */
async function supersedeTermsReviews(tx: Prisma.TransactionClient, input: { termsId: string }) {
  await tx.laborReview.updateMany({
    where: {
      sourceType: 'EMPLOYMENT_TERMS',
      sourceId: input.termsId,
      status: { in: ['OPEN', 'NEEDS_INFORMATION'] },
    },
    data: { status: 'SUPERSEDED' },
  });
}

async function createTermsReviews(
  tx: Prisma.TransactionClient,
  input: {
    terms: EmploymentTerms & { schedules: { weekday: number; workMinutes: number; breakMinutes: number }[] };
    ruleVersion: string;
    minimumHourlyWage: number;
  },
) {
  const findings = evaluateTermsReviews(input.terms, { minimumHourlyWage: input.minimumHourlyWage });
  return Promise.all(
    findings.map((finding) =>
      tx.laborReview.create({
        data: {
          membershipId: input.terms.membershipId,
          type: finding.type,
          status: finding.status,
          reasonCode: finding.reasonCode,
          sourceType: 'EMPLOYMENT_TERMS',
          sourceId: input.terms.id,
          ruleVersion: input.ruleVersion,
        },
      }),
    ),
  );
}
