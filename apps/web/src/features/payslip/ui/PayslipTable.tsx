import { ActionButton, Text } from '@seed-design/react';

import { formatWon as won } from '@/features/payroll/model/payroll-types';

import type { PayslipDetailDto, PayslipLineDto } from '../model/payslip-types';

import { LINE_KIND_LABEL } from './payslip-labels';

interface PayslipTableProps {
  payslip: PayslipDetailDto;
  /** 있으면 금액을 눌러 고친다 (사장님 DRAFT). 직원 화면은 넘기지 않는다 */
  onEditLine?: (line: PayslipLineDto) => void;
  /** 정정본에서 이전 보낸 본과 달라진 줄 */
  changedLineIds?: ReadonlySet<string>;
}

/** 지급·공제 표와 합계. 사장님 상세·직원 상세 공용 (docs/specs/payslip §3.1·§5.2·§5.3) */
export default function PayslipTable({ payslip, onEditLine, changedLineIds }: PayslipTableProps) {
  const sectionProps = { onEditLine, changedLineIds };
  return (
    <div className="payslip-tables">
      <LineTable kind="EARNING" lines={payslip.lines.filter((line) => line.kind === 'EARNING')} {...sectionProps} />
      <LineTable kind="DEDUCTION" lines={payslip.lines.filter((line) => line.kind === 'DEDUCTION')} {...sectionProps} />
      <dl className="payslip-totals">
        <dt>지급 총액</dt>
        <dd>{won(payslip.grossPay)}</dd>
        <dt>공제 총액</dt>
        <dd>{won(payslip.totalDeduction)}</dd>
        <dt>
          <Text textStyle="t5Bold">실지급액</Text>
        </dt>
        <dd>
          <Text textStyle="t6Bold">{won(payslip.netPay)}</Text>
        </dd>
      </dl>
    </div>
  );
}

interface LineTableProps extends Omit<PayslipTableProps, 'payslip'> {
  kind: PayslipLineDto['kind'];
  lines: PayslipLineDto[];
}

function LineTable({ kind, lines, onEditLine, changedLineIds }: LineTableProps) {
  return (
    <table className="payslip-table">
      <caption>
        <Text textStyle="t6Bold">{LINE_KIND_LABEL[kind]}</Text>
      </caption>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <th scope="row">
              <Text textStyle="t4Regular" color="fg.neutralMuted">
                {kind === 'DEDUCTION' ? '공제 없음' : '지급 항목 없음'}
              </Text>
            </th>
            <td />
          </tr>
        ) : (
          lines.map((line) => (
            <LineRow key={line.id} line={line} changed={changedLineIds?.has(line.id) ?? false} onEdit={onEditLine} />
          ))
        )}
      </tbody>
    </table>
  );
}

function LineRow({ line, changed, onEdit }: { line: PayslipLineDto; changed: boolean; onEdit?: (line: PayslipLineDto) => void }) {
  const adjusted = line.calculatedAmount !== null && line.amount !== line.calculatedAmount;
  return (
    <tr>
      <th scope="row">
        <div className="payslip-table__cell">
          <Text textStyle="t5Medium">
            {line.label} {changed ? <span className="badge badge--warning">바뀜</span> : null}
          </Text>
          {line.basis ? (
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              {line.basis}
            </Text>
          ) : null}
          {line.adjustReason ? (
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              바꾼 이유: {line.adjustReason}
            </Text>
          ) : null}
        </div>
      </th>
      <td>
        <div className="payslip-table__cell payslip-table__cell--amount">
          {onEdit ? (
            <ActionButton variant="ghost" size="small" aria-label={`${line.label} ${won(line.amount)} 고치기`} onClick={() => onEdit(line)}>
              {won(line.amount)}
            </ActionButton>
          ) : (
            <Text textStyle="t5Medium">{won(line.amount)}</Text>
          )}
          {adjusted ? (
            <Text textStyle="t3Regular" color="fg.neutralMuted">
              계산값 {won(line.calculatedAmount ?? 0)}
            </Text>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
