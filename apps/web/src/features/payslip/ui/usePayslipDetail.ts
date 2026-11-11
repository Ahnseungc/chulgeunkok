'use client';

import { useEffect, useState } from 'react';

import type { DeductionTypeValue } from '@/features/labor/model/labor-types';
import { apiFetch } from '@/shared/lib/api-client';
import { errorMessageOf, useApiResource } from '@/shared/lib/useApiResource';

import type { PayslipDetailDto, PayslipLineDto } from '../model/payslip-types';

export interface NewLineValues {
  kind: PayslipLineDto['kind'];
  label: string;
  basis: string;
  amount: number;
}

const lineKey = (line: PayslipLineDto) => `${line.kind}:${line.code}:${line.label}`;

/** 정정본에서 이전 보낸 본과 금액이 다르거나 새로 생긴 줄 (§5.2 강조) */
export function changedLineIdsOf(payslip: PayslipDetailDto): Set<string> {
  if (!payslip.previousSent) return new Set();
  const previous = new Map(payslip.previousSent.lines.map((line) => [lineKey(line), line.amount]));
  return new Set(payslip.lines.filter((line) => previous.get(lineKey(line)) !== line.amount).map((line) => line.id));
}

/** 사장님 명세서 상세 조회·수정·보내기 — docs/specs/payslip §4.2·§5.2·§7. 수정 응답이 최신 상세라 바로 반영한다 */
export function usePayslipDetail(payslipId: string) {
  const path = `/api/v1/payslips/${payslipId}`;
  const resource = useApiResource<PayslipDetailDto>(path);
  const [payslip, setPayslip] = useState<PayslipDetailDto | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) setPayslip(resource.data);
  }, [resource.data]);

  /** 성공하면 true. 실패 문구는 errorMessage 로 */
  const write = async (url: string, method: 'PATCH' | 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<boolean> => {
    setPending(true);
    setErrorMessage(null);
    try {
      setPayslip(await apiFetch<PayslipDetailDto>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }));
      return true;
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
      return false;
    } finally {
      setPending(false);
    }
  };

  /** 정정 사유가 바뀌었으면 먼저 저장하고 보낸다. 보내기 응답은 건수라 상세를 다시 읽는다 */
  const send = async (correctionNote: string | null): Promise<boolean> => {
    if (correctionNote !== null && correctionNote !== payslip?.correctionNote) {
      if (!(await write(path, 'PATCH', { correctionNote }))) return false;
    }
    setPending(true);
    setErrorMessage(null);
    try {
      await apiFetch(`${path}/send`, { method: 'POST' });
      setPayslip(await apiFetch<PayslipDetailDto>(path));
      return true;
    } catch (error) {
      setErrorMessage(errorMessageOf(error));
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    payslip,
    loadErrorMessage: resource.errorMessage,
    pending,
    errorMessage,
    clearError: () => setErrorMessage(null),
    savePayDate: (payDate: string) => write(path, 'PATCH', { payDate }),
    saveDeductionType: (deductionType: DeductionTypeValue) => write(path, 'PATCH', { deductionType }),
    saveLine: (lineId: string, amount: number, adjustReason: string | undefined) =>
      write(`${path}/lines/${lineId}`, 'PUT', { amount, adjustReason }),
    addLine: (values: NewLineValues) => write(`${path}/lines`, 'POST', values),
    deleteLine: (lineId: string) => write(`${path}/lines/${lineId}`, 'DELETE'),
    send,
  };
}
