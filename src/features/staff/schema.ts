import { z } from 'zod';

import { KoreanMobilePhone } from '@/shared/schema/common';

const InvitableRole = z.enum(['EMPLOYEE', 'MANAGER']);

/** docs/specs/staff §3.1 */
export const CreateInvitationBody = z.object({
  role: InvitableRole.default('EMPLOYEE'),
  phone: KoreanMobilePhone.optional(),
});

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
