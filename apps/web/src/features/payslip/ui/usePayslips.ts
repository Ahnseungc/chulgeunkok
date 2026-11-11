'use client';

import { useOnRevive } from '@ahnseungchan/webviewkit';
import { useState } from 'react';

import { apiFetch, ApiRequestError } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';

import type { PayslipListDto, PayslipListItemDto } from '../model/payslip-types';

/** "확인 필요 모두 보내기" 대상: 정정본이 아닌 DRAFT (정정본은 사유를 하나씩 적는다, §5.1) */
export function bulkSendTargetOf(items: readonly PayslipListItemDto[]) {
  const targets = items.filter((item) => item.status === 'DRAFT' && !item.isCorrection);
  return {
    payslipIds: targets.map((item) => item.payslipId),
    netPayTotal: targets.reduce((sum, item) => sum + item.netPay, 0),
    missingPayDate: targets.filter((item) => item.payDate === null).length,
    /** 미해결 근태가 남은 대상 수 (§4.3). 막지는 않고 경고만 */
    unresolved: targets.filter((item) => item.unresolvedCount > 0).length,
  };
}

/** 일괄 보내기 실패 문구. 막힌 명세서가 있으면 누구 것인지 앞에 붙인다 (§4.2 details.payslipId) */
function sendErrorText(error: unknown, items: readonly PayslipListItemDto[]): string {
  const blockedId = error instanceof ApiRequestError ? error.details?.payslipId : undefined;
  const blocked = items.find((item) => item.payslipId === blockedId);
  return blocked ? `${blocked.name}: ${errorMessageOf(error)}` : errorMessageOf(error);
}

/** 사장님 명세서 목록 + 일괄 보내기 — docs/specs/payslip §5.1 */
export function usePayslips(storeId: string) {
  const [periodStart, setPeriodStart] = useState<string | undefined>();
  const query = periodStart ? `?periodStart=${periodStart}` : '';
  const { data, errorMessage, reload } = useApiResource<PayslipListDto>(`/api/v1/stores/${storeId}/payslips${query}`);
  // 상세에서 고치거나 보낸 뒤 돌아오면 목록을 다시 불러온다
  useOnRevive(() => void reload());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const sendAll = async (payslipIds: string[]): Promise<boolean> => {
    setPending(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ sent: number }>(`/api/v1/stores/${storeId}/payslips/send`, {
        method: 'POST',
        body: JSON.stringify({ payslipIds }),
      });
      setMessage({ text: `${result.sent}명에게 보냈어요`, error: false });
      await reload();
      return true;
    } catch (error) {
      setMessage({ text: sendErrorText(error, data?.items ?? []), error: true });
      return false;
    } finally {
      setPending(false);
    }
  };

  return { data, errorMessage, setPeriodStart, pending, message, sendAll };
}
