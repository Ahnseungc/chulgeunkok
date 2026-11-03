import { z } from 'zod';

const InvitableRole = z.enum(['EMPLOYEE', 'MANAGER']);

/** docs/specs/staff §3.1 — 새 직원 초대 또는 기존 직원 기기 재등록 */
export const CreateInvitationBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('JOIN'), role: InvitableRole.default('EMPLOYEE') }),
  z.object({ kind: z.literal('REREGISTER'), memberId: z.string().min(1) }),
]);

export type CreateInvitationInput = z.infer<typeof CreateInvitationBody>;

/** docs/specs/staff §3.3 — 이 기기가 아직 등록되지 않은 새 직원만 이름이 필요하다 */
export const AcceptInvitationBody = z.object({
  name: z.string().trim().min(1).max(20).optional(),
});

/** 초대 토큰 형식 (generateToken: base64url 43자) */
export const InvitationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const InvitationListQuery = z.object({
  status: z.enum(['pending']).default('pending'),
});

/** docs/specs/staff §4.2 */
export const UpdateMemberBody = z
  .object({
    role: InvitableRole.optional(),
    permissions: z.array(z.enum(['PAYROLL_READ', 'TERMS_EDIT'])).optional(),
    status: z.literal('INACTIVE').optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '바꿀 값을 입력해 주세요.' });

export const MemberListQuery = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
