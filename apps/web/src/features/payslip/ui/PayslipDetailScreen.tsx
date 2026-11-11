'use client';

import { ActionButton, Text } from '@seed-design/react';
import { useEffect, useState } from 'react';

import { DEDUCTION_TYPE_LABEL, type DeductionTypeValue } from '@/features/labor/model/labor-types';
import { formatWon as won } from '@/features/payroll/model/payroll-types';
import { formatDuration, formatLocalDate, formatPeriodRange, toStoreLocalDate } from '@/shared/lib/format-time';
import { PageStaggerEntrance, PageStaggerEntranceItem } from '@/shared/motion/PageStaggerEntrance';
import { AppLink } from '@/shared/ui/AppLink';
import InlineAlert from '@/shared/ui/InlineAlert';
import LabeledTextField from '@/shared/ui/LabeledTextField';
import ScreenHeader from '@/shared/ui/ScreenHeader';
import Sheet from '@/shared/ui/Sheet';
import { TEXT_PLACEHOLDER } from '@/shared/ui/text-placeholder';

import type { PayslipDetailDto } from '../model/payslip-types';

import LineEditSheet, { type LineEditTarget } from './LineEditSheet';
import { payslipChipOf } from './payslip-labels';
import PayslipTable from './PayslipTable';
import { changedLineIdsOf, usePayslipDetail } from './usePayslipDetail';

const SECOND_MS = 1000;
const NOTE_MAX_LENGTH = 200;
const DEDUCTION_TYPES = ['NONE', 'WITHHOLDING_3_3', 'SOCIAL_INSURANCE'] as const satisfies readonly DeductionTypeValue[];

interface PayslipDetailScreenProps {
  storeId: string;
  payslipId: string;
}

/** `/owner/[storeId]/payslips/[payslipId]` — docs/specs/payslip §5.2 */
export default function PayslipDetailScreen({ storeId, payslipId }: PayslipDetailScreenProps) {
  const detail = usePayslipDetail(payslipId);
  const { payslip } = detail;
  const [editing, setEditing] = useState<LineEditTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => setNote(payslip?.correctionNote ?? ''), [payslip?.correctionNote]);

  const isDraft = payslip?.status === 'DRAFT';
  const isCorrection = (payslip?.version ?? 1) > 1;
  const canSend = isDraft && (!isCorrection || note.trim().length > 0);
  const title = payslip ? `${payslip.employeeName}님 임금명세서` : '임금명세서';

  const closeEditor = () => {
    setEditing(null);
    detail.clearError();
  };
  const afterWrite = (saved: boolean) => saved && closeEditor();
  const handleSend = async () => {
    const sent = await detail.send(isCorrection ? note.trim() : null);
    if (sent) setConfirmOpen(false);
  };

  return (
    <main className="screen">
      <ScreenHeader backHref={`/owner/${storeId}/payslips`} backLabel="임금명세서" title={title} />
      <header className="member-header">
        <Text as="h1" textStyle="t8Bold">
          {title}
        </Text>
        <Text textStyle="t5Regular">
          {payslip ? `${formatPeriodRange(payslip.periodStart, payslip.periodEnd)} · 사원번호 ${payslip.employeeNumber}` : TEXT_PLACEHOLDER}
        </Text>
        {payslip ? <StatusLine payslip={payslip} /> : null}
        {payslip && !isDraft && payslip.correctionNote ? (
          <Text textStyle="t4Regular" color="fg.neutralMuted">
            정정 사유: {payslip.correctionNote}
          </Text>
        ) : null}
      </header>
      <InlineAlert message={detail.loadErrorMessage} />
      {payslip ? (
        <PageStaggerEntrance className="motion-contents">
          {payslip.previousSent ? (
            <PageStaggerEntranceItem>
              <AppLink className="dash-card unresolved-banner" href={`/owner/${storeId}/payslips/${payslip.previousSent.id}`}>
                <Text textStyle="t5Bold">이전에 보낸 명세서</Text>
                <Text textStyle="t4Regular" color="fg.neutralMuted">
                  실지급 {won(payslip.previousSent.netPay)} · 바뀐 항목은 &lsquo;바뀜&rsquo;으로 표시했어요
                </Text>
              </AppLink>
            </PageStaggerEntranceItem>
          ) : null}
          <PageStaggerEntranceItem>
            <WorkSummary payslip={payslip} />
          </PageStaggerEntranceItem>
          {isDraft ? (
            <PageStaggerEntranceItem className="screen-stack">
              <DraftFields payslip={payslip} pending={detail.pending} onPayDate={detail.savePayDate} onDeductionType={detail.saveDeductionType} />
            </PageStaggerEntranceItem>
          ) : null}
          <PageStaggerEntranceItem className="screen-stack">
            <PayslipTable
              payslip={payslip}
              changedLineIds={changedLineIdsOf(payslip)}
              onEditLine={isDraft ? (line) => setEditing({ mode: 'edit', line }) : undefined}
            />
            {isDraft ? (
              <ActionButton variant="neutralWeak" size="medium" onClick={() => setEditing({ mode: 'add' })}>
                항목 추가
              </ActionButton>
            ) : null}
          </PageStaggerEntranceItem>
          {isDraft && isCorrection ? (
            <PageStaggerEntranceItem>
              <LabeledTextField
                label="정정 사유 (직원에게 보여요)"
                value={note}
                onValueChange={setNote}
                maxLength={NOTE_MAX_LENGTH}
                placeholder="예: 11/2 퇴근 시각을 고쳤어요"
              />
            </PageStaggerEntranceItem>
          ) : null}
        </PageStaggerEntrance>
      ) : null}

      <InlineAlert message={editing || confirmOpen ? null : detail.errorMessage} textStyle="t4Regular" />
      {payslip && !isDraft ? null : (
        <div className="punch-bottom">
          <ActionButton variant="neutralSolid" size="large" flexGrow loading={!payslip} disabled={!canSend} onClick={() => setConfirmOpen(true)}>
            보내기
          </ActionButton>
        </div>
      )}

      <LineEditSheet
        target={editing}
        pending={detail.pending}
        errorMessage={detail.errorMessage}
        onClose={closeEditor}
        onSave={(line, amount, reason) => void detail.saveLine(line.id, amount, reason).then(afterWrite)}
        onAdd={(values) => void detail.addLine(values).then(afterWrite)}
        onDelete={(line) => void detail.deleteLine(line.id).then(afterWrite)}
      />
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`${payslip?.employeeName ?? ''}님에게 보낼까요?`}>
        <Text as="p" textStyle="t5Bold">
          실지급 {won(payslip?.netPay ?? 0)} · 지급일 {payslip?.payDate ? formatLocalDate(payslip.payDate) : '없음'}
        </Text>
        <Text as="p" textStyle="t4Regular" color="fg.neutralMuted">
          보내면 직원 앱에 알림이 가요. 보낸 명세서는 고칠 수 없어요.
        </Text>
        <InlineAlert message={confirmOpen ? detail.errorMessage : null} textStyle="t4Regular" />
        <div className="sheet__actions">
          <ActionButton variant="neutralWeak" size="large" flexGrow onClick={() => setConfirmOpen(false)}>
            취소
          </ActionButton>
          <ActionButton variant="neutralSolid" size="large" flexGrow loading={detail.pending} onClick={() => void handleSend()}>
            보내기
          </ActionButton>
        </div>
      </Sheet>
    </main>
  );
}

function StatusLine({ payslip }: { payslip: PayslipDetailDto }) {
  const chip = payslipChipOf(payslip);
  if (payslip.status === 'DRAFT' || !payslip.sentAt) {
    return (
      <div className="badges">
        <span className={chip.className}>{chip.label}</span>
      </div>
    );
  }
  return (
    <Text textStyle="t4Regular" color="fg.neutralMuted">
      {payslip.status === 'SUPERSEDED' ? '이전 버전 · ' : ''}
      {formatLocalDate(toStoreLocalDate(new Date(payslip.sentAt)))} 보냄 · {payslip.viewedAt ? '읽음' : '아직 안 읽음'}
    </Text>
  );
}

export function WorkSummary({ payslip }: { payslip: PayslipDetailDto }) {
  const hours = (seconds: number) => formatDuration(seconds * SECOND_MS);
  const extra = [
    payslip.overtimeSeconds > 0 ? `연장 ${hours(payslip.overtimeSeconds)}` : null,
    payslip.nightSeconds > 0 ? `야간 ${hours(payslip.nightSeconds)}` : null,
    payslip.holidaySeconds > 0 ? `휴일 ${hours(payslip.holidaySeconds)}` : null,
  ].filter((text): text is string => text !== null);
  return (
    <dl className="terms-summary">
      <dt>지급일</dt>
      <dd>{payslip.payDate ? formatLocalDate(payslip.payDate) : '아직 없음'}</dd>
      <dt>근로일수</dt>
      <dd>{payslip.workDays}일</dd>
      <dt>총 근로시간</dt>
      <dd>{payslip.recognizedSeconds > 0 ? hours(payslip.recognizedSeconds) : '0시간'}</dd>
      {extra.length > 0 ? (
        <>
          <dt>연장·야간·휴일</dt>
          <dd>{extra.join(' · ')}</dd>
        </>
      ) : null}
      <dt>공제 방식</dt>
      <dd>{DEDUCTION_TYPE_LABEL[payslip.deductionType]}</dd>
    </dl>
  );
}

interface DraftFieldsProps {
  payslip: PayslipDetailDto;
  pending: boolean;
  onPayDate: (payDate: string) => Promise<boolean>;
  onDeductionType: (deductionType: DeductionTypeValue) => Promise<boolean>;
}

/** 지급일·공제 방식은 바꾸면 바로 저장한다 (매장 설정 정산 시작일과 같은 방식) */
function DraftFields({ payslip, pending, onPayDate, onDeductionType }: DraftFieldsProps) {
  return (
    <>
      <LabeledTextField
        label="지급일"
        type="date"
        value={payslip.payDate ?? ''}
        disabled={pending}
        onValueChange={(payDate) => payDate && void onPayDate(payDate)}
      />
      <label className="labeled-field">
        <Text as="span" textStyle="t4Medium">
          공제 방식 (이 명세서만)
        </Text>
        <select
          className="native-select"
          value={payslip.deductionType}
          disabled={pending}
          onChange={(event) => {
            const next = DEDUCTION_TYPES.find((type) => type === event.target.value);
            if (next) void onDeductionType(next);
          }}
        >
          {DEDUCTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {DEDUCTION_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
